import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  TERRAIN_WIDTH,
  TERRAIN_LENGTH,
  GRID_SEGMENTS_X,
  GRID_SEGMENTS_Z,
  WATER_LEVEL,
  heightGrid,
  surfaceGrid,
  asphaltCurve,
  dirtCurve,
  riverCurve,
  FALLEN_LOGS,
  FOREST_TREES,
  CANYON_ROCKS,
  getTerrainHeightOnly,
  computeCanopyAmbientOcclusion,
} from '../world/terrainData';
import { simplex2D } from '../math/noise';
import { mutablePhysics } from '../state/gameStore';

// Crisp "Firewatch / Lonely Mountains / A Short Hike" matte clay palette
const PALETTE = {
  GRASS_MID: new THREE.Color('#3b694c'),
  GRASS_WARM: new THREE.Color('#6b8e4e'),
  ROCK_LIGHT: new THREE.Color('#7a8288'),
  ROCK_DARK: new THREE.Color('#555d66'),
  ROCK_STRATA: new THREE.Color('#444c54'),
  ALPINE_SNOW: new THREE.Color('#e8eff5'),
  SAND: new THREE.Color('#d2b48c'),
  LAKE_BED: new THREE.Color('#1c434d'),
  AO_SHADOW: new THREE.Color('#182b23'),
};

// Shared uniform for GPU vertex shader wind & water sway (updated in useFrame, zero CPU overhead)
const windUniforms = {
  uTime: { value: 0 },
};

