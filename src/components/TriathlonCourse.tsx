import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  mutablePhysics,
  useGameStore,
  CAMPFIRE_WORLD_POS,
  BadgeType,
} from '../state/gameStore';
import { getTerrainHeightOnly } from '../world/terrainData';
import { soundscape } from '../audio/soundscape';

const SMOKE_PUFF_COUNT = 64;
const _smokeDummy = new THREE.Object3D();
const _puffColor = new THREE.Color();

// Stylized Boreal Smoke Color Palette
const _baseEmberCol = new THREE.Color('#ffaa64'); // Warm golden amber glow near hearth
const _cloudWhiteCol = new THREE.Color('#fdfcf7'); // Creamy marshmallow cloud
const _highMistCol = new THREE.Color('#d2e0f0'); // Airy sky mist

const _goldenEmberCol = new THREE.Color('#ff8f42');
const _goldenCloudCol = new THREE.Color('#fed7aa');
const _goldenMistCol = new THREE.Color('#cbd5e1');

const _nightEmberCol = new THREE.Color('#ff6a33');
const _nightCloudCol = new THREE.Color('#64748b');
const _nightMistCol = new THREE.Color('#334155');

/**
 * Step 3.1 & 3.2: Boreal Triathlon & Diegetic Zero-HUD Navigation (1,000m Canyon Map)
 * 1. 68m Rising Campfire Smoke Plume: Visible across the entire 1,000m mountain range.
 * 2. Diegetic Summit Start Line (Z=-420) & Lakeside Finish Gate (Z=+230).
 * 3. Automatic Run Tracking & Finish Badge Evaluation (Maple Leaf, Jay Feather, Moose Antlers).
 */
