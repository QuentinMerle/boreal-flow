import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mutablePhysics, useGameStore } from '../state/gameStore';
import { WATER_LEVEL } from '../world/terrainData';

const DUST_COUNT = 80;
const WAKE_COUNT = 48;
const POOF_COUNT = 20;

interface ParticleData {
  active: boolean;
  age: number;
  maxAge: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
}

const _dummy = new THREE.Object3D();

/**
 * Step 1.4 & Step 3.1 - Visual Feedback (Juice)
 * 1. Instanced dust/urethane smoke particles when drifting or riding fast on dirt/asphalt.
 * 2. Instanced foam wake trail when gliding on water.
 * 3. Instanced "Poof" cloud burst on contextual vehicle transitions!
 */
export const ParticleJuice: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const dustMeshRef = useRef<THREE.InstancedMesh>(null);
  const wakeMeshRef = useRef<THREE.InstancedMesh>(null);
  const poofMeshRef = useRef<THREE.InstancedMesh>(null);

  const dustPool = useMemo<ParticleData[]>(
    () =>
      Array.from({ length: DUST_COUNT }, () => ({
        active: false,
        age: 0,
        maxAge: 0.6,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0,
      })),
    []
  );

  const wakePool = useMemo<ParticleData[]>(
    () =>
      Array.from({ length: WAKE_COUNT }, () => ({
        active: false,
        age: 0,
        maxAge: 1.1,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0,
      })),
    []
  );

  const poofPool = useMemo<ParticleData[]>(
    () =>
      Array.from({ length: POOF_COUNT }, () => ({
        active: false,
        age: 0,
        maxAge: 0.5,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0,
      })),
    []
  );

  const timers = useRef({
    dustAccum: 0,
    wakeAccum: 0,
    dustCursor: 0,
    wakeCursor: 0,
    lastPoofCounter: mutablePhysics.poofCounter,
  });

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const p = mutablePhysics;
    const t = timers.current;

    // --- 0. Check for Contextual Transition "Poof" Burst (Step 3.1) ---
    if (p.poofCounter !== t.lastPoofCounter) {
      t.lastPoofCounter = p.poofCounter;
      const origin = p.poofPosition;
      for (let i = 0; i < POOF_COUNT; i++) {
        const pf = poofPool[i];
        pf.active = true;
        pf.age = 0;
        pf.maxAge = 0.42 + (i % 4) * 0.08;
        const angle = (i / POOF_COUNT) * Math.PI * 2;
        const speed = 2.8 + (i % 3) * 1.4;
        pf.x = origin.x + Math.cos(angle) * 0.35;
        pf.y = origin.y + 0.65 + (i % 3) * 0.25;
        pf.z = origin.z + Math.sin(angle) * 0.35;
        pf.vx = Math.cos(angle) * speed;
        pf.vy = 1.5 + (i % 4) * 0.9;
        pf.vz = Math.sin(angle) * speed;
        pf.scale = 0.48 + (i % 3) * 0.15;
      }
    }

    if (poofMeshRef.current) {
      for (let i = 0; i < POOF_COUNT; i++) {
        const pf = poofPool[i];
        if (!pf.active) {
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          poofMeshRef.current.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        pf.age += dt;
        if (pf.age >= pf.maxAge) {
          pf.active = false;
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
        } else {
          pf.x += pf.vx * dt;
          pf.y += pf.vy * dt;
          pf.z += pf.vz * dt;
          pf.vx *= Math.exp(-5 * dt);
          pf.vz *= Math.exp(-5 * dt);
          const lifeRatio = 1.0 - pf.age / pf.maxAge;
          _dummy.position.set(pf.x, pf.y, pf.z);
          _dummy.rotation.set(pf.age * 4, pf.age * 3, 0);
          _dummy.scale.setScalar(pf.scale * lifeRatio);
        }
        _dummy.updateMatrix();
        poofMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      poofMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- 1. Spawn Dust / Drift Particles ---
    const onLand = p.isGrounded && p.surface !== 'WATER' && p.specialState === 'NONE';
    const shouldEmitDust =
      onLand && (p.isDrifting || (p.surface === 'DIRT' && p.speed > 7) || p.speed > 18);

    if (shouldEmitDust) {
      const rate = p.isDrifting ? 0.018 : 0.045;
      t.dustAccum += dt;
      while (t.dustAccum >= rate) {
        t.dustAccum -= rate;
        const idx = t.dustCursor % DUST_COUNT;
        t.dustCursor++;
        const pt = dustPool[idx];
        pt.active = true;
        pt.age = 0;
        pt.maxAge = p.isDrifting ? 0.55 : 0.4;
        const jitterX = (Math.random() - 0.5) * 0.5;
        const jitterZ = (Math.random() - 0.5) * 0.5;
        pt.x = p.position.x - p.forward.x * 0.6 + jitterX;
        pt.y = p.position.y + 0.15;
        pt.z = p.position.z - p.forward.z * 0.6 + jitterZ;
        pt.vx = -p.velocity.x * 0.15 + (Math.random() - 0.5) * 1.8;
        pt.vy = 1.2 + Math.random() * 1.5;
        pt.vz = -p.velocity.z * 0.15 + (Math.random() - 0.5) * 1.8;
        pt.scale = p.isDrifting ? 0.42 : 0.26;
      }
    }

    if (dustMeshRef.current) {
      for (let i = 0; i < DUST_COUNT; i++) {
        const pt = dustPool[i];
        if (!pt.active) {
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          dustMeshRef.current.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        pt.age += dt;
        if (pt.age >= pt.maxAge) {
          pt.active = false;
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
        } else {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.z += pt.vz * dt;
          const lifeRatio = 1.0 - pt.age / pt.maxAge;
          _dummy.position.set(pt.x, pt.y, pt.z);
          _dummy.rotation.set(pt.age * 3, pt.age * 2, 0);
          _dummy.scale.setScalar(pt.scale * lifeRatio);
        }
        _dummy.updateMatrix();
        dustMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      dustMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- 2. Spawn Water Foam Wake Trail ---
    const inWater = p.waterDepth > 0.15 && p.speed > 1.2 && p.specialState === 'NONE';
    if (inWater) {
      t.wakeAccum += dt;
      if (t.wakeAccum >= 0.04) {
        t.wakeAccum = 0;
        for (const side of [-1, 1]) {
          const idx = t.wakeCursor % WAKE_COUNT;
          t.wakeCursor++;
          const wk = wakePool[idx];
          wk.active = true;
          wk.age = 0;
          wk.maxAge = 1.15;
          const rightX = p.forward.z;
          const rightZ = -p.forward.x;
          wk.x = p.position.x - p.forward.x * 0.9 + rightX * side * 0.45;
          wk.y = WATER_LEVEL + 0.04;
          wk.z = p.position.z - p.forward.z * 0.9 + rightZ * side * 0.45;
          wk.vx = rightX * side * (1.2 + p.speed * 0.08);
          wk.vy = 0;
          wk.vz = rightZ * side * (1.2 + p.speed * 0.08);
          wk.scale = 0.35 + Math.min(0.45, p.speed * 0.02);
        }
      }
    }

    if (wakeMeshRef.current) {
      for (let i = 0; i < WAKE_COUNT; i++) {
        const wk = wakePool[i];
        if (!wk.active) {
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          wakeMeshRef.current.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        wk.age += dt;
        if (wk.age >= wk.maxAge) {
          wk.active = false;
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
        } else {
          wk.x += wk.vx * dt;
          wk.z += wk.vz * dt;
          const progress = wk.age / wk.maxAge;
          const currentScale = wk.scale * (1.0 + progress * 1.4) * (1.0 - progress);
          _dummy.position.set(wk.x, wk.y, wk.z);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.set(currentScale, 0.05, currentScale);
        }
        _dummy.updateMatrix();
        wakeMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      wakeMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  const dustColor = mode === 'LONGBOARD' ? '#e6dfd5' : '#c89b7b';

  return (
    <group>
      {/* Instanced Low-Poly Dust / Drift Smoke Puffs */}
      <instancedMesh ref={dustMeshRef} args={[undefined, undefined, DUST_COUNT]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={dustColor} flatShading roughness={0.95} />
      </instancedMesh>

      {/* Instanced Water Wake Foam Rings */}
      <instancedMesh ref={wakeMeshRef} args={[undefined, undefined, WAKE_COUNT]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color="#e0f4f7" flatShading roughness={0.4} />
      </instancedMesh>

      {/* Step 3.1: Instanced "Poof" Transition Cloud Puffs */}
      <instancedMesh ref={poofMeshRef} args={[undefined, undefined, POOF_COUNT]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#fffbeb"
          emissive="#ffd166"
          emissiveIntensity={0.35}
          flatShading
        />
      </instancedMesh>
    </group>
  );
};
