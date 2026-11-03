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

const SMOKE_PUFF_COUNT = 42;
const _smokeDummy = new THREE.Object3D();
const SMOKE_NIGHT_COL = new THREE.Color('#c5cdd8');
const SMOKE_GOLDEN_COL = new THREE.Color('#fed7aa');
const SMOKE_DAY_COL = new THREE.Color('#f4ede2');

/**
 * Step 3.1 & 3.2: Boreal Triathlon & Diegetic Zero-HUD Navigation (1,000m Canyon Map)
 * 1. 68m Rising Campfire Smoke Plume: Visible across the entire 1,000m mountain range.
 * 2. Diegetic Summit Start Line (Z=-420) & Lakeside Finish Gate (Z=+230).
 * 3. Automatic Run Tracking & Finish Badge Evaluation (Maple Leaf, Jay Feather, Moose Antlers).
 */
export const TriathlonCourse: React.FC = () => {
  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Summit Start Marker Coordinates
  const startX = -13;
  const startZ = -420;
  const summitY = getTerrainHeightOnly(startX, startZ);

  // Lakeside Finish Gate Coordinates
  const finishX = -15.0;
  const finishZ = 230.0;
  const finishY = getTerrainHeightOnly(finishX, finishZ);

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
      const campX = CAMPFIRE_WORLD_POS.x;
      const campY = CAMPFIRE_WORLD_POS.y;
      const campZ = CAMPFIRE_WORLD_POS.z;
      const plumeHeight = 68.0;

      for (let i = 0; i < SMOKE_PUFF_COUNT; i++) {
        const off = smokeOffsets[i];
        const progress = (t * 0.085 + off.phase) % 1.0;

        // Altitude: curves upward accelerating slightly with hot air draft
        const currY = campY + 0.4 + Math.pow(progress, 0.88) * plumeHeight;

        // Wind drift S-curve
        const windX = Math.sin(t * off.wobbleSpeedX + currY * 0.11) * off.wobbleAmpX * (1 + progress * 3.8);
        const windZ = Math.cos(t * off.wobbleSpeedZ + currY * 0.09) * off.wobbleAmpZ * (1 + progress * 3.0);
        const driftLateral = progress * 7.5;

        _smokeDummy.position.set(campX + windX + driftLateral, currY, campZ + windZ);

        // Scale expands as smoke billows into the air
        const puffScale = THREE.MathUtils.lerp(0.5, 4.8, progress) * off.baseScale;
        _smokeDummy.scale.set(puffScale, puffScale * 0.88, puffScale);
        _smokeDummy.rotation.set(currY * 0.2, t * 0.15 + i, 0);
        _smokeDummy.updateMatrix();

        smokeMeshRef.current.setMatrixAt(i, _smokeDummy.matrix);
      }
      smokeMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Adapt smoke tint slightly for sunset golden hour / night (zero string allocations)
    if (smokeMatRef.current) {
      if (p.nightFactor > 0.4) {
        smokeMatRef.current.color.copy(SMOKE_NIGHT_COL);
        smokeMatRef.current.opacity = 0.28;
      } else if (p.timeOfDay > 16.5 && p.timeOfDay < 19.5) {
        smokeMatRef.current.color.copy(SMOKE_GOLDEN_COL);
        smokeMatRef.current.opacity = 0.38;
      } else {
        smokeMatRef.current.color.copy(SMOKE_DAY_COL);
        smokeMatRef.current.opacity = 0.35;
      }
    }

    // --- 2. BOREAL TRIATHLON LOGIC & RUN STATE MACHINE (1,000m Course) ---
    if (p.triathlonStatus === 'IDLE') {
      const crossedStartLine = p.position.z >= -425 && p.position.z <= -385;
      const isMovingDownhill = p.velocity.z > 1.2 || (p.speed > 2.0 && p.forward.z > 0.4);

      if (crossedStartLine && isMovingDownhill && p.specialState === 'NONE') {
        useGameStore.getState().startTriathlon(mode);
        soundscape.triggerDiscoveryChime();
      }
    } else if (p.triathlonStatus === 'ACTIVE') {
      p.triathlonTimer += dt;

      // Track multi-sport chaining
      if (!p.triathlonVehicles.includes(mode)) {
        useGameStore.getState().updateTriathlonVehicle(mode);
      }

      // Finish Trigger: Player enters Lakeside Camp or Canoe Dock perimeter
      const distToFire = Math.hypot(p.position.x - CAMPFIRE_WORLD_POS.x, p.position.z - CAMPFIRE_WORLD_POS.z);
      const distToDock = Math.hypot(p.position.x - 2, p.position.z - 252);
      const distToFinishGate = Math.hypot(p.position.x - finishX, p.position.z - finishZ);

      const reachedLakeside = distToFire < 15.0 || distToDock < 14.0 || distToFinishGate < 9.5;

      if (reachedLakeside && p.position.z > 218) {
        const finalTime = p.triathlonTimer;
        let badge: BadgeType = 'MOOSE';
        if (finalTime <= 72.0) {
          badge = 'MAPLE'; // Gold tier (<= 1m12s on 1,000m course)
        } else if (finalTime <= 105.0) {
          badge = 'JAY'; // Silver tier (<= 1m45s)
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
      {/* 68m Rising Low-Poly Campfire Smoke Plume */}
      <instancedMesh
        ref={smokeMeshRef}
        args={[undefined, undefined, SMOKE_PUFF_COUNT]}
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          ref={smokeMatRef}
          color="#f4ede2"
          roughness={0.95}
          metalness={0.02}
          transparent
          opacity={0.35}
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