export const TriathlonCourse: React.FC = () => {
  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Summit Start Marker Coordinates (1,600m Map)
  const startX = -12;
  const startZ = -715;
  const summitY = getTerrainHeightOnly(startX, startZ);

  // Lakeside Finish Gate Coordinates (1,600m Map)
  const finishX = -15.0;
  const finishZ = 460.0;
  const finishY = getTerrainHeightOnly(finishX, finishZ);

  // Exact Campfire Stone Pit Coordinates matching TerrainChunk.tsx
  const campX = CAMPFIRE_WORLD_POS.x;
  const campZ = CAMPFIRE_WORLD_POS.z;
  const campY = getTerrainHeightOnly(campX, campZ);

  // Pre-calculate randomized smoke offsets
  const smokeOffsets = useMemo(() => {
    return Array.from({ length: SMOKE_PUFF_COUNT }, (_, i) => ({
      phase: i / SMOKE_PUFF_COUNT,
      wobbleSpeedX: 0.8 + ((i * 17) % 7) * 0.1,
      wobbleSpeedZ: 0.7 + ((i * 13) % 9) * 0.1,
      wobbleAmpX: 0.75 + ((i * 23) % 5) * 0.25,
      wobbleAmpZ: 0.65 + ((i * 19) % 6) * 0.22,
      baseScale: 0.65 + ((i * 11) % 4) * 0.15,
    }));
  }, []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const p = mutablePhysics;
    if (p.isPaused) return;
    const t = state.clock.elapsedTime;
    const mode = useGameStore.getState().mode;

    // --- 1. ANIMATE RISING SMOKE PLUME (ZERO ALLOCATIONS) ---
    if (smokeMeshRef.current) {
      const plumeHeight = 72.0;

      const isNight = p.nightFactor > 0.4;
      const isGolden = !isNight && p.timeOfDay > 16.5 && p.timeOfDay < 19.5;

      const emberCol = isNight ? _nightEmberCol : (isGolden ? _goldenEmberCol : _baseEmberCol);
      const cloudCol = isNight ? _nightCloudCol : (isGolden ? _goldenCloudCol : _cloudWhiteCol);
      const mistCol = isNight ? _nightMistCol : (isGolden ? _goldenMistCol : _highMistCol);

      for (let i = 0; i < SMOKE_PUFF_COUNT; i++) {
        const off = smokeOffsets[i];
        const progress = (t * 0.075 + off.phase) % 1.0;

        // Altitude: curves upward with accelerating hot thermal draft
        const currY = campY + 0.42 + Math.pow(progress, 0.85) * plumeHeight;

        // Thermal convection vortex + gentle valley wind drift
        // Swirl starts strictly at 0 at progress=0 so puffs originate exactly from the burning logs!
        const vortexAngle = t * 0.35 + off.phase * 6.28 + currY * 0.08;
        const swirlRadius = Math.pow(progress, 0.95) * 3.6 * off.wobbleAmpX;
        const windX = Math.sin(vortexAngle) * swirlRadius + Math.pow(progress, 1.35) * 2.2;
        const windZ = Math.cos(vortexAngle) * swirlRadius + Math.pow(progress, 1.35) * 4.2;

        _smokeDummy.position.set(campX + windX, currY, campZ + windZ);

        // Organic billowing scale envelope:
        // Tiny at embers (0.35m) -> swells to expansive cumulus puff (4.8m) -> softly shrinks to 0 before disappearing!
        const bellCurve = Math.sin(progress * Math.PI);
        const swellFactor = Math.pow(bellCurve, 0.72);
        const puffScale = (0.28 + swellFactor * 4.2) * off.baseScale;
        const aspectY = 0.82 + swellFactor * 0.22;

        _smokeDummy.scale.set(puffScale, puffScale * aspectY, puffScale * 1.04);
        _smokeDummy.rotation.set(
          currY * 0.15 + t * 0.1,
          t * 0.18 + i * 0.45,
          Math.sin(t * 0.25 + i) * 0.25
        );
        _smokeDummy.updateMatrix();

        smokeMeshRef.current.setMatrixAt(i, _smokeDummy.matrix);

        // Organic 3-stage color gradient
        if (progress < 0.16) {
          const tCol = progress / 0.16;
          _puffColor.copy(emberCol).lerp(cloudCol, tCol);
        } else if (progress < 0.62) {
          const tCol = (progress - 0.16) / 0.46;
          _puffColor.copy(cloudCol).lerp(mistCol, tCol);
        } else {
          _puffColor.copy(mistCol);
        }

        smokeMeshRef.current.setColorAt(i, _puffColor);
      }
      smokeMeshRef.current.instanceMatrix.needsUpdate = true;
      if (smokeMeshRef.current.instanceColor) {
        smokeMeshRef.current.instanceColor.needsUpdate = true;
      }
    }

    // Dynamic plume opacity for night/dusk
    if (smokeMatRef.current) {
      if (p.nightFactor > 0.4) {
        smokeMatRef.current.opacity = 0.32;
      } else if (p.timeOfDay > 16.5 && p.timeOfDay < 19.5) {
        smokeMatRef.current.opacity = 0.44;
      } else {
        smokeMatRef.current.opacity = 0.40;
      }
    }

    // --- 2. BOREAL TRIATHLON LOGIC & RUN STATE MACHINE (1,600m Course - Manual Start via [E] / (X)) ---
    if (p.triathlonStatus === 'ACTIVE') {
      p.triathlonTimer += dt;

      // Track multi-sport chaining
      if (!p.triathlonVehicles.includes(mode)) {
        useGameStore.getState().updateTriathlonVehicle(mode);
      }

      // Finish Trigger: Player enters Lakeside Camp or Canoe Dock perimeter
      const distToFire = Math.hypot(p.position.x - CAMPFIRE_WORLD_POS.x, p.position.z - CAMPFIRE_WORLD_POS.z);
      const distToDock = Math.hypot(p.position.x - 2, p.position.z - 482);
      const distToFinishGate = Math.hypot(p.position.x - finishX, p.position.z - finishZ);

      const reachedLakeside = distToFire < 15.0 || distToDock < 14.0 || distToFinishGate < 10.5;

      if (reachedLakeside && p.position.z > 445) {
        const finalTime = p.triathlonTimer;
        let badge: BadgeType = 'MOOSE';
        if (finalTime <= 95.0) {
          badge = 'MAPLE'; // Gold tier (<= 1m35s on 1,600m course)
        } else if (finalTime <= 135.0) {
          badge = 'JAY'; // Silver tier (<= 2m15s)
        }

        useGameStore.getState().finishTriathlon(finalTime, badge);
        soundscape.triggerFinishFanfare();

        // Gamepad celebration rumble
        const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
        const pad = gamepads[0] || gamepads[1];
        if (pad && pad.vibrationActuator && typeof pad.vibrationActuator.playEffect === 'function') {
          pad.vibrationActuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: 500,
            weakMagnitude: 0.7,
            strongMagnitude: 0.9,
          }).catch(() => {});
        }
      }
    }
  });

  return (
    <group>
      {/* 72m Billowing Low-Poly Campfire Smoke Plume */}
      <instancedMesh
        ref={smokeMeshRef}
        args={[undefined, undefined, SMOKE_PUFF_COUNT]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[0.72, 1]} />
        <meshStandardMaterial
          ref={smokeMatRef}
          color="#ffffff"
          roughness={0.92}
          metalness={0.02}
          transparent
          opacity={0.4}
          flatShading
          depthWrite={false}
        />
      </instancedMesh>

      {/* Summit Trailhead Start Arch (at z = -420) */}
      <group position={[startX, summitY, startZ]}>
        {/* Left Post */}
        <mesh castShadow receiveShadow position={[-3.2, 2.1, 0]}>
          <cylinderGeometry args={[0.22, 0.24, 4.4, 7]} />
          <meshStandardMaterial color="#6a492b" flatShading roughness={0.9} />
        </mesh>
        {/* Right Post */}
        <mesh castShadow receiveShadow position={[3.2, 2.1, 0]}>
          <cylinderGeometry args={[0.22, 0.24, 4.4, 7]} />
          <meshStandardMaterial color="#6a492b" flatShading roughness={0.9} />
        </mesh>
        {/* Horizontal Wooden Lintel */}
        <mesh castShadow receiveShadow position={[0, 4.0, 0]}>
          <boxGeometry args={[7.2, 0.45, 0.35]} />
          <meshStandardMaterial color="#8b5a2b" flatShading roughness={0.88} />
        </mesh>
        {/* Start Signboard */}
        <mesh position={[0, 3.4, 0.12]}>
          <boxGeometry args={[4.8, 0.75, 0.1]} />
          <meshStandardMaterial color="#eb5e46" flatShading roughness={0.85} />
        </mesh>
      </group>

      {/* Lakeside Finish Arch (at z = +230) */}
      <group position={[finishX, finishY, finishZ]} rotation={[0, -0.22, 0]}>
        {/* Left Post */}
        <mesh castShadow receiveShadow position={[-3.0, 2.2, 0]}>
          <cylinderGeometry args={[0.24, 0.26, 4.6, 7]} />
          <meshStandardMaterial color="#5c3d22" flatShading roughness={0.9} />
        </mesh>
        {/* Right Post */}
        <mesh castShadow receiveShadow position={[3.0, 2.2, 0]}>
          <cylinderGeometry args={[0.24, 0.26, 4.6, 7]} />
          <meshStandardMaterial color="#5c3d22" flatShading roughness={0.9} />
        </mesh>
        {/* Crossbeam */}
        <mesh castShadow receiveShadow position={[0, 4.2, 0]}>
          <boxGeometry args={[6.8, 0.5, 0.38]} />
          <meshStandardMaterial color="#7a4b27" flatShading roughness={0.88} />
        </mesh>
        {/* Finish Banner */}
        <mesh position={[0, 3.5, 0.14]}>
          <boxGeometry args={[5.2, 0.85, 0.1]} />
          <meshStandardMaterial color="#ffd166" flatShading roughness={0.8} />
        </mesh>
        {/* Hanging Lantern */}
        <mesh position={[0, 2.8, 0]}>
          <cylinderGeometry args={[0.12, 0.16, 0.32, 6]} />
          <meshStandardMaterial color="#f4a261" emissive="#ff9f1c" emissiveIntensity={0.8} />
        </mesh>
      </group>
    </group>
  );
};
