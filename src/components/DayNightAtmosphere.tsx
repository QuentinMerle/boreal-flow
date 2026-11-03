import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mutablePhysics, useGameStore } from '../state/gameStore';

interface PaletteKeyframe {
  hour: number;
  zenith: THREE.Color;
  sky: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  nightFactor: number;
}

// 4 Curated Canadian Wilderness Color Palettes with Zenith Sky Gradient & Lifted Ground Bounce
const PALETTE_KEYFRAMES: PaletteKeyframe[] = [
  {
    hour: 0.0, // Deep Boreal Night
    zenith: new THREE.Color('#050911'),
    sky: new THREE.Color('#0b1320'),
    fog: new THREE.Color('#0f1b2d'),
    fogDensity: 0.0022,
    sunColor: new THREE.Color('#7ca5d8'),
    sunIntensity: 0.65,
    hemiSky: new THREE.Color('#283e66'),
    hemiGround: new THREE.Color('#1d2e28'),
    hemiIntensity: 0.52,
    nightFactor: 1.0,
  },
  {
    hour: 6.2, // Misty Pink-Gold Dawn (Firewatch / Alto Gradient)
    zenith: new THREE.Color('#5a5d80'),
    sky: new THREE.Color('#e8a598'),
    fog: new THREE.Color('#e29f8f'),
    fogDensity: 0.0021,
    sunColor: new THREE.Color('#ffaa70'),
    sunIntensity: 1.75,
    hemiSky: new THREE.Color('#ffd8be'),
    hemiGround: new THREE.Color('#526e5c'),
    hemiIntensity: 0.9,
    nightFactor: 0.15,
  },
  {
    hour: 12.5, // Crisp Canadian High Noon
    zenith: new THREE.Color('#3b82b6'),
    sky: new THREE.Color('#8ecae6'),
    fog: new THREE.Color('#b8dfea'),
    fogDensity: 0.0015,
    sunColor: new THREE.Color('#fff9eb'),
    sunIntensity: 2.35,
    hemiSky: new THREE.Color('#e6f6ff'),
    hemiGround: new THREE.Color('#5c7d68'),
    hemiIntensity: 1.05,
    nightFactor: 0.0,
  },
  {
    hour: 18.0, // Firewatch Golden Hour (Deep violet-amber zenith to glowing peach horizon)
    zenith: new THREE.Color('#6b4d6e'),
    sky: new THREE.Color('#e08e6d'),
    fog: new THREE.Color('#df8d6b'),
    fogDensity: 0.0020,
    sunColor: new THREE.Color('#ff9b54'),
    sunIntensity: 2.15,
    hemiSky: new THREE.Color('#ffd2ba'),
    hemiGround: new THREE.Color('#5a6b5c'),
    hemiIntensity: 0.95,
    nightFactor: 0.1,
  },
  {
    hour: 21.5, // Deep Blue Dusk -> Night
    zenith: new THREE.Color('#050911'),
    sky: new THREE.Color('#0b1320'),
    fog: new THREE.Color('#0f1b2d'),
    fogDensity: 0.0022,
    sunColor: new THREE.Color('#7ca5d8'),
    sunIntensity: 0.65,
    hemiSky: new THREE.Color('#283e66'),
    hemiGround: new THREE.Color('#1d2e28'),
    hemiIntensity: 0.52,
    nightFactor: 1.0,
  },
  {
    hour: 24.0, // Wrap to 0.0
    zenith: new THREE.Color('#050911'),
    sky: new THREE.Color('#0b1320'),
    fog: new THREE.Color('#0f1b2d'),
    fogDensity: 0.0022,
    sunColor: new THREE.Color('#7ca5d8'),
    sunIntensity: 0.65,
    hemiSky: new THREE.Color('#283e66'),
    hemiGround: new THREE.Color('#1d2e28'),
    hemiIntensity: 0.52,
    nightFactor: 1.0,
  },
];

// Scratch colors (ZERO allocations in useFrame)
const _zenithCol = new THREE.Color();
const _skyCol = new THREE.Color();
const _fogCol = new THREE.Color();
const _sunCol = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color();

/**
 * Generates a 360-degree jagged low-poly mountain silhouette ring around the horizon.
 * Sitting at 580m-920m out, these ranges naturally catch the exponential fog to create
 * layered Firewatch / Alto's Odyssey horizon silhouettes!
 */