function injectWindShader(shader: THREE.WebGLProgramParametersWithUniforms, swayStrength: number) {
  shader.uniforms.uTime = windUniforms.uTime;
  shader.vertexShader =
    `uniform float uTime;\n` +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 worldInstancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float heightMask = max(0.0, position.y + 0.5);
        float gust = sin(uTime * 2.1 + worldInstancePos.x * 0.14 + worldInstancePos.z * 0.11)
                   + 0.45 * cos(uTime * 3.6 + worldInstancePos.x * 0.27);
        transformed.x += gust * heightMask * ${swayStrength.toFixed(4)};
        transformed.z += gust * heightMask * ${(swayStrength * 0.6).toFixed(4)};
      #endif
      `
    );
}

/**
 * Builds a continuous, terrain-conforming smooth spline ribbon with integrated
 * cambered shoulders that tuck cleanly into the ground (zero jagged grid triangles).
 */
function createSplineRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  segments: number,
  halfWidth: number,
  yOffset: number,
  coreColorHex: string,
  shoulderColorHex: string,
  isEarthyDirt = false
): THREE.BufferGeometry {
  const crossPts = isEarthyDirt ? 13 : 9;
  const positions = new Float32Array((segments + 1) * crossPts * 3);
  const colors = new Float32Array((segments + 1) * crossPts * 3);
  const uvs = new Float32Array((segments + 1) * crossPts * 2);
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const cCore = new THREE.Color(coreColorHex);
  const cShoulder = new THREE.Color(shoulderColorHex);
  const cDarkLoam = new THREE.Color('#5a311b');
  const cDryGravel = new THREE.Color('#b37a52');
  const cRut = new THREE.Color('#4a2715');
  const tmpCol = new THREE.Color();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPoint(t, pt);
    curve.getTangent(t, tangent);
    // In right-handed coords (+X East, +Y Up, +Z South), for (d - a) x (b - a) to point +Y Up:
    // tangent is (+Z), so lateral vector (+X) must be (+tangent.z, -tangent.x)
    const rightX = tangent.z;
    const rightZ = -tangent.x;
    const len = Math.hypot(rightX, rightZ) || 1;
    const nx = rightX / len;
    const nz = rightZ / len;

    // Organic width meander for dirt singletrack so edges aren't ruler-straight
    const widthWarp = isEarthyDirt
      ? 1.0 + simplex2D(pt.x * 0.09, pt.z * 0.09) * 0.14 + simplex2D(pt.x * 0.28, pt.z * 0.28) * 0.06
      : 1.0;

    for (let c = 0; c < crossPts; c++) {
      const u = (c / (crossPts - 1)) * 2 - 1; // -1 to +1
      const absU = Math.abs(u);
      const effectiveHalfW = halfWidth * (isEarthyDirt ? THREE.MathUtils.lerp(1.0, widthWarp, absU) : 1.0);
      const wx = pt.x + nx * effectiveHalfW * u;
      const wz = pt.z + nz * effectiveHalfW * u;

      // Smoothly arched road/trail bed that tucks edges (-0.09m) into the terrain
      // so the underlying terrain never pokes through or shows sawtooth borders
      let heightProfile = yOffset;
      if (isEarthyDirt) {
        const nMacro = simplex2D(wx * 0.14, wz * 0.14);
        const nMed = simplex2D(wx * 0.52, wz * 0.52);
        // Subtle worn tire rut in the very center + gravelly outer berm
        const rutDip = Math.exp(- (u * u) / 0.06) * 0.028;
        const bermBulge = Math.exp(- Math.pow(absU - 0.52, 2) / 0.04) * (0.035 + Math.max(0, nMacro) * 0.025);

        if (absU <= 0.72) {
          const normU = absU / 0.72;
          heightProfile = yOffset + (1 - normU * normU) * 0.055 - rutDip + bermBulge;

          // Base cedar clay mixed with dark forest loam & dry sandy gravel patches
          tmpCol.copy(cCore);
          if (nMacro > 0) {
            tmpCol.lerp(cDryGravel, nMacro * 0.55);
          } else {
            tmpCol.lerp(cDarkLoam, -nMacro * 0.65);
          }
          // Outer berm catches drier gravel / pine needles
          const bermMix = THREE.MathUtils.smoothstep(absU, 0.28, 0.68);
          tmpCol.lerp(cDryGravel, bermMix * 0.35 + Math.max(0, nMed) * 0.2);

          // Worn central singletrack tire line (packed dark earth)
          const rutFactor = Math.exp(- Math.pow(u - nMacro * 0.12, 2) / 0.045);
          tmpCol.lerp(cRut, rutFactor * 0.48);
        } else {
          // Noise-warped organic transition into forest moss
          const noisyEdge = THREE.MathUtils.clamp(
            (absU - 0.72 + nMed * 0.07) / 0.28,
            0,
            1
          );
          const smoothEdge = noisyEdge * noisyEdge * (3 - 2 * noisyEdge);
          heightProfile = THREE.MathUtils.lerp(yOffset, -0.09, smoothEdge);
          tmpCol.copy(cCore).lerp(cDarkLoam, 0.3).lerp(cShoulder, smoothEdge);
        }
      } else if (absU <= 0.72) {
        const normU = absU / 0.72;
        heightProfile = yOffset + (1 - normU * normU) * 0.06;
        tmpCol.copy(cCore);
      } else {
        const edgeT = (absU - 0.72) / 0.28; // 0 to 1 at outer lip
        const smoothEdge = edgeT * edgeT * (3 - 2 * edgeT);
        heightProfile = THREE.MathUtils.lerp(yOffset, -0.09, smoothEdge);
        tmpCol.copy(cCore).lerp(cShoulder, smoothEdge);
      }

      const wy = getTerrainHeightOnly(wx, wz) + heightProfile;

      const vIdx = (i * crossPts + c) * 3;
      positions[vIdx] = wx;
      positions[vIdx + 1] = wy;
      positions[vIdx + 2] = wz;

      colors[vIdx] = tmpCol.r;
      colors[vIdx + 1] = tmpCol.g;
      colors[vIdx + 2] = tmpCol.b;

      const uvIdx = (i * crossPts + c) * 2;
      uvs[uvIdx] = u; // -1..1 across trail width
      uvs[uvIdx + 1] = t * 140.0; // longitudinal distance coordinates
    }

    if (i < segments) {
      for (let c = 0; c < crossPts - 1; c++) {
        const a = i * crossPts + c;
        const b = a + 1;
        const d = (i + 1) * crossPts + c;
        const e = d + 1;
        indices.push(a, d, b);
        indices.push(b, d, e);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates dashed yellow center-line quads along the road spline.
 */
function createDashedCenterLineGeometry(
  curve: THREE.CatmullRomCurve3,
  totalDashes: number,
  halfWidth: number,
  yOffset: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const pt0 = new THREE.Vector3();
  const pt1 = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let vCount = 0;

  for (let i = 0; i < totalDashes; i++) {
    const t0 = (i + 0.15) / totalDashes;
    const t1 = (i + 0.62) / totalDashes;
    if (t1 >= 0.98) continue;

    curve.getPoint(t0, pt0);
    curve.getPoint(t1, pt1);
    curve.getTangent((t0 + t1) * 0.5, tangent);

    const rightX = tangent.z;
    const rightZ = -tangent.x;
    const len = Math.hypot(rightX, rightZ) || 1;
    const nx = (rightX / len) * halfWidth;
    const nz = (rightZ / len) * halfWidth;

    const y0 = getTerrainHeightOnly(pt0.x, pt0.z) + yOffset;
    const y1 = getTerrainHeightOnly(pt1.x, pt1.z) + yOffset;

    positions.push(
      pt0.x - nx, y0, pt0.z - nz,
      pt0.x + nx, y0, pt0.z + nz,
      pt1.x - nx, y1, pt1.z - nz,
      pt1.x + nx, y1, pt1.z + nz
    );

    indices.push(vCount, vCount + 2, vCount + 1);
    indices.push(vCount + 1, vCount + 2, vCount + 3);
    vCount += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export const TerrainChunk: React.FC = () => {
  const tentFabricMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const campLightRef = useRef<THREE.PointLight>(null);
  const fireEmberMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // 1. Build smooth indexed, vertex-colored 1,000m terrain geometry (zero jagged triangle facets)
  const terrainGeometry = useMemo(() => {
    const baseGeo = new THREE.PlaneGeometry(
      TERRAIN_WIDTH,
      TERRAIN_LENGTH,
      GRID_SEGMENTS_X,
      GRID_SEGMENTS_Z
    );
    baseGeo.rotateX(-Math.PI / 2);

    const posAttr = baseGeo.attributes.position;
    const cols = GRID_SEGMENTS_X + 1;

    for (let i = 0; i < posAttr.count; i++) {
      const ix = i % cols;
      const iz = Math.floor(i / cols);
      const gridIdx = iz * cols + ix;
      posAttr.setY(i, heightGrid[gridIdx]);
    }

    // Compute smooth shared vertex normals so the headlamp & sunlight glide over hills without triangle facets!
    baseGeo.computeVertexNormals();

    const normAttr = baseGeo.attributes.normal;
    const colors = new Float32Array(posAttr.count * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const cx = posAttr.getX(i);
      const cy = posAttr.getY(i);
      const cz = posAttr.getZ(i);
      const ny = normAttr.getY(i);

      const ix = i % cols;
      const iz = Math.floor(i / cols);
      const sCode = surfaceGrid[iz * cols + ix];
      const jitter = simplex2D(cx * 0.05, cz * 0.05) * 0.025;

      // Base meadow grass color with smooth altitude gradient up to 210m alpine summit
      const altBlend = THREE.MathUtils.clamp((cy - 25) / 110, 0, 1);
      tmpColor.copy(PALETTE.GRASS_MID).lerp(PALETTE.GRASS_WARM, altBlend);

      if (cy < WATER_LEVEL - 0.15) {
        const depthBlend = THREE.MathUtils.clamp((WATER_LEVEL - 0.15 - cy) / 1.8, 0, 1);
        tmpColor.lerp(PALETTE.LAKE_BED, depthBlend);
      } else if (sCode === 4 || (cy < WATER_LEVEL + 1.8 && cz > 205)) {
        const sandBlend = THREE.MathUtils.clamp(1.0 - (cy - WATER_LEVEL) / 1.8, 0, 1);
        tmpColor.lerp(PALETTE.SAND, Math.max(sCode === 4 ? 0.75 : 0, sandBlend));
      } else if (ny < 0.82 || sCode === 3) {
        const rockBlend = THREE.MathUtils.clamp((0.82 - ny) / 0.22, 0, 1);
        const strata = Math.sin(cy * 0.65 + simplex2D(cx * 0.03, cz * 0.03) * 2.2);
        const rockCol =
          strata > 0.55
            ? PALETTE.ROCK_STRATA
            : ny < 0.65
              ? PALETTE.ROCK_DARK
              : PALETTE.ROCK_LIGHT;
        tmpColor.lerp(rockCol, Math.max(sCode === 3 ? 0.85 : 0, rockBlend));
      }

      // High-altitude Canadian Rockies sub-alpine & snow-dusted summit ridge (> 150m)
      if (cy > 148) {
        const alpineRockT = THREE.MathUtils.smoothstep(cy, 148, 178);
        tmpColor.lerp(PALETTE.ROCK_LIGHT, alpineRockT * 0.55);
        if (cy > 172 && ny > 0.72) {
          const snowT = THREE.MathUtils.smoothstep(cy + jitter * 180, 172, 202);
          tmpColor.lerp(PALETTE.ALPINE_SNOW, snowT * 0.82);
        }
      }

      // Baked Canopy & Boulder Ambient Occlusion (grounds every tree & rock into the terrain!)
      const ao = computeCanopyAmbientOcclusion(cx, cz);
      if (ao > 0.005) {
        tmpColor.lerp(PALETTE.AO_SHADOW, ao);
      }

      tmpColor.offsetHSL(0, 0, jitter);

      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return baseGeo;
  }, []);

  // 2. Smooth Ribbon Geometries for 1,000m Road, Dashed Yellow Center Lines, Dirt Singletrack & Downhill Whitewater River!
  const { roadRibbonGeo, roadStripeGeo, dirtRibbonGeo, dirtMaterial, riverRibbonGeo } = useMemo(() => {
    const roadRibbon = createSplineRibbonGeometry(
      asphaltCurve,
      640,
      5.2,
      0.14,
      '#24272c',
      '#4e535c',
      false
    );
    const roadStripe = createDashedCenterLineGeometry(asphaltCurve, 155, 0.14, 0.22);
    const dirtRibbon = createSplineRibbonGeometry(
      dirtCurve,
      680,
      3.15,
      0.12,
      '#8f5336',
      '#4e643e',
      true
    );

    const dMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    dMat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `varying vec3 vDirtWorldPos;\nvarying vec2 vDirtUv;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          vDirtWorldPos = position;
          vDirtUv = uv;
          `
        );

      const dirtNoiseHelpers = `
        varying vec3 vDirtWorldPos;
        varying vec2 vDirtUv;

        float dirtHash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }

        float dirtNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(dirtHash(i + vec2(0.0, 0.0)), dirtHash(i + vec2(1.0, 0.0)), u.x),
            mix(dirtHash(i + vec2(0.0, 1.0)), dirtHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float dirtFbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
          for (int i = 0; i < 3; i++) {
            v += a * dirtNoise(p);
            p = rot * p * 2.07 + vec2(17.3, 9.2);
            a *= 0.5;
          }
          return v;
        }
      `;

      shader.fragmentShader =
        dirtNoiseHelpers +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            float absU = abs(vDirtUv.x);
            float centerMask = 1.0 - smoothstep(0.62, 0.92, absU);

            // 1. Multi-scale organic soil clods & humus patches (world-space FBM)
            float soilMacro = dirtFbm(vDirtWorldPos.xz * 0.65);
            float soilFine  = dirtFbm(vDirtWorldPos.xz * 3.4);
            float soilGrain = dirtNoise(vDirtWorldPos.xz * 12.5);

            // 2. Longitudinal tire-tread & rainwater erosion striations along the trail
            float rutWave = dirtNoise(vec2(vDirtUv.x * 9.5 + soilMacro * 1.4, vDirtUv.y * 0.55));
            float rutGroove = smoothstep(0.32, 0.78, rutWave) * exp(- (vDirtUv.x * vDirtUv.x) / 0.16);

            // 3. Embedded small stones / gravel pebbles & dark root/bark flecks
            float pebbleField = dirtNoise(vDirtWorldPos.xz * 6.8 + vec2(soilMacro * 2.0));
            float bermZone = smoothstep(0.15, 0.55, absU) * centerMask;
            float pebbleSpot = smoothstep(0.74 - bermZone * 0.08, 0.83 - bermZone * 0.08, pebbleField);
            float darkHumusSpot = smoothstep(0.76, 0.86, dirtNoise(vDirtWorldPos.xz * 4.5 + 31.7)) * centerMask;

            vec3 darkLoamCol = vec3(0.24, 0.13, 0.07);
            vec3 warmOchreCol = vec3(0.68, 0.43, 0.27);
            vec3 pebbleGreyCol = vec3(0.56, 0.54, 0.50);

            // Blend soil clod variations
            diffuseColor.rgb = mix(diffuseColor.rgb, darkLoamCol, (soilMacro - 0.45) * 0.42 * centerMask);
            diffuseColor.rgb = mix(diffuseColor.rgb, warmOchreCol, (soilFine - 0.5) * 0.35 * centerMask);
            // Darken packed central tire rut grooves
            diffuseColor.rgb = mix(diffuseColor.rgb, darkLoamCol, rutGroove * 0.28);
            // Add dark cedar bark / humus flecks & small grey/ochre stones
            diffuseColor.rgb = mix(diffuseColor.rgb, darkLoamCol * 0.85, darkHumusSpot * 0.42);
            diffuseColor.rgb = mix(diffuseColor.rgb, pebbleGreyCol, pebbleSpot * 0.52 * centerMask);
            // Fine gritty sand/soil grain
            diffuseColor.rgb *= (0.91 + soilGrain * 0.18);
            `
          )
          .replace(
            '#include <normal_fragment_maps>',
            `
            #include <normal_fragment_maps>
            float nMask = 1.0 - smoothstep(0.65, 0.95, abs(vDirtUv.x));
            vec2 wp = vDirtWorldPos.xz * 3.8;
            float h0 = dirtFbm(wp) + dirtNoise(vDirtWorldPos.xz * 11.0) * 0.35;
            float hx = dirtFbm(wp + vec2(0.12, 0.0)) + dirtNoise((vDirtWorldPos.xz + vec2(0.05, 0.0)) * 11.0) * 0.35;
            float hz = dirtFbm(wp + vec2(0.0, 0.12)) + dirtNoise((vDirtWorldPos.xz + vec2(0.0, 0.05)) * 11.0) * 0.35;
            vec3 dirtPerturb = vec3((h0 - hx) * 0.38, 0.0, (h0 - hz) * 0.38) * nMask;
            normal = normalize(normal + dirtPerturb);
            `
          );
    };

    // Downhill Whitewater Rapids Ribbon (glacial turquoise center with frothy whitewater foam edges)
    const riverRibbon = createSplineRibbonGeometry(
      riverCurve,
      480,
      6.4,
      0.32,
      '#2c95a8',
      '#e2f7f5',
      false
    );
    return {
      roadRibbonGeo: roadRibbon,
      roadStripeGeo: roadStripe,
      dirtRibbonGeo: dirtRibbon,
      dirtMaterial: dMat,
      riverRibbonGeo: riverRibbon,
    };
  }, []);

  // 3. Water Surface Geometry with Vertex-Colored Shoreline Foam (Mirror Lake Basin at Bottom)
  const { waterGeometry, waterMaterial } = useMemo(() => {
    const waterLen = 280; // Spans from Z = +220 to Z = +500 (center at Z = +360)
    const centerZ = 360;
    const geo = new THREE.PlaneGeometry(TERRAIN_WIDTH, waterLen, 110, 90);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cFoam = new THREE.Color('#eefaf8');
    const cShallow = new THREE.Color('#3ca2b0');
    const cDeep = new THREE.Color('#1d6373');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i);
      const wz = pos.getZ(i) + centerZ;
      pos.setZ(i, wz);

      const terrainH = getTerrainHeightOnly(wx, wz);
      const depth = WATER_LEVEL - terrainH;

      if (depth > -0.25 && depth < 0.72) {
        // Crisp white shoreline / riverbank foam
        const foamT = THREE.MathUtils.clamp(1.0 - Math.max(0, depth) / 0.72, 0, 1);
        tmp.copy(cShallow).lerp(cFoam, Math.pow(foamT, 1.3));
      } else if (depth >= 0.72 && depth < 2.8) {
        const shallowT = (depth - 0.72) / 2.08;
        tmp.copy(cShallow).lerp(cDeep, shallowT);
      } else {
        tmp.copy(cDeep);
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.14,
      metalness: 0.22,
      transparent: true,
      opacity: 0.88,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.vertexShader =
        `uniform float uTime;\nvarying vec3 vWaterWorldPos;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          vWaterWorldPos = position;
          float isRiver = smoothstep(255.0, 215.0, position.z);
          float flowPhase = position.z * 0.42 - uTime * mix(2.2, 8.5, isRiver);
          float wave1 = sin(flowPhase + position.x * 0.35) * mix(0.04, 0.09, isRiver);
          float wave2 = cos(position.z * 0.85 - uTime * mix(3.1, 11.0, isRiver) - position.x * 0.62) * mix(0.025, 0.055, isRiver);
          transformed.y += wave1 + wave2;
          `
        );

      shader.fragmentShader =
        `uniform float uTime;\nvarying vec3 vWaterWorldPos;\n` +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            float isRiverFrag = smoothstep(255.0, 215.0, vWaterWorldPos.z);
            // Smooth longitudinal current ribbons (stretched along Z, zero polka dots!)
            float warpX = vWaterWorldPos.x + sin(vWaterWorldPos.z * 0.08 - uTime * 1.4) * 1.2;
            float ribbon1 = sin(warpX * 1.6 + vWaterWorldPos.z * 0.11 - uTime * mix(0.8, 3.8, isRiverFrag));
            float ribbon2 = cos(warpX * 2.7 - vWaterWorldPos.z * 0.16 + uTime * mix(0.6, 3.1, isRiverFrag));
            float streamBand = smoothstep(0.45, 0.95, (ribbon1 + ribbon2) * 0.5);
            vec3 shimmerCol = vec3(0.32, 0.78, 0.86);
            diffuseColor.rgb = mix(diffuseColor.rgb, shimmerCol, streamBand * 0.18);
            `
          )
          .replace(
            '#include <normal_fragment_maps>',
            `
            #include <normal_fragment_maps>
            float isRiverNorm = smoothstep(255.0, 215.0, vWaterWorldPos.z);
            float nFlow = vWaterWorldPos.z * 0.35 - uTime * mix(1.6, 6.5, isRiverNorm);
            float nxRipple = cos(vWaterWorldPos.x * 1.2 + nFlow) * 0.12 + sin(vWaterWorldPos.x * 2.1 - nFlow * 0.8) * 0.06;
            float nzRipple = sin(vWaterWorldPos.z * 0.9 + nFlow) * 0.12 + cos(vWaterWorldPos.x * 1.4 + nFlow * 0.7) * 0.06;
            normal = normalize(normal + vec3(nxRipple, 0.0, nzRipple));
            `
          );
    };

    return { waterGeometry: geo, waterMaterial: mat };
  }, []);

  // 4. Instanced Foliage for 1,000m Map (Spruces, Golden Autumn Larches, Mossy Rocks, Understory Shrubs & Grass)
  const { spruceMatrices, larchMatrices, rockMatrices, shrubMatrices, grassMatrices } = useMemo(() => {
    const spruces: THREE.Matrix4[] = [];
    const larches: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const shrubs: THREE.Matrix4[] = [];
    const grass: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const cols = GRID_SEGMENTS_X + 1;

    for (let i = 0; i < FOREST_TREES.length; i++) {
      const t = FOREST_TREES[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.set(t.scale, t.scaleY, t.scale);
      dummy.updateMatrix();
      if (t.variant === 'LARCH') {
        larches.push(dummy.matrix.clone());
      } else {
        spruces.push(dummy.matrix.clone());
      }
    }

    for (let i = 0; i < CANYON_ROCKS.length; i++) {
      const r = CANYON_ROCKS[i];
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(r.rx, r.ry, r.rz);
      dummy.scale.set(r.sx, r.sy, r.sz);
      dummy.updateMatrix();
      rocks.push(dummy.matrix.clone());
    }

    // Understory Low Shrubs / Berry Bushes
    for (let i = 0; i < 650; i++) {
      const rx = ((Math.sin(i * 157.3 + 13) * 43758.5453) % 1 + 1) % 1;
      const rz = ((Math.sin(i * 311.7 + 71) * 43758.5453) % 1 + 1) % 1;
      const x = (rx - 0.5) * (TERRAIN_WIDTH - 30);
      const z = (rz - 0.5) * (TERRAIN_LENGTH - 40);

      const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
      const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
      const sCode = surfaceGrid[gz * cols + gx];
      const y = getTerrainHeightOnly(x, z);

      if (sCode === 0 && y > WATER_LEVEL + 1.2 && y < 162) {
        const s = 0.65 + ((i * 17) % 9) * 0.09;
        dummy.position.set(x, y + s * 0.32, z);
        dummy.rotation.set(0, (i * 1.7) % (Math.PI * 2), 0);
        dummy.scale.set(s * 1.15, s * 0.78, s);
        dummy.updateMatrix();
        shrubs.push(dummy.matrix.clone());
      }
    }

    for (let i = 0; i < 2800; i++) {
      const rx = ((Math.sin(i * 91.7 + 41) * 43758.5453) % 1 + 1) % 1;
      const rz = ((Math.sin(i * 241.3 + 19) * 43758.5453) % 1 + 1) % 1;
      const x = (rx - 0.5) * (TERRAIN_WIDTH - 28);
      const z = (rz - 0.5) * (TERRAIN_LENGTH - 36);

      const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
      const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
      const sCode = surfaceGrid[gz * cols + gx];
      const y = getTerrainHeightOnly(x, z);

      if (sCode === 0 && y > WATER_LEVEL + 0.8 && y < 168) {
        const s = 0.45 + ((i * 11) % 7) * 0.08;
        dummy.position.set(x, y + s * 0.4, z);
        dummy.rotation.set(0, (i * 2.1) % (Math.PI * 2), 0);
        dummy.scale.set(s, s * 1.35, s);
        dummy.updateMatrix();
        grass.push(dummy.matrix.clone());
      }
    }

    return {
      spruceMatrices: spruces,
      larchMatrices: larches,
      rockMatrices: rocks,
      shrubMatrices: shrubs,
      grassMatrices: grass,
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    windUniforms.uTime.value = t;

    const night = mutablePhysics.nightFactor;
    if (tentFabricMatRef.current) {
      tentFabricMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.05, 1.35, night);
    }
    if (fireEmberMatRef.current) {
      const flicker = 0.85 + Math.sin(t * 14) * 0.15 + Math.cos(t * 23) * 0.1;
      fireEmberMatRef.current.emissiveIntensity = (0.4 + night * 1.8) * flicker;
    }
    if (campLightRef.current) {
      const flicker = 0.9 + Math.sin(t * 11) * 0.12;
      campLightRef.current.intensity = THREE.MathUtils.lerp(0.2, 6.5, night) * flicker;
    }
  });

  const dockY = WATER_LEVEL + 0.25;
  const campX = -10;
  const campZ = 240;
  const campY = getTerrainHeightOnly(campX, campZ);

  return (
    <group>
      {/* Main Smooth Vertex-Colored Terrain (Matte Clay Roughness, Smooth Normals) */}
      <mesh geometry={terrainGeometry} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.92}
          metalness={0.01}
        />
      </mesh>

      {/* Dedicated Smooth Charcoal Asphalt Road Ribbon Mesh with Cambered Gravel Shoulders */}
      <mesh geometry={roadRibbonGeo} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.86}
          metalness={0.02}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Dashed Warm Yellow Center Lines on Asphalt Road */}
      <mesh geometry={roadStripeGeo} receiveShadow>
        <meshStandardMaterial
          color="#f4b942"
          roughness={0.65}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>

      {/* Dedicated Earthy Cedar Dirt Singletrack Ribbon Mesh with Organic Loam, Pebbles & Ruts */}
      <mesh geometry={dirtRibbonGeo} material={dirtMaterial} receiveShadow />

      {/* Fallen Cedar Tree Log Hurdles across Road & Singletrack (Bunny-Hop Obstacles!) */}
      {FALLEN_LOGS.map((log) => (
        <group
          key={log.id}
          position={[log.position.x, log.position.y, log.position.z]}
          rotation={[0, log.yaw, 0]}
        >
          {/* Main Cedar Trunk */}
          <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[log.radius * 0.88, log.radius, log.length, 7]} />
            <meshStandardMaterial color="#5c3a21" flatShading roughness={0.92} />
          </mesh>
          {/* Bright Moss & Golden Lichen Strip on Top for High Visibility */}
          <mesh castShadow position={[0, log.radius * 0.78, 0]}>
            <boxGeometry args={[log.radius * 0.95, 0.12, log.length * 0.78]} />
            <meshStandardMaterial color="#6b8e4e" flatShading roughness={0.9} />
          </mesh>
          <mesh position={[0, log.radius * 0.86, 0]}>
            <boxGeometry args={[log.radius * 0.5, 0.08, log.length * 0.45]} />
            <meshStandardMaterial color="#f4a261" flatShading roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* Downhill Whitewater Rapids River Ribbon (Flows down the slope from Z=-280 into Mirror Lake!) */}
      <mesh geometry={riverRibbonGeo} material={waterMaterial} receiveShadow />

      {/* Mirror Lake Plane with Shoreline Foam */}
      <mesh geometry={waterGeometry} material={waterMaterial} receiveShadow />

      {/* High-Mountain Whitewater Rapids Wooden Put-In Deck (at x=48, z=-272) */}
      <group
        position={[48, getTerrainHeightOnly(48, -272) + 0.12, -272]}
        rotation={[0, 0.32, 0]}
      >
        <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
          <boxGeometry args={[3.8, 0.28, 7.8]} />
          <meshStandardMaterial color="#8c6239" roughness={0.88} />
        </mesh>
      </group>

      {/* Wooden Lake Dock at the bottom of the 1,000m slope */}
      <group position={[2, dockY, 256]}>
        <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
          <boxGeometry args={[4.2, 0.3, 18]} />
          <meshStandardMaterial color="#8c6239" flatShading roughness={0.88} />
        </mesh>
        {[-7, -2, 3, 8].map((zOff, idx) => (
          <React.Fragment key={idx}>
            <mesh castShadow position={[-1.8, -0.6, zOff]}>
              <cylinderGeometry args={[0.18, 0.18, 2.2, 6]} />
              <meshStandardMaterial color="#5c3d22" flatShading roughness={0.9} />
            </mesh>
            <mesh castShadow position={[1.8, -0.6, zOff]}>
              <cylinderGeometry args={[0.18, 0.18, 2.2, 6]} />
              <meshStandardMaterial color="#5c3d22" flatShading roughness={0.9} />
            </mesh>
          </React.Fragment>
        ))}
      </group>

      {/* Lakeside Base Camp (Emissive Expedition Tent & Warm Campfire at Night) */}
      <group position={[campX, campY, campZ]} rotation={[0, 0.45, 0]}>
        <mesh castShadow receiveShadow position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[2.3, 2.4, 4]} />
          <meshStandardMaterial
            ref={tentFabricMatRef}
            color="#e76f51"
            emissive="#ff9f1c"
            emissiveIntensity={0.1}
            flatShading
            roughness={0.85}
          />
        </mesh>
        <group position={[2.8, 0.12, 1.8]}>
          <mesh castShadow position={[0, 0.18, 0]}>
            <dodecahedronGeometry args={[0.48, 0]} />
            <meshStandardMaterial
              ref={fireEmberMatRef}
              color="#ff5400"
              emissive="#ff6d00"
              emissiveIntensity={0.8}
              flatShading
            />
          </mesh>
          <mesh castShadow receiveShadow position={[1.3, 0.18, -0.4]} rotation={[Math.PI / 2, 0, 0.3]}>
            <cylinderGeometry args={[0.22, 0.22, 2.1, 6]} />
            <meshStandardMaterial color="#6c462b" flatShading roughness={0.9} />
          </mesh>
          <pointLight
            ref={campLightRef}
            position={[0, 1.4, 0]}
            color="#ff9e44"
            intensity={1.0}
            distance={24}
            decay={1.6}
          />
        </group>
      </group>

      {/* Instanced Boreal Spruces, Golden Autumn Larches, Boulders, Shrubs & Grass with GPU Wind Sway */}
      <InstancedPines matrices={spruceMatrices} />
      <InstancedLarches matrices={larchMatrices} />
      <InstancedRocks matrices={rockMatrices} />
      <InstancedShrubs matrices={shrubMatrices} />
      <InstancedGrass matrices={grassMatrices} />
    </group>
  );
};

const InstancedPines: React.FC<{ matrices: THREE.Matrix4[] }> = ({ matrices }) => {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const lowerTierRef = useRef<THREE.InstancedMesh>(null);
  const midTierRef = useRef<THREE.InstancedMesh>(null);
  const upperTierRef = useRef<THREE.InstancedMesh>(null);

  const pineLowerMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#224436',
      flatShading: true,
      roughness: 0.9,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.075);
    return mat;
  }, []);

  const pineMidMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#2c5543',
      flatShading: true,
      roughness: 0.89,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.11);
    return mat;
  }, []);

  const pineTopMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#376752',
      flatShading: true,
      roughness: 0.88,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.145);
    return mat;
  }, []);

  React.useLayoutEffect(() => {
    if (!trunkRef.current || !lowerTierRef.current || !midTierRef.current || !upperTierRef.current) return;
    const matLower = new THREE.Matrix4();
    const matMid = new THREE.Matrix4();
    const matUpper = new THREE.Matrix4();
    const offsetLower = new THREE.Matrix4().makeTranslation(0, 2.7, 0);
    const offsetMid = new THREE.Matrix4().makeTranslation(0, 4.4, 0);
    const offsetUpper = new THREE.Matrix4().makeTranslation(0, 6.0, 0);

    for (let i = 0; i < matrices.length; i++) {
      trunkRef.current.setMatrixAt(i, matrices[i]);
      matLower.multiplyMatrices(matrices[i], offsetLower);
      lowerTierRef.current.setMatrixAt(i, matLower);
      matMid.multiplyMatrices(matrices[i], offsetMid);
      midTierRef.current.setMatrixAt(i, matMid);
      matUpper.multiplyMatrices(matrices[i], offsetUpper);
      upperTierRef.current.setMatrixAt(i, matUpper);
    }
    trunkRef.current.instanceMatrix.needsUpdate = true;
    lowerTierRef.current.instanceMatrix.needsUpdate = true;
    midTierRef.current.instanceMatrix.needsUpdate = true;
    upperTierRef.current.instanceMatrix.needsUpdate = true;
    trunkRef.current.computeBoundingSphere();
    lowerTierRef.current.computeBoundingSphere();
    midTierRef.current.computeBoundingSphere();
    upperTierRef.current.computeBoundingSphere();
  }, [matrices]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, matrices.length]} castShadow>
        <cylinderGeometry args={[0.18, 0.32, 2.2, 5]} />
        <meshStandardMaterial color="#5c4028" flatShading roughness={0.92} />
      </instancedMesh>
      <instancedMesh
        ref={lowerTierRef}
        args={[undefined, pineLowerMat, matrices.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[2.0, 3.4, 6]} />
      </instancedMesh>
      <instancedMesh
        ref={midTierRef}
        args={[undefined, pineMidMat, matrices.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1.55, 3.0, 6]} />
      </instancedMesh>
      <instancedMesh
        ref={upperTierRef}
        args={[undefined, pineTopMaterial, matrices.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1.08, 2.6, 6]} />
      </instancedMesh>
    </group>
  );
};

const InstancedLarches: React.FC<{ matrices: THREE.Matrix4[] }> = ({ matrices }) => {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const lowerTierRef = useRef<THREE.InstancedMesh>(null);
  const upperTierRef = useRef<THREE.InstancedMesh>(null);

  const larchLowerMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#cf8228',
      flatShading: true,
      roughness: 0.88,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.095);
    return mat;
  }, []);

  const larchTopMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#e5a93c',
      flatShading: true,
      roughness: 0.86,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.15);
    return mat;
  }, []);

  React.useLayoutEffect(() => {
    if (!trunkRef.current || !lowerTierRef.current || !upperTierRef.current) return;
    const matLower = new THREE.Matrix4();
    const matUpper = new THREE.Matrix4();
    const offsetLower = new THREE.Matrix4().makeTranslation(0, 3.0, 0);
    const offsetUpper = new THREE.Matrix4().makeTranslation(0, 5.0, 0);

    for (let i = 0; i < matrices.length; i++) {
      trunkRef.current.setMatrixAt(i, matrices[i]);
      matLower.multiplyMatrices(matrices[i], offsetLower);
      lowerTierRef.current.setMatrixAt(i, matLower);
      matUpper.multiplyMatrices(matrices[i], offsetUpper);
      upperTierRef.current.setMatrixAt(i, matUpper);
    }
    trunkRef.current.instanceMatrix.needsUpdate = true;
    lowerTierRef.current.instanceMatrix.needsUpdate = true;
    upperTierRef.current.instanceMatrix.needsUpdate = true;
    trunkRef.current.computeBoundingSphere();
    lowerTierRef.current.computeBoundingSphere();
    upperTierRef.current.computeBoundingSphere();
  }, [matrices]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, matrices.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.28, 2.3, 5]} />
        <meshStandardMaterial color="#d2cabe" flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={lowerTierRef}
        args={[undefined, larchLowerMat, matrices.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1.75, 3.8, 6]} />
      </instancedMesh>
      <instancedMesh
        ref={upperTierRef}
        args={[undefined, larchTopMat, matrices.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1.25, 3.2, 6]} />
      </instancedMesh>
    </group>
  );
};

const InstancedShrubs: React.FC<{ matrices: THREE.Matrix4[] }> = ({ matrices }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const shrubMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.9,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.14);
    return mat;
  }, []);

  React.useLayoutEffect(() => {
    if (!meshRef.current) return;
    const col = new THREE.Color();
    for (let i = 0; i < matrices.length; i++) {
      meshRef.current.setMatrixAt(i, matrices[i]);
      col.set(i % 4 === 0 ? '#9e5834' : i % 2 === 0 ? '#3f6b47' : '#537d4a');
      meshRef.current.setColorAt(i, col);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [matrices]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, shrubMat, matrices.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.75, 0]} />
    </instancedMesh>
  );
};

const InstancedRocks: React.FC<{ matrices: THREE.Matrix4[] }> = ({ matrices }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  React.useLayoutEffect(() => {
    if (!meshRef.current) return;
    const col = new THREE.Color();
    for (let i = 0; i < matrices.length; i++) {
      meshRef.current.setMatrixAt(i, matrices[i]);
      col.set(i % 3 === 0 ? '#6c757d' : i % 2 === 0 ? '#5c6770' : '#7b858e');
      meshRef.current.setColorAt(i, col);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [matrices]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, matrices.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial flatShading roughness={0.92} />
    </instancedMesh>
  );
};

const InstancedGrass: React.FC<{ matrices: THREE.Matrix4[] }> = ({ matrices }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const grassMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#5a8f5c',
      flatShading: true,
      roughness: 0.9,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.24);
    return mat;
  }, []);

  React.useLayoutEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < matrices.length; i++) {
      meshRef.current.setMatrixAt(i, matrices[i]);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [matrices]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, grassMaterial, matrices.length]}>
      <coneGeometry args={[0.32, 0.95, 4]} />
    </instancedMesh>
  );
};
