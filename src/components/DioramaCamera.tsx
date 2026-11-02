import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mutablePhysics, useGameStore, CAMPFIRE_WORLD_POS } from '../state/gameStore';
import { WILDLIFE_SPECIES } from '../world/parkActivitiesData';
import { getTerrainHeightOnly } from '../world/terrainData';
import { soundscape } from '../audio/soundscape';

// Module-scope scratch vectors (ZERO allocations inside useFrame)
const _desiredPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _smoothPos = new THREE.Vector3(-10, 218, -468);
const _smoothLookAt = new THREE.Vector3(-10, 208, -435);
const _velLead = new THREE.Vector3();
const _forwardLead = new THREE.Vector3();
const _binoDir = new THREE.Vector3();
const _toBird = new THREE.Vector3();

/**
 * Step 1.2, Step 3.2 & Step 4.2 - The Diorama Camera + Binoculars Scanner + Cozy Campfire Zoom
 */
export const DioramaCamera: React.FC = () => {
  const initialized = useRef(false);
  const stillTimer = useRef(0);
  const mode = useGameStore((s) => s.mode);
  const binocularsActive = useGameStore((s) => s.binocularsActive);
  const discoverBird = useGameStore((s) => s.discoverBird);
  const discoveredBirds = useGameStore((s) => s.discoveredBirds);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const p = mutablePhysics;
    const pos = p.position;
    const vel = p.velocity;
    const fwd = p.forward;
    const speed = p.speed;
    const cam = state.camera as THREE.PerspectiveCamera;

    // Strict horizon upright orientation (no roll nausea)
    cam.up.set(0, 1, 0);

    if (!initialized.current) {
      _smoothPos.set(pos.x, pos.y + 18, pos.z - 22);
      _smoothLookAt.copy(pos);
      initialized.current = true;
    }

    // --- BINOCULARS ZOOM & WILDLIFE SCANNING MODE (Step 3.2) ---
    if (binocularsActive) {
      cam.fov = THREE.MathUtils.damp(cam.fov, 16, 6.5, dt);
      cam.updateProjectionMatrix();

      _desiredPos.set(pos.x, pos.y + 1.85, pos.z);
      const cy = Math.cos(p.binocularsPitch);
      _binoDir.set(
        Math.sin(p.binocularsYaw) * cy,
        Math.sin(p.binocularsPitch),
        Math.cos(p.binocularsYaw) * cy
      ).normalize();

      _desiredLookAt.copy(_desiredPos).addScaledVector(_binoDir, 40);

      _smoothPos.lerp(_desiredPos, Math.min(1, dt * 12));
      _smoothLookAt.lerp(_desiredLookAt, Math.min(1, dt * 12));
      cam.position.copy(_smoothPos);
      cam.lookAt(_smoothLookAt);

      let matchedId: string | null = null;
      for (const w of WILDLIFE_SPECIES) {
        _toBird.subVectors(w.basePos, _desiredPos);
        const dist = _toBird.length();
        if (dist < 280) {
          _toBird.normalize();
          const alignment = _binoDir.dot(_toBird);
          if (alignment > 0.965) {
            matchedId = w.id;
            break;
          }
        }
      }

      p.targetedBirdId = matchedId;
      if (matchedId) {
        p.scanProgress = Math.min(1.0, p.scanProgress + dt * 1.35);
        if (p.scanProgress >= 1.0 && !discoveredBirds.includes(matchedId)) {
          discoverBird(matchedId);
          soundscape.triggerDiscoveryChime();
        }
      } else {
        p.scanProgress = Math.max(0, p.scanProgress - dt * 2.0);
      }

      return;
    }

    // Update Stationary Contemplation Timer
    if (speed < 0.8 && p.specialState === 'NONE') {
      stillTimer.current += dt;
    } else {
      stillTimer.current = Math.max(0, stillTimer.current - dt * 3.5);
    }
    const contemplationFactor = Math.min(1.0, Math.max(0, (stillTimer.current - 1.0) / 1.5));

    // Target FOV per mode & state (Dynamic speed-reactive FOV for exhilarating downhill flow!)
    const speedRatio = THREE.MathUtils.clamp(speed / 32, 0, 1);
    let targetFov = THREE.MathUtils.lerp(45, 58, speedRatio);
    if (p.cameraMode === 'COCKPIT') {
      targetFov = THREE.MathUtils.lerp(56, 66, speedRatio);
    } else if (p.specialState === 'CAMPFIRE') {
      targetFov = 32;
    } else if (p.specialState === 'ZIPLINE') {
      targetFov = 54;
    } else if (contemplationFactor > 0.05) {
      targetFov = THREE.MathUtils.lerp(45, 38, contemplationFactor);
    }

    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov = THREE.MathUtils.damp(cam.fov, targetFov, 5.0, dt);
      cam.updateProjectionMatrix();
    }

    // --- 1. COCKPIT / HANDLEBAR FIRST-PERSON MODE (Toggled via Key V or Gamepad R3) ---
    if (p.cameraMode === 'COCKPIT' && p.specialState === 'NONE') {
      let fwdOffset = 0.75;
      let upOffset = 1.15;

      if (mode === 'BIKE') {
        fwdOffset = 0.65;
        upOffset = 1.18;
      } else if (mode === 'LONGBOARD') {
        fwdOffset = 0.82;
        upOffset = 0.58;
      } else if (mode === 'CANOE') {
        fwdOffset = 1.62;
        upOffset = 0.65;
      } else {
        // WALK
        fwdOffset = 0.18;
        upOffset = 1.55;
      }

      _desiredPos.set(
        pos.x + fwd.x * fwdOffset,
        pos.y + upOffset,
        pos.z + fwd.z * fwdOffset
      );
      _desiredLookAt.set(
        pos.x + fwd.x * 26.0,
        pos.y + upOffset * 0.85 - 0.2,
        pos.z + fwd.z * 26.0
      );

      _smoothPos.x = THREE.MathUtils.damp(_smoothPos.x, _desiredPos.x, 14.0, dt);
      _smoothPos.y = THREE.MathUtils.damp(_smoothPos.y, _desiredPos.y, 14.0, dt);
      _smoothPos.z = THREE.MathUtils.damp(_smoothPos.z, _desiredPos.z, 14.0, dt);

      _smoothLookAt.x = THREE.MathUtils.damp(_smoothLookAt.x, _desiredLookAt.x, 16.0, dt);
      _smoothLookAt.y = THREE.MathUtils.damp(_smoothLookAt.y, _desiredLookAt.y, 12.0, dt);
      _smoothLookAt.z = THREE.MathUtils.damp(_smoothLookAt.z, _desiredLookAt.z, 16.0, dt);

      cam.position.copy(_smoothPos);
      cam.lookAt(_smoothLookAt);
      return;
    }

    // --- STEP 4.2: COZY CAMPFIRE CAMERA ZOOM-IN ---
    if (p.specialState === 'CAMPFIRE') {
      const sway = Math.sin(state.clock.elapsedTime * 0.6) * 0.45;
      _desiredPos.set(
        CAMPFIRE_WORLD_POS.x + 1.8 + sway,
        CAMPFIRE_WORLD_POS.y + 3.2,
        CAMPFIRE_WORLD_POS.z + 6.8
      );
      _desiredLookAt.set(
        CAMPFIRE_WORLD_POS.x - 0.4,
        CAMPFIRE_WORLD_POS.y + 0.85,
        CAMPFIRE_WORLD_POS.z - 0.5
      );
    }
    // --- CLIMBING CAMERA FRAMING ---
    else if (p.specialState === 'CLIMBING') {
      _desiredPos.set(pos.x, pos.y + 4.5, pos.z + 13.5);
      _desiredLookAt.set(pos.x, pos.y + 2.2, pos.z - 2.0);
    } else {
      // --- DYNAMIC LOW-SLUNG CHASE / CINEMA DIORAMA CAMERA ---
      // Lower height + closer follow distance frames the horizon, mountain drop & distant smoke plume!
      const baseHeight = THREE.MathUtils.lerp(4.8, 6.8, speedRatio);
      const baseBackDist = THREE.MathUtils.lerp(10.5, 14.2, speedRatio);

      // Stationary contemplation pulls camera even lower to gaze up at the pine canopy & vista
      const camHeight = THREE.MathUtils.lerp(baseHeight, 3.2, contemplationFactor);
      const camBackDist = THREE.MathUtils.lerp(baseBackDist, 7.6, contemplationFactor);

      // Hybrid chase vector: blends 65% behind player heading (-fwd) + 35% downhill (-Z)
      // so carving hairpins feels super dynamic while keeping downhill awareness!
      const chaseDirX = THREE.MathUtils.lerp(-fwd.x, 0, 0.35);
      const chaseDirZ = THREE.MathUtils.lerp(-fwd.z, -1.0, 0.35);
      const chaseLen = Math.hypot(chaseDirX, chaseDirZ) || 1.0;
      const normChaseX = chaseDirX / chaseLen;
      const normChaseZ = chaseDirZ / chaseLen;

      // Subtle lateral swing on turns so the player carves across the frame
      const lateralSwingX = -vel.x * 0.14 * (1 - contemplationFactor);

      const rawCamX = pos.x + normChaseX * camBackDist + lateralSwingX;
      const rawCamZ = pos.z + normChaseZ * camBackDist;
      const groundUnderCam = getTerrainHeightOnly(rawCamX, rawCamZ);
      // Ensure camera never clips into steep uphill terrain behind the player
      const safeCamY = Math.max(pos.y + camHeight, groundUnderCam + 2.3);

      _desiredPos.set(rawCamX, safeCamY, rawCamZ);

      // Look far ahead down the slope (14m to 22m ahead) so the valley vista & horizon fill the top of the frame
      const lookAheadDist = THREE.MathUtils.lerp(13.0, 21.0, speedRatio) * (1 - contemplationFactor * 0.45);
      _forwardLead.copy(fwd).multiplyScalar(lookAheadDist);
      _velLead.set(vel.x, vel.y * 0.3, vel.z).multiplyScalar(0.38 * (1 - contemplationFactor));

      const lookTargetY = THREE.MathUtils.lerp(
        pos.y + _velLead.y + 0.65 - speedRatio * 1.4,
        pos.y + 1.45,
        contemplationFactor
      );

      _desiredLookAt.set(
        pos.x + _forwardLead.x + _velLead.x,
        lookTargetY,
        pos.z + _forwardLead.z + _velLead.z
      );
    }

    const posDamp = contemplationFactor > 0.1 ? 3.5 : 6.2;
    _smoothPos.x = THREE.MathUtils.damp(_smoothPos.x, _desiredPos.x, posDamp, dt);
    _smoothPos.y = THREE.MathUtils.damp(_smoothPos.y, _desiredPos.y, 5.8, dt);
    _smoothPos.z = THREE.MathUtils.damp(_smoothPos.z, _desiredPos.z, posDamp, dt);

    _smoothLookAt.x = THREE.MathUtils.damp(_smoothLookAt.x, _desiredLookAt.x, 8.5, dt);
    _smoothLookAt.y = THREE.MathUtils.damp(_smoothLookAt.y, _desiredLookAt.y, 6.8, dt);
    _smoothLookAt.z = THREE.MathUtils.damp(_smoothLookAt.z, _desiredLookAt.z, 8.5, dt);

    cam.position.copy(_smoothPos);
    cam.lookAt(_smoothLookAt);
  });

  return null;
};