function createDistantMountainRingGeometry(
  innerRadius: number,
  outerRadius: number,
  segments: number,
  basePeakHeight: number,
  seedOffset: number,
  isInnerRange: boolean
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const angle = u * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Multi-harmonic Rocky Mountain ridge profile with soft foothills and crisp low-poly peaks
    const h1 = Math.pow(0.5 + 0.5 * Math.sin(angle * 6.0 + seedOffset), 1.3) * 0.52;
    const h2 = Math.abs(Math.cos(angle * 11.0 - seedOffset * 1.7)) * 0.28;
    const h3 = (0.5 + 0.5 * Math.sin(angle * 19.0 + seedOffset * 2.9)) * 0.14;
    const valleyDip = 0.68 + 0.32 * Math.cos(angle * 3.0 + seedOffset);

    // Subtle saddle right behind the center of Mirror Lake (sinA > 0.5) so it cradles the lake without a flat wall
    const lakeSaddle =
      isInnerRange && sinA > 0.4
        ? 1.0 - THREE.MathUtils.smoothstep(sinA, 0.4, 0.98) * 0.28
        : 1.0;

    // Anchor inner toe at r0 = innerRadius (480m) so it seamlessly meets the Z=+500 lake shore with ZERO sky gap!
    const r0 = innerRadius;
    const r1 = THREE.MathUtils.lerp(innerRadius, outerRadius, 0.34);
    const r2 = THREE.MathUtils.lerp(innerRadius, outerRadius, 0.72);
    const r3 = outerRadius;

    const peakY =
      14 + (0.28 + h1 + h2 + h3) * basePeakHeight * valleyDip * lakeSaddle;
    const foothillWave = 0.36 + 0.14 * Math.sin(angle * 9.0 + seedOffset * 2.1);
    const foothillY = THREE.MathUtils.lerp(12, peakY, foothillWave);

    // 4 vertices per angular slice: Shoreline Toe (y=-15) -> Rolling Foothill -> Main Ridge Crest -> Outer Base
    positions.push(
      cosA * r0, -15, sinA * r0,
      cosA * r1, foothillY, sinA * r1,
      cosA * r2, peakY, sinA * r2,
      cosA * r3, -35, sinA * r3
    );

    if (i < segments) {
      const b = i * 4;
      const n = (i + 1) * 4;
      // Lower foothill slope (winding order: (v_n - v_b) x (v_{b+1} - v_b) points UP and INWARD toward the player!)
      indices.push(b, n, b + 1);
      indices.push(b + 1, n, n + 1);
      // Upper mountain face from foothill to peak (points UP and INWARD!)
      indices.push(b + 1, n + 1, b + 2);
      indices.push(b + 2, n + 1, n + 2);
      // Outer back-slope
      indices.push(b + 2, n + 2, b + 3);
      indices.push(b + 3, n + 2, n + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export const DayNightAtmosphere: React.FC = () => {
  const { scene } = useThree();
  const timeCyclePaused = useGameStore((s) => s.timeCyclePaused);

  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.FogExp2>(null);
  const celestialGroupRef = useRef<THREE.Group>(null);
  const skyDomeRef = useRef<THREE.Mesh>(null);
  const starsMatRef = useRef<THREE.PointsMaterial>(null);

  // Custom Atmospheric Gradient Sky Dome Shader (Zero texture lookups, pure smooth gradient + sun glow)
  const skyShaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenithColor: { value: new THREE.Color('#6b4d6e') },
        uHorizonColor: { value: new THREE.Color('#df8d6b') },
        uSunColor: { value: new THREE.Color('#ff9b54') },
        uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.5).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying vec3 vWorldDir;
        void main() {
          float h = clamp(vWorldDir.y, 0.0, 1.0);
          float horizonCurve = pow(h, 0.52);
          vec3 col = mix(uHorizonColor, uZenithColor, horizonCurve);

          // Soft atmospheric solar halo near sun direction
          float sunDot = max(0.0, dot(normalize(vWorldDir), uSunDir));
          float halo = pow(sunDot, 6.0) * 0.28 + pow(sunDot, 32.0) * 0.35;
          col += uSunColor * halo * (1.0 - h * 0.65);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  // 2 Concentric Rings of Distant Firewatch Mountain Silhouettes (anchored at 780m so zero gap behind 1,600m Mirror Lake!)
  const { innerRangeGeo, outerRangeGeo } = useMemo(() => {
    return {
      innerRangeGeo: createDistantMountainRingGeometry(780, 1080, 128, 210, 1.2, true),
      outerRangeGeo: createDistantMountainRingGeometry(980, 1340, 144, 310, 4.7, false),
    };
  }, []);

  const starPositions = useMemo(() => {
    const count = 450;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const r = 420;
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi);
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return arr;
  }, []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const p = mutablePhysics;

    if (!timeCyclePaused && !p.isPaused) {
      p.timeOfDay = (p.timeOfDay + dt * 0.1) % 24.0;
    }

    const h = p.timeOfDay;

    let k0 = PALETTE_KEYFRAMES[0];
    let k1 = PALETTE_KEYFRAMES[1];
    for (let i = 0; i < PALETTE_KEYFRAMES.length - 1; i++) {
      if (h >= PALETTE_KEYFRAMES[i].hour && h <= PALETTE_KEYFRAMES[i + 1].hour) {
        k0 = PALETTE_KEYFRAMES[i];
        k1 = PALETTE_KEYFRAMES[i + 1];
        break;
      }
    }

    const span = Math.max(0.001, k1.hour - k0.hour);
    const alpha = THREE.MathUtils.smoothstep((h - k0.hour) / span, 0, 1);

    _zenithCol.copy(k0.zenith).lerp(k1.zenith, alpha);
    _skyCol.copy(k0.sky).lerp(k1.sky, alpha);
    _fogCol.copy(k0.fog).lerp(k1.fog, alpha);
    _sunCol.copy(k0.sunColor).lerp(k1.sunColor, alpha);
    _hemiSky.copy(k0.hemiSky).lerp(k1.hemiSky, alpha);
    _hemiGround.copy(k0.hemiGround).lerp(k1.hemiGround, alpha);

    const fogDensity = THREE.MathUtils.lerp(k0.fogDensity, k1.fogDensity, alpha);
    const sunIntensity = THREE.MathUtils.lerp(k0.sunIntensity, k1.sunIntensity, alpha);
    const hemiIntensity = THREE.MathUtils.lerp(k0.hemiIntensity, k1.hemiIntensity, alpha);
    const nightFactor = THREE.MathUtils.lerp(k0.nightFactor, k1.nightFactor, alpha);

    p.nightFactor = nightFactor;
    p.headlampOn = nightFactor > 0.35;

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_fogCol);
    } else {
      scene.background = _fogCol.clone();
    }

    if (fogRef.current) {
      fogRef.current.color.copy(_fogCol);
      fogRef.current.density = fogDensity;
    }

    if (hemiLightRef.current) {
      hemiLightRef.current.color.copy(_hemiSky);
      hemiLightRef.current.groundColor.copy(_hemiGround);
      hemiLightRef.current.intensity = hemiIntensity;
    }

    const sunAngle = ((h - 6.0) / 24.0) * Math.PI * 2;
    const sunElev = Math.sin(sunAngle);
    const sunHoriz = Math.cos(sunAngle);

    const activeElev = Math.max(0.28, Math.abs(sunElev));
    const lightOffsetX = sunHoriz * 85;
    const lightOffsetY = activeElev * 115;
    const lightOffsetZ = -55;

    // Update Sky Gradient Dome Uniforms & Position
    skyShaderMaterial.uniforms.uZenithColor.value.copy(_zenithCol);
    skyShaderMaterial.uniforms.uHorizonColor.value.copy(_fogCol);
    skyShaderMaterial.uniforms.uSunColor.value.copy(_sunCol);
    skyShaderMaterial.uniforms.uSunDir.value
      .set(lightOffsetX, lightOffsetY, lightOffsetZ)
      .normalize();

    if (skyDomeRef.current) {
      skyDomeRef.current.position.set(p.position.x, p.position.y, p.position.z);
    }

    if (dirLightRef.current) {
      dirLightRef.current.color.copy(_sunCol);
      dirLightRef.current.intensity = sunIntensity;
      dirLightRef.current.position.set(
        p.position.x + lightOffsetX,
        p.position.y + lightOffsetY,
        p.position.z + lightOffsetZ
      );
      dirLightRef.current.target.position.copy(p.position);
      dirLightRef.current.target.updateMatrixWorld();
    }

    if (celestialGroupRef.current) {
      celestialGroupRef.current.position.set(p.position.x, 0, p.position.z);
      celestialGroupRef.current.rotation.z = sunAngle;
    }

    if (starsMatRef.current) {
      starsMatRef.current.opacity = THREE.MathUtils.clamp((nightFactor - 0.25) * 1.4, 0, 0.9);
    }
  });

  return (
    <>
      <fogExp2 ref={fogRef} attach="fog" args={['#df8d6b', 0.0020]} />
      <hemisphereLight ref={hemiLightRef} args={['#ffd2ba', '#5a6b5c', 0.95]} />

      {/* Atmospheric Gradient Sky Dome */}
      <mesh ref={skyDomeRef} material={skyShaderMaterial} frustumCulled={false}>
        <sphereGeometry args={[1750, 32, 20]} />
      </mesh>

      {/* Distant Horizon Mountain Ranges (Firewatch / Alto Layered Silhouettes) */}
      <mesh geometry={innerRangeGeo} position={[0, 0, 0]} frustumCulled={false}>
        <meshStandardMaterial color="#354f52" flatShading roughness={0.96} metalness={0.0} />
      </mesh>
      <mesh geometry={outerRangeGeo} position={[0, 0, 0]} frustumCulled={false}>
        <meshStandardMaterial color="#283d42" flatShading roughness={0.98} metalness={0.0} />
      </mesh>

      <directionalLight
        ref={dirLightRef}
        position={[65, 115, -240]}
        intensity={2.15}
        color="#ff9b54"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-camera-left={-78}
        shadow-camera-right={78}
        shadow-camera-top={78}
        shadow-camera-bottom={-78}
        shadow-bias={-0.0005}
      />

      <group ref={celestialGroupRef}>
        <mesh position={[320, 0, -210]}>
          <icosahedronGeometry args={[18, 1]} />
          <meshBasicMaterial color="#ffbe76" fog={false} />
        </mesh>
        <mesh position={[-320, 0, -210]}>
          <icosahedronGeometry args={[13, 1]} />
          <meshBasicMaterial color="#dbeafe" fog={false} />
        </mesh>
      </group>

      <points position={[0, 20, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={starPositions.length / 3}
            array={starPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={starsMatRef}
          color="#f8fafc"
          size={2.2}
          transparent
          opacity={0}
          fog={false}
          sizeAttenuation={false}
        />
      </points>
    </>
  );
};
