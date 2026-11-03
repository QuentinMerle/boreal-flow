import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mutablePhysics, useGameStore } from '../state/gameStore';

interface PaletteKeyframe {
  hour: number;
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

// 4 Curated Canadian Wilderness Color Palettes with Lifted Ambient Ground Bounce
// so charcoal asphalt (#222428) and shaded slopes never clip into pure black!
const PALETTE_KEYFRAMES: PaletteKeyframe[] = [
  {
    hour: 0.0, // Deep Boreal Night
    sky: new THREE.Color('#0b1320'),
    fog: new THREE.Color('#0f1b2d'),
    fogDensity: 0.0028,
    sunColor: new THREE.Color('#7ca5d8'),
    sunIntensity: 0.65,
    hemiSky: new THREE.Color('#283e66'),
    hemiGround: new THREE.Color('#1d2e28'),
    hemiIntensity: 0.52,
    nightFactor: 1.0,
  },
  {
    hour: 6.2, // Misty Pink-Gold Dawn
    sky: new THREE.Color('#e8a598'),
    fog: new THREE.Color('#df9a8c'),
    fogDensity: 0.0027,
    sunColor: new THREE.Color('#ffaa70'),
    sunIntensity: 1.65,
    hemiSky: new THREE.Color('#ffd8be'),
    hemiGround: new THREE.Color('#526e5c'),
    hemiIntensity: 0.88,
    nightFactor: 0.15,
  },
  {
    hour: 12.5, // Crisp Canadian High Noon
    sky: new THREE.Color('#8ecae6'),
    fog: new THREE.Color('#b5dce8'),
    fogDensity: 0.0019,
    sunColor: new THREE.Color('#fff9eb'),
    sunIntensity: 2.35,
    hemiSky: new THREE.Color('#e6f6ff'),
    hemiGround: new THREE.Color('#5c7d68'),
    hemiIntensity: 1.05,
    nightFactor: 0.0,
  },
  {
    hour: 18.0, // Firewatch Golden Hour (Lifted warm ground bounce for rich shadow contrast)
    sky: new THREE.Color('#e08e6d'),
    fog: new THREE.Color('#d98a6c'),
    fogDensity: 0.0025,
    sunColor: new THREE.Color('#ff9b54'),
    sunIntensity: 2.1,
    hemiSky: new THREE.Color('#ffd2ba'),
    hemiGround: new THREE.Color('#5a6b5c'),
    hemiIntensity: 0.94,
    nightFactor: 0.1,
  },
  {
    hour: 21.5, // Deep Blue Dusk -> Night
    sky: new THREE.Color('#0b1320'),
    fog: new THREE.Color('#0f1b2d'),
    fogDensity: 0.0028,
    sunColor: new THREE.Color('#7ca5d8'),
    sunIntensity: 0.65,
    hemiSky: new THREE.Color('#283e66'),
    hemiGround: new THREE.Color('#1d2e28'),
    hemiIntensity: 0.52,
    nightFactor: 1.0,
  },
  {
    hour: 24.0, // Wrap to 0.0
    sky: new THREE.Color('#0b1320'),
    fog: new THREE.Color('#0f1b2d'),
    fogDensity: 0.0028,
    sunColor: new THREE.Color('#7ca5d8'),
    sunIntensity: 0.65,
    hemiSky: new THREE.Color('#283e66'),
    hemiGround: new THREE.Color('#1d2e28'),
    hemiIntensity: 0.52,
    nightFactor: 1.0,
  },
];

// Scratch colors (ZERO allocations in useFrame)
const _skyCol = new THREE.Color();
const _fogCol = new THREE.Color();
const _sunCol = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color();

export const DayNightAtmosphere: React.FC = () => {
  const { scene } = useThree();
  const timeCyclePaused = useGameStore((s) => s.timeCyclePaused);

  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.FogExp2>(null);
  const celestialGroupRef = useRef<THREE.Group>(null);
  const starsMatRef = useRef<THREE.PointsMaterial>(null);

  const starPositions = useMemo(() => {
    const count = 450;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const r = 380;
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
      scene.background.copy(_skyCol);
    } else {
      scene.background = _skyCol.clone();
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
      <fogExp2 ref={fogRef} attach="fog" args={['#d98a6c', 0.0029]} />
      <hemisphereLight ref={hemiLightRef} args={['#ffd2ba', '#5a6b5c', 0.94]} />

      <directionalLight
        ref={dirLightRef}
        position={[65, 115, -240]}
        intensity={2.1}
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
        <mesh position={[280, 0, -180]}>
          <icosahedronGeometry args={[18, 1]} />
          <meshBasicMaterial color="#ffbe76" fog={false} />
        </mesh>
        <mesh position={[-280, 0, -180]}>
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
