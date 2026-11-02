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
  FALLEN_LOGS,
  getTerrainHeightOnly,
} from '../world/terrainData';
import { simplex2D } from '../math/noise';
import { mutablePhysics } from '../state/gameStore';

// Crisp "Firewatch / Lonely Mountains / A Short Hike" matte clay palette
const PALETTE = {
  GRASS_HIGH: new THREE.Color('#4d7c5b'),
  GRASS_MID: new THREE.Color('#3b694c'),
  GRASS_WARM: new THREE.Color('#6b8e4e'),
  SHOULDER_GRAVEL: new THREE.Color('#6c756b'),
  SHOULDER_MOSS: new THREE.Color('#4b6b4c'),
  ROCK_LIGHT: new THREE.Color('#7a8288'),
  ROCK_DARK: new THREE.Color('#555d66'),
  SAND: new THREE.Color('#d2b48c'),
  LAKE_BED: new THREE.Color('#1c434d'),
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
 * Generates a smooth, terrain-hugging extruded Ribbon BufferGeometry along a 3D spline.
 */
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
  shoulderColorHex: string
): THREE.BufferGeometry {
  const crossPts = 9;
  const positions = new Float32Array((segments + 1) * crossPts * 3);
  const colors = new Float32Array((segments + 1) * crossPts * 3);
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const cCore = new THREE.Color(coreColorHex);
  const cShoulder = new THREE.Color(shoulderColorHex);
  const tmpCol = new THREE.Color();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPoint(t, pt);
    curve.getTangent(t, tangent);
    const rightX = -tangent.z;
    const rightZ = tangent.x;
    const len = Math.hypot(rightX, rightZ) || 1;
    const nx = rightX / len;
    const nz = rightZ / len;

    for (let c = 0; c < crossPts; c++) {
      const u = (c / (crossPts - 1)) * 2 - 1; // -1 to +1
      const absU = Math.abs(u);
      const wx = pt.x + nx * halfWidth * u;
      const wz = pt.z + nz * halfWidth * u;

      // Smoothly arched road/trail bed that tucks edges (-0.09m) into the terrain
      // so the underlying terrain never pokes through or shows sawtooth borders
      let heightProfile = yOffset;
      if (absU <= 0.72) {
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

    const rightX = -tangent.z;
    const rightZ = tangent.x;
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

      // Base meadow grass color with smooth altitude gradient
      const altBlend = THREE.MathUtils.clamp((cy - 25) / 75, 0, 1);
      tmpColor.copy(PALETTE.GRASS_MID).lerp(PALETTE.GRASS_WARM, altBlend);

      if (cy < WATER_LEVEL - 0.15) {
        const depthBlend = THREE.MathUtils.clamp((WATER_LEVEL - 0.15 - cy) / 1.8, 0, 1);
        tmpColor.lerp(PALETTE.LAKE_BED, depthBlend);
      } else if (sCode === 4 || (cy < WATER_LEVEL + 1.8 && cz > 205)) {
        const sandBlend = THREE.MathUtils.clamp(1.0 - (cy - WATER_LEVEL) / 1.8, 0, 1);
        tmpColor.lerp(PALETTE.SAND, Math.max(sCode === 4 ? 0.75 : 0, sandBlend));
      } else if (ny < 0.82 || sCode === 3) {
        const rockBlend = THREE.MathUtils.clamp((0.82 - ny) / 0.22, 0, 1);
        const rockCol = ny < 0.65 ? PALETTE.ROCK_DARK : PALETTE.ROCK_LIGHT;
        tmpColor.lerp(rockCol, Math.max(sCode === 3 ? 0.85 : 0, rockBlend));
      }

      tmpColor.offsetHSL(0, 0, jitter);

      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return baseGeo;
  }, []);

  // 2. Smooth Ribbon Geometries for 1,000m Road, Dashed Yellow Center Lines & Dirt Singletrack
  const { roadRibbonGeo, roadStripeGeo, dirtRibbonGeo } = useMemo(() => {
    const roadRibbon = createSplineRibbonGeometry(
      asphaltCurve,
      640,
      5.2,
      0.14,
      '#24272c',
      '#4e535c'
    );
    const roadStripe = createDashedCenterLineGeometry(asphaltCurve, 155, 0.14, 0.22);
    const dirtRibbon = createSplineRibbonGeometry(
      dirtCurve,
      560,
      3.1,
      0.12,
      '#8f5336',
      '#586443'
    );
    return {
      roadRibbonGeo: roadRibbon,
      roadStripeGeo: roadStripe,
      dirtRibbonGeo: dirtRibbon,
    };
  }, []);

  // 3. Water Surface Geometry with Vertex-Colored Shoreline Foam (Canyon River + Mirror Lake)
  const { waterGeometry, waterMaterial } = useMemo(() => {
    const waterLen = 660; // Spans from Z = -160 to Z = +500 (center at Z = +170)
    const centerZ = 170;
    const geo = new THREE.PlaneGeometry(TERRAIN_WIDTH, waterLen, 110, 180);
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
      roughness: 0.24,
      metalness: 0.15,
      transparent: true,
      opacity: 0.86,
      flatShading: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.vertexShader =
        `uniform float uTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float wave = sin(uTime * 2.4 + position.x * 0.22 + position.z * 0.18) * 0.045;
          transformed.y += wave;
          `
        );
    };

    return { waterGeometry: geo, waterMaterial: mat };
  }, []);

  // 4. Instanced roadside wooden bollards & trail markers
  const { postMatrices, postColors } = useMemo(() => {
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const dummy = new THREE.Object3D();
    const pt = new THREE.Vector3();
    const tangent = new THREE.Vector3();

    const roadSteps = 120;
    for (let i = 2; i < roadSteps - 2; i++) {
      const t = i / roadSteps;
      asphaltCurve.getPoint(t, pt);
      asphaltCurve.getTangent(t, tangent);
      const rightX = -tangent.z;
      const rightZ = tangent.x;

      for (const side of [-1, 1]) {
        const px = pt.x + rightX * side * 5.3;
        const pz = pt.z + rightZ * side * 5.3;
        const py = getTerrainHeightOnly(px, pz);
        if (py > WATER_LEVEL + 0.5) {
          dummy.position.set(px, py + 0.45, pz);
          dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
          dummy.scale.set(0.22, 0.9, 0.22);
          dummy.updateMatrix();
          matrices.push(dummy.matrix.clone());
          colors.push(new THREE.Color(i % 2 === 0 ? '#eb5e46' : '#e8dcc4'));
        }
      }
    }

    const dirtSteps = 105;
    for (let i = 2; i < dirtSteps - 2; i += 2) {
      const t = i / dirtSteps;
      dirtCurve.getPoint(t, pt);
      dirtCurve.getTangent(t, tangent);
      const rightX = -tangent.z;
      const rightZ = tangent.x;

      const side = i % 4 === 0 ? 1 : -1;
      const px = pt.x + rightX * side * 3.2;
      const pz = pt.z + rightZ * side * 3.2;
      const py = getTerrainHeightOnly(px, pz);
      if (py > WATER_LEVEL + 0.5) {
        dummy.position.set(px, py + 0.35, pz);
        dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
        dummy.scale.set(0.18, 0.7, 0.18);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(new THREE.Color('#52b788'));
      }
    }

    return { postMatrices: matrices, postColors: colors };
  }, []);

  // 5. Instanced Foliage for 1,000m Map (1,250 Pines, 420 Mossy Rocks, 2,500 Lush Grass Tufts)
  const { treeMatrices, rockMatrices, grassMatrices } = useMemo(() => {
    const trees: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const grass: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const cols = GRID_SEGMENTS_X + 1;

    for (let i = 0; i < 1350; i++) {
      const rx = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
      const rz = ((Math.sin(i * 311.7) * 43758.5453) % 1 + 1) % 1;
      const x = (rx - 0.5) * (TERRAIN_WIDTH - 24);
      const z = (rz - 0.5) * (TERRAIN_LENGTH - 30);

      if (Math.hypot(x - -10, z - 240) < 13) continue;
      if (Math.hypot(x - 0, z - -475) < 16) continue;

      const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
      const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
      const sCode = surfaceGrid[gz * cols + gx];
      const y = getTerrainHeightOnly(x, z);

      if (sCode === 0 && y > WATER_LEVEL + 1.5 && y < 120) {
        const scale = 0.82 + ((i * 17) % 12) * 0.11;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, (i * 1.3) % (Math.PI * 2), 0);
        dummy.scale.set(scale, scale * (0.95 + (i % 5) * 0.08), scale);
        dummy.updateMatrix();
        trees.push(dummy.matrix.clone());
      }
    }

    for (let i = 0; i < 520; i++) {
      const rx = ((Math.sin(i * 517.3 + 9) * 43758.5453) % 1 + 1) % 1;
      const rz = ((Math.sin(i * 811.1 + 3) * 43758.5453) % 1 + 1) % 1;
      const x = (rx - 0.5) * (TERRAIN_WIDTH - 24);
      const z = (rz - 0.5) * (TERRAIN_LENGTH - 30);
      if (Math.hypot(x - -10, z - 240) < 10) continue;
      if (Math.hypot(x - 0, z - -475) < 14) continue;

      const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
      const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
      const sCode = surfaceGrid[gz * cols + gx];
      const y = getTerrainHeightOnly(x, z);

      if ((sCode === 0 || sCode === 3 || sCode === 4) && y > WATER_LEVEL + 0.25) {
        const sx = 0.6 + ((i * 13) % 9) * 0.18;
        const sy = sx * (0.6 + ((i * 7) % 5) * 0.12);
        dummy.position.set(x, y + sy * 0.25, z);
        dummy.rotation.set((i * 0.4) % 1, (i * 1.9) % 6, (i * 0.3) % 1);
        dummy.scale.set(sx, sy, sx * 0.9);
        dummy.updateMatrix();
        rocks.push(dummy.matrix.clone());
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

      if (sCode === 0 && y > WATER_LEVEL + 0.8 && y < 115) {
        const s = 0.45 + ((i * 11) % 7) * 0.08;
        dummy.position.set(x, y + s * 0.4, z);
        dummy.rotation.set(0, (i * 2.1) % (Math.PI * 2), 0);
        dummy.scale.set(s, s * 1.35, s);
        dummy.updateMatrix();
        grass.push(dummy.matrix.clone());
      }
    }

    return { treeMatrices: trees, rockMatrices: rocks, grassMatrices: grass };
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

      {/* Dedicated Smooth Cedar Dirt Singletrack Ribbon Mesh with Cambered Moss Shoulders */}
      <mesh geometry={dirtRibbonGeo} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.92}
          metalness={0.01}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

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

      {/* Canyon Whitewater River & Mirror Lake Plane with Shoreline Foam */}
      <mesh geometry={waterGeometry} material={waterMaterial} receiveShadow />

      {/* Mid-Mountain Canyon River Wooden Put-In Deck (at x=62, z=-135) */}
      <group position={[62, WATER_LEVEL + 0.2, -135]} rotation={[0, 0.35, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
          <boxGeometry args={[3.6, 0.28, 7.5]} />
          <meshStandardMaterial color="#8c6239" flatShading roughness={0.88} />
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

      {/* Instanced Roadside & Trailhead Markers */}
      <InstancedPosts matrices={postMatrices} colors={postColors} />

      {/* Instanced Pines, Boulders & Grass with GPU Wind Sway */}
      <InstancedPines matrices={treeMatrices} />
      <InstancedRocks matrices={rockMatrices} />
      <InstancedGrass matrices={grassMatrices} />
    </group>
  );
};

const InstancedPosts: React.FC<{ matrices: THREE.Matrix4[]; colors: THREE.Color[] }> = ({
  matrices,
  colors,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  React.useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [matrices, colors]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, matrices.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial flatShading roughness={0.88} />
    </instancedMesh>
  );
};

const InstancedPines: React.FC<{ matrices: THREE.Matrix4[] }> = ({ matrices }) => {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const lowerTierRef = useRef<THREE.InstancedMesh>(null);
  const upperTierRef = useRef<THREE.InstancedMesh>(null);

  const pineMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#274c3c',
      flatShading: true,
      roughness: 0.9,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.085);
    return mat;
  }, []);

  const pineTopMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#34624e',
      flatShading: true,
      roughness: 0.88,
    });
    mat.onBeforeCompile = (shader) => injectWindShader(shader, 0.135);
    return mat;
  }, []);

  React.useLayoutEffect(() => {
    if (!trunkRef.current || !lowerTierRef.current || !upperTierRef.current) return;
    const matLower = new THREE.Matrix4();
    const matUpper = new THREE.Matrix4();
    const offsetLower = new THREE.Matrix4().makeTranslation(0, 3.1, 0);
    const offsetUpper = new THREE.Matrix4().makeTranslation(0, 5.2, 0);

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
  }, [matrices]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, matrices.length]} castShadow>
        <cylinderGeometry args={[0.2, 0.34, 2.2, 5]} />
        <meshStandardMaterial color="#5c4028" flatShading roughness={0.92} />
      </instancedMesh>
      <instancedMesh
        ref={lowerTierRef}
        args={[undefined, pineMaterial, matrices.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1.95, 4.2, 6]} />
      </instancedMesh>
      <instancedMesh
        ref={upperTierRef}
        args={[undefined, pineTopMaterial, matrices.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1.45, 3.6, 6]} />
      </instancedMesh>
    </group>
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
  }, [matrices]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, grassMaterial, matrices.length]}>
      <coneGeometry args={[0.32, 0.95, 4]} />
    </instancedMesh>
  );
};
