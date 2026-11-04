import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  useGameStore,
  mutablePhysics,
  PHYSICS_PRESETS,
  MovementMode,
  TIME_PRESET_HOURS,
  CAMPFIRE_WORLD_POS,
  CAMPFIRE_SEAT_POS,
  triggerPoofEffect,
  triggerPlayerEmote,
} from '../state/gameStore';
import {
  sampleTerrain,
  WATER_LEVEL,
  TERRAIN_WIDTH,
  TERRAIN_LENGTH,
  getTerrainHeightOnly,
  FALLEN_LOGS,
  KICKER_Z_CENTERS,
  getRiverCurrentVector,
  queryObstacleCollision,
  getUpstreamCheckpoint,
} from '../world/terrainData';
import {
  TRANSITION_STATIONS,
  WILDLIFE_SPECIES,
  TOWER_BASE_X,
  TOWER_BASE_Y,
  TOWER_BASE_Z,
  TOWER_DECK_HEIGHT,
  ZIPLINE_START,
  ZIPLINE_END,
  getZiplinePoint,
} from '../world/parkActivitiesData';
import { soundscape } from '../audio/soundscape';

// Module-scope scratch vectors (ZERO allocations inside useFrame)
const _groundNormal = new THREE.Vector3(0, 1, 0);
const _smoothGroundNormal = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3(0, 0, 1);
const _right = new THREE.Vector3(1, 0, 0);
const _slopeDown = new THREE.Vector3();
const _velHorizontal = new THREE.Vector3();
const _riverCurrent = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _upVec = new THREE.Vector3(0, 1, 0);
const _rotMatrix = new THREE.Matrix4();
const _slopeForward = new THREE.Vector3();
const _slopeRight = new THREE.Vector3();
const _zipPos = new THREE.Vector3();
const _zipNext = new THREE.Vector3();
const _checkpointPos = new THREE.Vector3();
const _checkpointTan = new THREE.Vector3();

interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  driftOrHop: boolean;
  shiftDrift: boolean;
}

interface CharacterJointRefs {
  torso: React.MutableRefObject<THREE.Object3D | null>;
  head: React.MutableRefObject<THREE.Object3D | null>;
  scarf: React.MutableRefObject<THREE.Object3D | null>;
  leftArm: React.MutableRefObject<THREE.Object3D | null>;
  rightArm: React.MutableRefObject<THREE.Object3D | null>;
  leftLeg: React.MutableRefObject<THREE.Object3D | null>;
  rightLeg: React.MutableRefObject<THREE.Object3D | null>;
}

export const ArcadeController: React.FC = () => {
  const mode = useGameStore((s) => s.mode);
  const spawnCounter = useGameStore((s) => s.spawnCounter);
  const spawnTarget = useGameStore((s) => s.spawnTarget);
  const audioMuted = useGameStore((s) => s.audioMuted);
  const binocularsActive = useGameStore((s) => s.binocularsActive);
  const setMode = useGameStore((s) => s.setMode);
  const toggleBinoculars = useGameStore((s) => s.toggleBinoculars);

  const rootGroupRef = useRef<THREE.Group>(null);
  const visualTiltRef = useRef<THREE.Group>(null);
  const paddleRef = useRef<THREE.Object3D | null>(null);
  const bikeSteerRef = useRef<THREE.Object3D | null>(null);
  const bikeFrontWheelRef = useRef<THREE.Object3D | null>(null);
  const bikeRearWheelRef = useRef<THREE.Object3D | null>(null);
  const bikeCrankRef = useRef<THREE.Object3D | null>(null);
  const longboardWheelsRef = useRef<(THREE.Object3D | null)[]>([]);
  const headlampRef = useRef<THREE.SpotLight>(null);
  const headlampTargetRef = useRef<THREE.Object3D>(null);
  const headlampLensMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const emoteRingRef = useRef<THREE.Mesh>(null);

  // Expressive Character Rig Joint Refs
  const torsoRef = useRef<THREE.Object3D | null>(null);
  const headRef = useRef<THREE.Object3D | null>(null);
  const scarfRef = useRef<THREE.Object3D | null>(null);
  const leftArmRef = useRef<THREE.Object3D | null>(null);
  const rightArmRef = useRef<THREE.Object3D | null>(null);
  const leftLegRef = useRef<THREE.Object3D | null>(null);
  const rightLegRef = useRef<THREE.Object3D | null>(null);

  const joints: CharacterJointRefs = {
    torso: torsoRef,
    head: headRef,
    scarf: scarfRef,
    leftArm: leftArmRef,
    rightArm: rightArmRef,
    leftLeg: leftLegRef,
    rightLeg: rightLegRef,
  };

  const inputRef = useRef<InputState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    driftOrHop: false,
    shiftDrift: false,
  });

  const gamepadPrevButtons = useRef<Record<number, boolean>>({});
  const lastRumbleTime = useRef(0);

  const springState = useRef({
    roll: 0,
    pitch: 0,
    carveYaw: 0,
    bounceY: 0,
    bounceVel: 0,
    smoothSteer: 0,
    prevSteer: 0,
    hopCooldown: 0,
    crashCooldown: 0,
    pushTimer: 0,
    pushAnimTimer: 0,
    driftCharge: 0,
    walkBob: 0,
    pedalPhase: 0,
    wheelAngle: 0,
    prevGroundY: 210,
    prevClimbVel: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
  });

  useEffect(() => {
    soundscape.setMuted(audioMuted);
  }, [audioMuted]);

  // Spawn / Teleport logic (1,600m Red Bull Rampage -> Mirror Lake coordinates)
  useEffect(() => {
    const p = mutablePhysics;

    if (spawnTarget === 'SUMMIT_ROAD') {
      p.specialState = 'NONE';
      p.position.set(-10, 335, -756);
      p.yaw = 0.0;
    } else if (spawnTarget === 'SUMMIT_TRAIL') {
      p.specialState = 'NONE';
      p.position.set(16, 335, -756);
      p.yaw = 0.22;
    } else if (spawnTarget === 'LAKE_SHORE') {
      p.specialState = 'NONE';
      // Spawn at the High-Mountain Whitewater Rapids Put-In (Z = -316)
      p.position.set(52, 195, -316);
      p.yaw = 0.28;
    } else if (spawnTarget === 'FIREWATCH_TOWER') {
      p.specialState = 'NONE';
      p.position.set(TOWER_BASE_X, TOWER_BASE_Y + TOWER_DECK_HEIGHT + 0.3, TOWER_BASE_Z + 2.2);
      p.yaw = 0.0;
    } else if (spawnTarget === 'CAMPFIRE_HUB') {
      p.specialState = 'CAMPFIRE';
      const seatY = getTerrainHeightOnly(CAMPFIRE_SEAT_POS.x, CAMPFIRE_SEAT_POS.z);
      p.position.set(CAMPFIRE_SEAT_POS.x, seatY, CAMPFIRE_SEAT_POS.z);
      p.yaw = -1.45; // Face toward the crackling campfire embers
    }

    if (spawnTarget !== 'FIREWATCH_TOWER' && spawnTarget !== 'CAMPFIRE_HUB') {
      const t = sampleTerrain(p.position.x, p.position.z, _groundNormal);
      p.position.y = Math.max(t.height, WATER_LEVEL) + 0.5;
    }
    springState.current.prevGroundY = p.position.y;
    springState.current.prevClimbVel = 0;
    p.velocity.set(0, 0, 0);
    p.speed = 0;
    p.lateralSpeed = 0;
    triggerPoofEffect(p.position);
  }, [spawnCounter, spawnTarget]);

  // Contextual Interaction Handler (KeyE / Gamepad X)
  const handleContextualAction = () => {
    const p = mutablePhysics;
    const currentMode = useGameStore.getState().mode;

    // 1. If currently in Campfire, Zipline, or Climbing state -> exit back to normal
    if (p.specialState !== 'NONE') {
      p.specialState = 'NONE';
      p.velocity.y = 3.5;
      return;
    }

    // 2. Check proximity to Lakeside Campfire
    const distToFire = Math.hypot(
      p.position.x - CAMPFIRE_WORLD_POS.x,
      p.position.z - CAMPFIRE_WORLD_POS.z
    );
    if (distToFire < 6.5) {
      useGameStore.getState().setMode('WALK', true);
      p.specialState = 'CAMPFIRE';
      const seatY = getTerrainHeightOnly(CAMPFIRE_SEAT_POS.x, CAMPFIRE_SEAT_POS.z);
      p.position.set(CAMPFIRE_SEAT_POS.x, seatY, CAMPFIRE_SEAT_POS.z);
      p.yaw = Math.atan2(
        CAMPFIRE_WORLD_POS.x - CAMPFIRE_SEAT_POS.x,
        CAMPFIRE_WORLD_POS.z - CAMPFIRE_SEAT_POS.z
      );
      p.velocity.set(0, 0, 0);
      p.speed = 0;
      triggerPlayerEmote();
      return;
    }

    // 3. Check proximity to Zipline Start on Firewatch Tower Deck
    if (p.position.distanceTo(ZIPLINE_START) < 6.5) {
      useGameStore.getState().setMode('WALK', false);
      p.specialState = 'ZIPLINE';
      p.ziplineT = 0.0;
      p.speed = 12.0;
      triggerPoofEffect(p.position);
      return;
    }

    // 4. Check proximity to any Trailhead Rack / Canoe Dock
    for (const st of TRANSITION_STATIONS) {
      if (p.position.distanceTo(st.position) < 6.5) {
        const nextMode = currentMode === st.targetMode ? st.altMode : st.targetMode;
        useGameStore.getState().setMode(nextMode, true);
        return;
      }
    }

    // 5. Manual Triathlon Race Start at Summit Start Arch (Z = -715) or Summit Zone (Z < -695)
    const distToStartGate = Math.hypot(p.position.x - -12, p.position.z - -715);
    if (p.triathlonStatus !== 'ACTIVE' && (distToStartGate < 14.0 || p.position.z < -695)) {
      useGameStore.getState().startTriathlon(currentMode);
      soundscape.triggerDiscoveryChime();
      triggerPoofEffect(p.position);
      return;
    }
  };

  // Session 3: Lonely Mountains Instant Rewind Handler (KeyR / Gamepad View)
  const executeRewind = (forceSummit = false) => {
    const p = mutablePhysics;
    const sp = springState.current;
    const currentMode = useGameStore.getState().mode;

    // If currently in a special activity state (Campfire / Zipline), or already at the summit (< -680), or Shift was held:
    if (forceSummit || p.specialState !== 'NONE' || p.position.z < -680) {
      useGameStore.getState().respawnAt(useGameStore.getState().spawnTarget);
      return;
    }

    // Dynamic rewind ~38m upstream on active route
    const { yaw, speed } = getUpstreamCheckpoint(
      p.position.x,
      p.position.z,
      currentMode,
      _checkpointPos,
      _checkpointTan
    );

    p.position.copy(_checkpointPos);
    p.yaw = yaw;
    p.speed = speed;
    p.velocity.set(_checkpointTan.x * speed, _checkpointTan.y * speed, _checkpointTan.z * speed);
    p.lateralSpeed = 0;
    p.isGrounded = true;

    // Reset physics springs, bounce & tumble
    sp.roll = 0;
    sp.pitch = 0;
    sp.carveYaw = 0;
    sp.bounceVel = 0;
    sp.bounceY = 0;
    sp.smoothSteer = 0;
    sp.crashCooldown = 0;
    sp.prevGroundY = p.position.y;
    sp.prevClimbVel = 0;

    // Audio & particles
    soundscape.triggerRewindWhoosh();
    triggerPoofEffect(p.position);
  };

  // Keyboard listener
  useEffect(() => {
    const unlockAudio = () => soundscape.init();

    const onKeyDown = (e: KeyboardEvent) => {
      unlockAudio();
      const code = e.code;

      if (code === 'Escape' || code === 'KeyP') {
        const st = useGameStore.getState();
        if (!st.gameStarted) return;
        if (st.binocularsActive) {
          st.setBinocularsActive(false);
        } else {
          st.togglePause();
        }
        return;
      }

      if (mutablePhysics.isPaused) return;

      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'KeyZ' || code === 'ArrowUp') inp.forward = true;
      if (code === 'KeyS' || code === 'ArrowDown') inp.backward = true;
      if (code === 'KeyA' || code === 'KeyQ' || code === 'ArrowLeft') inp.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') inp.right = true;
      if (code === 'Space') inp.driftOrHop = true;
      if (code === 'ShiftLeft' || code === 'ShiftRight') inp.shiftDrift = true;

      if (code === 'Digit1') setMode('WALK');
      if (code === 'Digit2') setMode('LONGBOARD');
      if (code === 'Digit3') setMode('BIKE');
      if (code === 'Digit4') setMode('CANOE');
      if (code === 'KeyE') handleContextualAction();
      if (code === 'KeyC' || code === 'KeyF') triggerPlayerEmote();
      if (code === 'KeyB') toggleBinoculars();
      if (code === 'KeyN') {
        mutablePhysics.timeOfDay =
          mutablePhysics.nightFactor > 0.5 ? TIME_PRESET_HOURS.GOLDEN : TIME_PRESET_HOURS.NIGHT;
      }
      if (code === 'KeyV') {
        useGameStore.getState().toggleCameraMode();
      }
      if (code === 'KeyR') {
        executeRewind(e.shiftKey);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'KeyZ' || code === 'ArrowUp') inp.forward = false;
      if (code === 'KeyS' || code === 'ArrowDown') inp.backward = false;
      if (code === 'KeyA' || code === 'KeyQ' || code === 'ArrowLeft') inp.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') inp.right = false;
      if (code === 'Space') inp.driftOrHop = false;
      if (code === 'ShiftLeft' || code === 'ShiftRight') inp.shiftDrift = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', unlockAudio);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', unlockAudio);
    };
  }, [setMode, toggleBinoculars]);

  const triggerHaptic = (
    pad: Gamepad | null,
    durationMs: number,
    strong: number,
    weak: number
  ) => {
    if (!pad || !pad.vibrationActuator || typeof pad.vibrationActuator.playEffect !== 'function') return;
    const now = performance.now();
    if (now - lastRumbleTime.current < 70) return;
    lastRumbleTime.current = now;
    try {
      pad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        strongMagnitude: Math.min(1, Math.max(0, strong)),
        weakMagnitude: Math.min(1, Math.max(0, weak)),
      }).catch(() => {});
    } catch {
      // Ignore vibration error
    }
  };

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.04);
    const p = mutablePhysics;
    const preset = PHYSICS_PRESETS[mode];
    const inp = inputRef.current;
    const sp = springState.current;
    const elapsed = state.clock.elapsedTime;

    if (sp.hopCooldown > 0) sp.hopCooldown -= dt;
    if (sp.crashCooldown > 0) sp.crashCooldown -= dt;
    if (sp.pushTimer > 0) sp.pushTimer -= dt;
    if (sp.pushAnimTimer > 0) sp.pushAnimTimer = Math.max(0, sp.pushAnimTimer - dt);
    if (p.emoteTimer > 0) p.emoteTimer = Math.max(0, p.emoteTimer - dt);

    // --- GAMEPAD POLLING & DISCOVERY ---
    const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (let i = 0; i < gamepads.length; i++) {
      const g = gamepads[i];
      if (g && g.connected) {
        pad = g;
        break;
      }
    }

    const padConnected = !!pad;
    if (p.gamepadConnected !== padConnected) {
      p.gamepadConnected = padConnected;
      p.gamepadName = pad ? (pad.id || 'Xbox Controller') : '';
      useGameStore.getState().setGamepadConnected(padConnected);
    }

    let padSteer = 0;
    let padMove = 0;
    let padGas = 0;
    let padBrake = 0;
    let padHop = false;
    let padDriftBtn = false;
    let padBinoLookX = 0;
    let padBinoLookY = 0;

    if (pad) {
      const deadzone = (val: number, thresh = 0.12) => {
        if (Math.abs(val) < thresh) return 0;
        return Math.sign(val) * ((Math.abs(val) - thresh) / (1 - thresh));
      };

      // Left Stick (X: left = -1, right = +1; Y: up = -1, down = +1)
      padSteer = -deadzone(pad.axes[0] ?? 0, 0.12);
      padMove = -deadzone(pad.axes[1] ?? 0, 0.12);

      // Triggers (RT: 7, LT: 6)
      padGas = pad.buttons[7] ? pad.buttons[7].value : 0;
      padBrake = pad.buttons[6] ? pad.buttons[6].value : 0;

      const isPressed = (btnIndex: number) => {
        const b = pad!.buttons[btnIndex];
        return !!(b && (b.pressed || b.value > 0.5));
      };

      const wasJustPressed = (btnIndex: number) => {
        const cur = isPressed(btnIndex);
        const prev = !!gamepadPrevButtons.current[btnIndex];
        return cur && !prev;
      };

      // Button 0 (A): Hop / Dyno / Jump
      padHop = isPressed(0);
      // Button 1 (B): Drift / Powerslide
      padDriftBtn = isPressed(1);

      // Button 2 (X): Contextual action
      if (wasJustPressed(2)) {
        handleContextualAction();
        triggerHaptic(pad, 70, 0.3, 0.3);
      }

      // Button 3 (Y) or Button 5 (RB): Emote / Bell
      if (wasJustPressed(3) || wasJustPressed(5)) {
        triggerPlayerEmote();
        triggerHaptic(pad, 100, 0.4, 0.6);
      }

      // Button 4 (LB): Toggle Binoculars
      if (wasJustPressed(4)) {
        toggleBinoculars();
        triggerHaptic(pad, 80, 0.3, 0.2);
      }

      // Button 8 (View / Back): Lonely Mountains Instant Rewind
      if (wasJustPressed(8)) {
        executeRewind(false);
        triggerHaptic(pad, 100, 0.5, 0.4);
      }

      // Button 9 (Menu / Start): Toggle Pause Menu or Start Game from Title
      if (wasJustPressed(9) || (!useGameStore.getState().gameStarted && wasJustPressed(0))) {
        if (!useGameStore.getState().gameStarted) {
          useGameStore.getState().startGame();
        } else {
          useGameStore.getState().togglePause();
        }
        triggerHaptic(pad, 80, 0.3, 0.4);
      }

      // Button 10 (L3) or Button 11 (R3): Toggle Camera Mode
      if (!p.isPaused && (wasJustPressed(10) || wasJustPressed(11))) {
        useGameStore.getState().toggleCameraMode();
        triggerHaptic(pad, 100, 0.3, 0.5);
      }

      // D-Pad buttons: 12 (Up: Longboard), 13 (Down: Canoe), 14 (Left: Walk), 15 (Right: Bike)
      if (!p.isPaused && wasJustPressed(12)) {
        setMode('LONGBOARD');
        triggerHaptic(pad, 70, 0.2, 0.3);
      } else if (!p.isPaused && wasJustPressed(13)) {
        setMode('CANOE');
        triggerHaptic(pad, 70, 0.2, 0.3);
      } else if (!p.isPaused && wasJustPressed(14)) {
        setMode('WALK');
        triggerHaptic(pad, 70, 0.2, 0.3);
      } else if (!p.isPaused && wasJustPressed(15)) {
        setMode('BIKE');
        triggerHaptic(pad, 70, 0.2, 0.3);
      }

      // Right Stick (axes[2], axes[3]) for Binoculars look
      if (binocularsActive && !p.isPaused) {
        padBinoLookX = deadzone(pad.axes[2] ?? 0, 0.12);
        padBinoLookY = -deadzone(pad.axes[3] ?? 0, 0.12);
      }

      // Edge detection cache
      for (let b = 0; b < pad.buttons.length; b++) {
        gamepadPrevButtons.current[b] = isPressed(b);
      }
    }

    if (p.isPaused) {
      soundscape.update(dt, mode);
      return;
    }

    const keySteer = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    const rawSteerInput = Math.abs(padSteer) > 0.04 ? padSteer : keySteer;
    // Progressive analog steering filter: eliminates robotic binary twitch on keyboard turns!
    const steerDamp = Math.abs(rawSteerInput) < 0.05 ? 11.5 : 7.8;
    sp.smoothSteer = THREE.MathUtils.damp(sp.smoothSteer, rawSteerInput, steerDamp, dt);
    const steerInput = sp.smoothSteer;

    const keyMove = (inp.forward ? 1 : 0) - (inp.backward ? 1 : 0);
    const moveInput = Math.abs(padMove) > 0.08 ? padMove : keyMove;

    const wantsHop = inp.driftOrHop || padHop;
    const accelInput = Math.max(inp.forward ? 1.0 : 0.0, padGas, Math.max(0, padMove));
    const brakeInput = Math.max(inp.backward ? 1.0 : 0.0, padBrake, Math.max(0, -padMove));
    const isBraking = brakeInput > 0.15;
    p.steerInput = steerInput;
    p.isPedaling = accelInput > 0.08 && mode === 'BIKE';

    // --- BINOCULARS LOOK MODE ---
    if (binocularsActive) {
      const yawInput = Math.abs(padBinoLookX) > 0.05 ? -padBinoLookX : steerInput;
      const pitchInput = Math.abs(padBinoLookY) > 0.05 ? padBinoLookY : moveInput;
      p.binocularsYaw += yawInput * 1.55 * dt;
      p.binocularsPitch = THREE.MathUtils.clamp(
        p.binocularsPitch + pitchInput * 1.25 * dt,
        -0.65,
        0.75
      );
      p.speed = THREE.MathUtils.damp(p.speed, 0, 8, dt);
      p.velocity.set(0, 0, 0);
      soundscape.update(dt, mode);
      return;
    }

    // --- UPDATE CONTEXTUAL PROMPT ---
    let promptText = '';
    const distToFire = Math.hypot(
      p.position.x - CAMPFIRE_WORLD_POS.x,
      p.position.z - CAMPFIRE_WORLD_POS.z
    );

    if (p.specialState === 'CAMPFIRE') {
      promptText = '🔥 Warming by the Campfire • [C] Chime / Wave • [E / Space] Stand Up';
    } else if (p.specialState === 'ZIPLINE') {
      promptText = '[Space / E] Drop from Zipline';
    } else if (distToFire < 6.5) {
      promptText = '🔥 [E] Sit by the Cozy Campfire';
    } else if (p.position.distanceTo(ZIPLINE_START) < 6.5) {
      promptText = '⚡ [E] Ride 700m Zipline to Lakeside Camp!';
    } else {
      for (const st of TRANSITION_STATIONS) {
        if (p.position.distanceTo(st.position) < 6.5) {
          const nextM = mode === st.targetMode ? st.altMode : st.targetMode;
          promptText = `🎒 [E] ${st.label}: Switch to ${PHYSICS_PRESETS[nextM].label}`;
          break;
        }
      }
      if (!promptText && p.triathlonStatus !== 'ACTIVE') {
        const distStart = Math.hypot(p.position.x - -12, p.position.z - -715);
        if (distStart < 14.0 || p.position.z < -695) {
          promptText = '🏁 [E / X] Lancer la Course Chrono (1,600m Downhill)';
        }
      }
    }
    p.contextPrompt = promptText;

    // --- SPECIAL STATE 0: SIT BY THE CAMPFIRE (Step 4.2) ---
    if (p.specialState === 'CAMPFIRE') {
      const seatY = getTerrainHeightOnly(CAMPFIRE_SEAT_POS.x, CAMPFIRE_SEAT_POS.z);
      p.position.set(CAMPFIRE_SEAT_POS.x, seatY, CAMPFIRE_SEAT_POS.z);
      p.yaw = Math.atan2(
        CAMPFIRE_WORLD_POS.x - CAMPFIRE_SEAT_POS.x,
        CAMPFIRE_WORLD_POS.z - CAMPFIRE_SEAT_POS.z
      );
      _forward.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)).normalize();
      p.forward.copy(_forward);
      p.speed = 0;
      p.velocity.set(0, 0, 0);
      p.isGrounded = true;
      p.isDrifting = false;

      if (wantsHop && sp.hopCooldown <= 0) {
        p.specialState = 'NONE';
        p.velocity.y = 4.5;
        sp.hopCooldown = 0.4;
        triggerHaptic(pad, 70, 0.3, 0.2);
      }
    }
    // --- SPECIAL STATE 1: ZIPLINE GLIDING (Step 3.3) ---
    else if (p.specialState === 'ZIPLINE') {
      p.speed = THREE.MathUtils.damp(p.speed, 29.0, 1.8, dt);
      const totalLength = ZIPLINE_START.distanceTo(ZIPLINE_END);
      p.ziplineT += (p.speed / totalLength) * dt;

      if (p.ziplineT >= 0.99 || (wantsHop && sp.hopCooldown <= 0)) {
        p.specialState = 'NONE';
        p.velocity.set(_forward.x * p.speed * 0.6, 2.0, _forward.z * p.speed * 0.6);
        sp.hopCooldown = 0.4;
        triggerHaptic(pad, 90, 0.4, 0.3);
      } else {
        getZiplinePoint(p.ziplineT, _zipPos);
        getZiplinePoint(Math.min(1, p.ziplineT + 0.02), _zipNext);
        p.position.set(_zipPos.x, _zipPos.y - 1.65, _zipPos.z);
        p.yaw = Math.atan2(_zipNext.x - _zipPos.x, _zipNext.z - _zipPos.z);
        _forward.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)).normalize();
        p.forward.copy(_forward);
        p.isGrounded = false;
        p.isDrifting = false;
      }
    }
    // --- STANDARD 4-STATE ARCADE SPHERE CONTROLLER ---
    else {
      const terrain = sampleTerrain(p.position.x, p.position.z, _groundNormal);
      _smoothGroundNormal.lerp(_groundNormal, Math.min(1, dt * 11.0)).normalize();
      p.groundNormal.copy(_smoothGroundNormal);
      p.surface = terrain.surface;
      p.waterDepth = terrain.waterDepth;

      const isOnWater = terrain.waterDepth > 0.2;
      let effectiveGroundY =
        isOnWater && mode === 'CANOE'
          ? Math.max(WATER_LEVEL, terrain.height + 0.25)
          : terrain.height;

      const onTowerDeck =
        Math.abs(p.position.x - TOWER_BASE_X) < 4.4 &&
        Math.abs(p.position.z - TOWER_BASE_Z) < 4.4 &&
        p.position.y >= TOWER_BASE_Y + TOWER_DECK_HEIGHT - 1.2;

      if (onTowerDeck) {
        effectiveGroundY = TOWER_BASE_Y + TOWER_DECK_HEIGHT + 0.22;
        _groundNormal.set(0, 1, 0);
        _smoothGroundNormal.set(0, 1, 0);
        p.groundNormal.set(0, 1, 0);
      }

      const groundedThreshold = 0.28;
      p.isGrounded = p.position.y <= effectiveGroundY + groundedThreshold && p.velocity.y <= 1.5;

      // 2. Progressive Speed-Dependent Turn Curve + Expressive Stand-Up Longboard Powerslides!
      const wantsDrift =
        (mode === 'LONGBOARD' &&
          (inp.shiftDrift ||
            padDriftBtn ||
            isBraking ||
            padBrake > 0.15 ||
            wantsHop) &&
          Math.abs(rawSteerInput) >= 0.15) ||
        (mode === 'BIKE' && (inp.shiftDrift || padDriftBtn || isBraking) && Math.abs(rawSteerInput) > 0.1);

      const wasDrifting = p.isDrifting;
      p.isDrifting = p.isGrounded && wantsDrift && p.speed > 4.2;
      if (p.isDrifting) {
        sp.driftCharge = Math.min(1.2, sp.driftCharge + dt);
        triggerHaptic(pad, 65, 0.12, 0.32);
      }

      // Smooth, natural speed-dependent turn radius (never feels stiff or locked)
      let speedFactor = 1.0;
      if (mode === 'LONGBOARD' || mode === 'BIKE') {
        const lowSpeedRamp = THREE.MathUtils.clamp(p.speed / 3.0, 0.78, 1.05);
        const highSpeedCarve = THREE.MathUtils.lerp(
          1.05,
          0.56,
          THREE.MathUtils.clamp((p.speed - 11.0) / 26.0, 0, 1)
        );
        speedFactor = p.speed < 11.0 ? lowSpeedRamp : highSpeedCarve;
      }
      const driftTurnBoost = p.isDrifting ? (mode === 'LONGBOARD' ? 2.15 : 1.95) : 1.0;
      p.yaw += steerInput * preset.turnSpeed * speedFactor * driftTurnBoost * dt;

      _forward.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)).normalize();
      _right.set(_forward.z, 0, -_forward.x);
      p.forward.copy(_forward);

      // 3. Decompose Horizontal Velocity
      _velHorizontal.set(p.velocity.x, 0, p.velocity.z);
      let forwardVel = _velHorizontal.dot(_forward);
      let lateralVel = _velHorizontal.dot(_right);

      // Drift Exit Boost: releasing a sustained powerslide snaps the wheels back into traction with a speed kick!
      if (wasDrifting && !p.isDrifting && sp.driftCharge > 0.24 && p.isGrounded && forwardVel > 5.0) {
        forwardVel = Math.min(preset.maxSpeed, forwardVel + Math.min(3.0, sp.driftCharge * 2.6));
        sp.driftCharge = 0;
        triggerHaptic(pad, 75, 0.35, 0.45);
      } else if (!p.isDrifting) {
        sp.driftCharge = Math.max(0, sp.driftCharge - dt * 2.5);
      }

      // 4. Slope Gravity Projection ("Lonely Mountains" Weighty Downhill vs Uphill Pullback!)
      _slopeDown.set(_smoothGroundNormal.x, 0, _smoothGroundNormal.z);
      const slopeStrength = _slopeDown.length();
      p.slopeAngle = Math.asin(THREE.MathUtils.clamp(slopeStrength, 0, 1)) * (180 / Math.PI);
      const downhillDot = _slopeDown.dot(_forward); // > 0 when descending, < 0 when climbing uphill

      const isAeroAttackTuck =
        (mode === 'LONGBOARD' || mode === 'BIKE') &&
        accelInput > 0.2 &&
        downhillDot > -0.02 &&
        forwardVel > 9.5 &&
        !p.isDrifting;

      const isDownhillRiverCanoe = isOnWater && mode === 'CANOE' && p.position.z < 480;
      if (p.isGrounded && (!isOnWater || isDownhillRiverCanoe) && !onTowerDeck && mode !== 'WALK') {
        if (mode === 'CANOE') {
          // Canoe in downhill mountain rapids (Z < 480): rushing torrent & gravity accelerate canoe to 25-45 km/h!
          if (downhillDot >= 0) {
            forwardVel += downhillDot * 16.5 * preset.gravityScale * dt;
          } else {
            forwardVel += downhillDot * 36.0 * dt;
          }
          lateralVel += _slopeDown.dot(_right) * 12.0 * dt;
        } else if (downhillDot >= 0) {
          // Downhill gravity acceleration: rewards steep lines & Aero Tuck
          const tuckGravityBoost = isAeroAttackTuck ? 1.30 : 1.0;
          const gravityAccel = 19.5 * preset.gravityScale * tuckGravityBoost;
          forwardVel += downhillDot * gravityAccel * dt;
        } else {
          // Strong uphill gravity resistance: prevents flying uphill at 70 km/h!
          const uphillPullback = 54.0 * preset.gravityScale;
          forwardVel += downhillDot * uphillPullback * dt;
        }
        if (mode !== 'CANOE') {
          lateralVel += _slopeDown.dot(_right) * 20.0 * preset.gravityScale * 0.42 * dt;
        }
      }

      // 5. Mode-Specific Authentic Propulsion ("Lonely Mountains: Downhill" Feel)
      if (mode === 'LONGBOARD') {
        // Fast, buttery foot-pushing: flat caps at 15.5 m/s (~55 km/h); downhill unleashes gravity!
        const pushCap = downhillDot < -0.04 ? Math.max(6.5, 12.5 + downhillDot * 32.0) : 15.5;
        if (
          accelInput > 0.15 &&
          p.isGrounded &&
          !p.isDrifting &&
          forwardVel < pushCap &&
          sp.pushTimer <= 0
        ) {
          const uphillPenalty = downhillDot < 0 ? Math.max(0.35, 1.0 + downhillDot * 2.5) : 1.0;
          const pushKick = 4.2 * accelInput * uphillPenalty * (p.surface === 'ASPHALT' || p.surface === 'WOOD' ? 1.0 : 0.55);
          forwardVel = Math.min(pushCap + 1.5, forwardVel + pushKick);
          sp.pushTimer = 0.48;
          sp.pushAnimTimer = 0.36;
          soundscape.triggerFootPushSound();
          triggerHaptic(pad, 55, 0.2, 0.25);
        }

        const steerDelta = Math.abs(steerInput - sp.prevSteer);
        p.isPumping = p.isGrounded && !p.isDrifting && Math.abs(steerInput) > 0.10 && forwardVel > 2.5;
        if (
          steerDelta > 0.12 &&
          p.isGrounded &&
          downhillDot > -0.04 &&
          forwardVel > 2.0 &&
          forwardVel < preset.maxSpeed
        ) {
          forwardVel += (p.surface === 'ASPHALT' || p.surface === 'WOOD' ? 0.85 : 0.35) * steerDelta;
        }
        if (wantsHop && !p.isDrifting && p.isGrounded && sp.hopCooldown <= 0) {
          p.velocity.y = preset.hopImpulse;
          p.isGrounded = false;
          sp.hopCooldown = 0.45;
          sp.bounceVel = 3.0;
          soundscape.triggerHopSound();
          triggerHaptic(pad, 80, 0.4, 0.3);
        }
      } else if (mode === 'BIKE') {
        // Lonely Mountains VTT Torque:
        // - Uphill: low-gear granny climb tops out at 18-24 km/h (7.5-10 m/s)
        // - Flat: brisk sprint tops out at ~37 km/h (15.5 m/s)
        // - Downhill: pedaling + gravity + berm pumping pushes up to 75-91 km/h (31-38 m/s)!
        const slopeBonus =
          downhillDot > 0
            ? THREE.MathUtils.clamp(downhillDot * 68.0, 0, 16.5)
            : Math.max(-8.5, downhillDot * 42.0);
        const maxPedalSpeed = Math.max(7.2, 15.2 + slopeBonus);

        if (accelInput > 0 && forwardVel < maxPedalSpeed) {
          const climbResist = downhillDot < -0.03 ? Math.max(0.38, 1.0 + downhillDot * 2.2) : 1.0;
          const pedalEfficiency =
            THREE.MathUtils.clamp(1.18 - forwardVel / (maxPedalSpeed + 4.0), 0.32, 1.0) * climbResist;
          forwardVel += preset.accelForce * pedalEfficiency * accelInput * dt;
        } else if (downhillDot < -0.06 && forwardVel > maxPedalSpeed + 1.5) {
          // Rapidly bleed excess high-speed momentum when hitting a steep uphill wall!
          forwardVel = THREE.MathUtils.damp(forwardVel, maxPedalSpeed, 3.2, dt);
        }

        // Lonely Mountains Corner / Berm Pumping on VTT: carving through S-turns generates exit snap!
        const steerDelta = Math.abs(steerInput - sp.prevSteer);
        p.isPumping =
          p.isGrounded && !p.isDrifting && Math.abs(steerInput) > 0.22 && downhillDot > 0.02 && forwardVel > 8.0;
        if (steerDelta > 0.16 && p.isGrounded && downhillDot > 0.01 && forwardVel > 6.0 && forwardVel < preset.maxSpeed) {
          forwardVel += 0.52 * steerDelta;
        }

        sp.pedalPhase += Math.max(0, forwardVel) * dt * 0.85;
        if (wantsHop && p.isGrounded && sp.hopCooldown <= 0) {
          p.velocity.y = preset.hopImpulse;
          p.isGrounded = false;
          sp.hopCooldown = 0.45;
          sp.bounceVel = 3.6;
          soundscape.triggerHopSound();
          triggerHaptic(pad, 90, 0.55, 0.35);
        }
      } else if (mode === 'CANOE') {
        p.isPumping = false;
        const waterEfficiency = isOnWater ? 1.0 : 0.22;
        if (accelInput > 0) {
          p.paddlePhase += dt * (3.2 + 1.4 * accelInput);
          const strokePulse = 0.65 + 0.45 * Math.max(0, Math.sin(p.paddlePhase));
          if (forwardVel < preset.maxSpeed * waterEfficiency) {
            forwardVel += preset.accelForce * strokePulse * waterEfficiency * accelInput * dt;
          }
          if (Math.sin(p.paddlePhase) < -0.8) {
            p.paddleSide = steerInput !== 0 ? Math.sign(steerInput) : -p.paddleSide;
          }
        } else {
          p.paddlePhase = THREE.MathUtils.damp(p.paddlePhase, 0, 4, dt);
        }

        if (isOnWater) {
          getRiverCurrentVector(p.position.x, p.position.z, _riverCurrent);
          // Rushing mountain rapids stream propels canoe along flow
          const currentPush = mode === 'CANOE' ? 1.55 : 0.45;
          forwardVel += _riverCurrent.dot(_forward) * currentPush * dt;
          lateralVel += _riverCurrent.dot(_right) * currentPush * dt;
        }
      } else {
        // WALK mode
        p.isPumping = false;
        if (moveInput > 0.05) {
          forwardVel = THREE.MathUtils.damp(forwardVel, preset.maxSpeed * moveInput, 8, dt);
          sp.walkBob += dt * 12 * Math.min(1, moveInput);
        } else if (moveInput < -0.05) {
          forwardVel = THREE.MathUtils.damp(forwardVel, -preset.maxSpeed * 0.6 * Math.abs(moveInput), 8, dt);
          sp.walkBob += dt * 8 * Math.min(1, Math.abs(moveInput));
        } else {
          forwardVel = THREE.MathUtils.damp(forwardVel, 0, 10, dt);
        }
        if (wantsHop && p.isGrounded && sp.hopCooldown <= 0) {
          p.velocity.y = preset.hopImpulse;
          p.isGrounded = false;
          sp.hopCooldown = 0.45;
          soundscape.triggerHopSound();
          triggerHaptic(pad, 60, 0.3, 0.2);
        }
      }

      sp.prevSteer = steerInput;

      // 6. Surface Friction, Off-Road Penalties & Braking
      let surfaceDragMultiplier = 1.0;
      if (mode === 'LONGBOARD') {
        if (p.surface === 'ASPHALT' || p.surface === 'WOOD') {
          // Buttery urethane roll: low friction on smooth pavement
          surfaceDragMultiplier = isAeroAttackTuck ? 0.22 : 0.38;
        } else if (p.surface === 'DIRT') {
          surfaceDragMultiplier = 2.0;
        } else if (p.surface === 'GRASS' || p.surface === 'SAND' || p.surface === 'ROCK') {
          surfaceDragMultiplier = 4.8;
        } else if (p.surface === 'WATER') {
          surfaceDragMultiplier = 8.0;
        }
      } else if (mode === 'BIKE') {
        if (p.surface === 'DIRT' || p.surface === 'ASPHALT' || p.surface === 'WOOD') {
          surfaceDragMultiplier = isAeroAttackTuck ? 0.35 : 0.52;
        } else if (p.surface === 'GRASS' || p.surface === 'SAND' || p.surface === 'ROCK') {
          // VTT is built for freeride off-road: minimal speed loss on grass/rock!
          surfaceDragMultiplier = 0.82;
        } else if (p.surface === 'WATER') {
          surfaceDragMultiplier = 5.5;
        }
      } else if (mode === 'CANOE') {
        surfaceDragMultiplier = isOnWater ? 0.45 : 6.5;
      }

      const drag = preset.rollingResistance * surfaceDragMultiplier;
      forwardVel = THREE.MathUtils.damp(forwardVel, 0, drag, dt);

      // Aerodynamic wind drag: quadratic air resistance (F_aero ~ v^2)
      // Longboard glides effortlessly up to 60-70 km/h, Aero Attack Tuck reaches 80+ km/h!
      if (mode === 'LONGBOARD' || mode === 'BIKE') {
        const aeroDragCoeff = isAeroAttackTuck ? 0.0010 : (mode === 'LONGBOARD' ? 0.0022 : 0.0034);
        const aeroDecel = forwardVel * Math.abs(forwardVel) * aeroDragCoeff;
        forwardVel -= aeroDecel * dt;
      }

      // Carve Scrubbing: only scrubs when turning very sharply (> 0.38) at high speed
      if ((mode === 'LONGBOARD' || mode === 'BIKE') && p.isGrounded && !p.isDrifting) {
        const steerMagnitude = Math.abs(steerInput);
        if (steerMagnitude > 0.38 && forwardVel > 12.0) {
          const scrubRate = mode === 'LONGBOARD' ? 1.8 : 1.5;
          const scrubDecel = (steerMagnitude - 0.38) * scrubRate * (forwardVel / preset.maxSpeed);
          forwardVel = Math.max(0, forwardVel - scrubDecel * dt);
        }
      }

      if (isBraking && mode !== 'WALK') {
        if (forwardVel > 0.5) {
          // During a Longboard powerslide, carving sideways scrubs speed smoothly without killing all momentum
          const brakeDecel = p.isDrifting ? (mode === 'LONGBOARD' ? 7.5 : 12.5) : 21.0;
          forwardVel = Math.max(0, forwardVel - brakeDecel * Math.max(0.65, brakeInput) * dt);
        } else {
          forwardVel = THREE.MathUtils.damp(forwardVel, -3.5, 4, dt);
        }
      }

      // Finite lateral tire/edge grip at high speeds creates natural cornering inertia
      const highSpeedGripScale =
        !p.isDrifting && p.speed > 14 ? THREE.MathUtils.lerp(1.0, 0.58, (p.speed - 14) / 20) : 1.0;
      const activeGrip = (p.isDrifting ? preset.driftGrip : preset.lateralGrip) * highSpeedGripScale;
      lateralVel = THREE.MathUtils.damp(lateralVel, 0, activeGrip, dt);
      forwardVel = THREE.MathUtils.clamp(forwardVel, -6, preset.maxSpeed * 1.15);

      // 6b. Fallen Log Hurdles (Bunny-Hop / Ollie Gameplay)
      for (let i = 0; i < FALLEN_LOGS.length; i++) {
        const log = FALLEN_LOGS[i];
        const dx = p.position.x - log.position.x;
        const dz = p.position.z - log.position.z;
        const distSq = dx * dx + dz * dz;
        const halfLen = log.length * 0.52;
        if (distSq < halfLen * halfLen) {
          // Local coordinates relative to log axis (yaw rotates around Y)
          const cosY = Math.cos(log.yaw);
          const sinY = Math.sin(log.yaw);
          const alongDist = Math.abs(dx * cosY - dz * sinY);
          const perpDist = Math.abs(dx * sinY + dz * cosY);
          if (alongDist < halfLen && perpDist < log.radius + 0.45) {
            const clearanceY = log.position.y + log.radius * 0.45;
            if (p.position.y < clearanceY && sp.hopCooldown <= 0.15) {
              // Player hit the log without hopping high enough -> tactile stumble & bounce!
              p.velocity.y = 3.2;
              p.isGrounded = false;
              forwardVel *= 0.42;
              sp.bounceVel = -5.0;
              sp.hopCooldown = 0.42;
              soundscape.triggerHopSound();
              triggerHaptic(pad, 150, 0.85, 0.65);
            }
          }
        }
      }

      p.velocity.x = _forward.x * forwardVel + _right.x * lateralVel;
      p.velocity.z = _forward.z * forwardVel + _right.z * lateralVel;
      p.speed = Math.hypot(p.velocity.x, p.velocity.z);
      p.lateralSpeed = lateralVel;

      // 7. Vertical Integration, Controlled Kicker Launch & Ground Downforce (No more flying into orbit!)
      const wasGroundedBeforeStep = p.isGrounded;
      p.velocity.y -= 35.5 * dt;
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      const halfW = TERRAIN_WIDTH * 0.47;
      const halfL = TERRAIN_LENGTH * 0.47;
      p.position.x = THREE.MathUtils.clamp(p.position.x, -halfW, halfW);
      p.position.z = THREE.MathUtils.clamp(p.position.z, -halfL, halfL);

      // 7b. WP 3.5: O(1) Spatial Hash Tree & Boulder Collisions (No more ghosting through forests!)
      const obsHit = queryObstacleCollision(p.position.x, p.position.z, 0.46);
      if (obsHit.hit && !onTowerDeck) {
        p.position.x += obsHit.pushX;
        p.position.z += obsHit.pushZ;

        // Calculate inward impact speed against the obstacle normal
        const inwardSpeed = -(p.velocity.x * obsHit.normalX + p.velocity.z * obsHit.normalZ);
        if (inwardSpeed > 6.5 && sp.crashCooldown <= 0) {
          // High-speed crash into pine trunk or boulder -> Tactile Wipeout Bounce!
          p.velocity.x = (p.velocity.x + 1.65 * inwardSpeed * obsHit.normalX) * 0.42;
          p.velocity.z = (p.velocity.z + 1.65 * inwardSpeed * obsHit.normalZ) * 0.42;
          p.velocity.y = 3.8;
          p.isGrounded = false;
          p.speed = Math.hypot(p.velocity.x, p.velocity.z);
          sp.bounceVel = -8.5;
          sp.roll += obsHit.normalX >= 0 ? -0.65 : 0.65;
          sp.crashCooldown = 0.45;
          triggerPoofEffect(p.position);
          soundscape.triggerObstacleCrashSound();
          triggerHaptic(pad, 230, 1.0, 0.85);
        } else if (inwardSpeed > 0) {
          // Low-speed graze -> slide smoothly along obstacle tangent
          p.velocity.x += inwardSpeed * obsHit.normalX;
          p.velocity.z += inwardSpeed * obsHit.normalZ;
          p.speed = Math.hypot(p.velocity.x, p.velocity.z);
          if (inwardSpeed > 2.2 && sp.crashCooldown <= 0) {
            sp.crashCooldown = 0.25;
            soundscape.triggerHopSound();
            triggerHaptic(pad, 80, 0.35, 0.25);
          }
        }
      }

      const newTerrain = sampleTerrain(p.position.x, p.position.z, _groundNormal);
      const newOnWater = newTerrain.waterDepth > 0.2;
      let targetFloorY =
        newOnWater && mode === 'CANOE'
          ? Math.max(WATER_LEVEL, newTerrain.height + 0.25) + Math.sin(elapsed * 3.5) * 0.04
          : newTerrain.height;

      const stillOnTowerDeck =
        Math.abs(p.position.x - TOWER_BASE_X) < 4.4 &&
        Math.abs(p.position.z - TOWER_BASE_Z) < 4.4 &&
        p.position.y >= TOWER_BASE_Y + TOWER_DECK_HEIGHT - 1.2;

      if (stillOnTowerDeck) {
        targetFloorY = TOWER_BASE_Y + TOWER_DECK_HEIGHT + 0.22;
      }

      // Controlled Tabletop Kicker Launch Physics (ONLY at dedicated KICKER_Z_CENTERS lips!):
      // Prevents random slope breaks from launching the bike into orbit at 80 km/h!
      const currentClimbVel = (targetFloorY - sp.prevGroundY) / Math.max(0.001, dt);
      let nearKickerLip = false;
      for (let k = 0; k < KICKER_Z_CENTERS.length; k++) {
        if (Math.abs(p.position.z - KICKER_Z_CENTERS[k]) < 5.5) {
          nearKickerLip = true;
          break;
        }
      }

      const isCrestingDirtKicker =
        nearKickerLip &&
        wasGroundedBeforeStep &&
        !newOnWater &&
        p.surface === 'DIRT' &&
        (mode === 'BIKE' || mode === 'LONGBOARD') &&
        p.speed > 12.0 &&
        sp.prevClimbVel > 1.8 &&
        currentClimbVel < sp.prevClimbVel - 1.6;

      if (isCrestingDirtKicker) {
        // Controlled, low-slung flow jump (2.6 to 4.1 m/s vertical pop instead of 6.4+ rocket launch!)
        p.velocity.y = Math.min(4.1, Math.max(2.6, sp.prevClimbVel * 0.52));
        p.position.y = targetFloorY + 0.06;
        p.isGrounded = false;
        sp.bounceVel = 2.1;
        soundscape.triggerHopSound();
        triggerHaptic(pad, 90, 0.45, 0.35);
      } else if (
        p.position.y <= targetFloorY ||
        (wasGroundedBeforeStep &&
          sp.hopCooldown <= 0.15 &&
          p.velocity.y <= 0.1 &&
          p.position.y - targetFloorY < 1.65)
      ) {
        // Active Downforce: hug steep downhill transitions without flying off the mountain!
        if (!wasGroundedBeforeStep && p.velocity.y < -2.8) {
          sp.bounceVel = Math.max(-3.5, p.velocity.y * 0.18);
          soundscape.triggerLandingSquish(Math.abs(p.velocity.y));
          triggerHaptic(pad, 110, Math.min(1, Math.abs(p.velocity.y) / 16), 0.45);
        }
        p.position.y = targetFloorY;
        p.velocity.y = 0;
        p.isGrounded = true;
      } else {
        p.isGrounded = false;
      }

      sp.prevClimbVel = THREE.MathUtils.lerp(sp.prevClimbVel, currentClimbVel, 0.5);
      sp.prevGroundY = targetFloorY;
    }

    // --- 8. EXPRESSIVE ARTICULATED CHARACTER RIG & PROPER RIGHT-HANDED BASIS ROTATION ---
    if (rootGroupRef.current && visualTiltRef.current) {
      rootGroupRef.current.position.x = p.position.x;
      rootGroupRef.current.position.z = p.position.z;
      // Smooth vertical suspension filter when grounded so micro-gradients never cause visual jitter!
      if (p.isGrounded && p.specialState === 'NONE') {
        rootGroupRef.current.position.y = THREE.MathUtils.damp(
          rootGroupRef.current.position.y,
          p.position.y,
          26.0,
          dt
        );
      } else {
        rootGroupRef.current.position.y = p.position.y;
      }

      const effectiveNormal =
        p.specialState !== 'NONE' || (p.waterDepth > 0.2 && mode === 'CANOE' && p.position.z >= 475)
          ? _upVec
          : _smoothGroundNormal;

      // Proper Right-Handed Orthonormal Basis: X = Y x Z (det = +1)
      _slopeRight.crossVectors(effectiveNormal, _forward).normalize();
      _slopeForward.crossVectors(_slopeRight, effectiveNormal).normalize();
      _rotMatrix.makeBasis(_slopeRight, effectiveNormal, _slopeForward);
      _targetQuat.setFromRotationMatrix(_rotMatrix);
      rootGroupRef.current.quaternion.slerp(_targetQuat, Math.min(1, dt * 12));

      const targetRoll =
        p.specialState === 'CAMPFIRE'
          ? 0
          : p.specialState === 'ZIPLINE'
          ? Math.sin(elapsed * 3.5) * 0.14 - steerInput * 0.25
          : -steerInput * preset.leanFactor * THREE.MathUtils.clamp(p.speed / 12, 0.35, 1.35) +
            (p.isDrifting ? -steerInput * 0.34 : 0);

      const targetPitch =
        p.specialState === 'CAMPFIRE'
          ? 0
          : p.specialState === 'ZIPLINE'
          ? 0.18
          : !p.isGrounded && p.specialState === 'NONE'
          ? THREE.MathUtils.clamp(-p.velocity.y * 0.04, -0.35, 0.35)
          : 0;

      // Extra responsive visual carve yaw into turns & dramatic 68° sideways Longboard stand-up powerslides!
      const slideSign =
        Math.abs(steerInput) > 0.08 ? Math.sign(steerInput) : p.lateralSpeed >= 0 ? -1 : 1;
      const targetCarveYaw =
        p.specialState !== 'NONE'
          ? 0
          : p.isDrifting
          ? mode === 'LONGBOARD'
            ? slideSign * (0.85 + Math.abs(steerInput) * 0.35)
            : steerInput * 0.62
          : steerInput * 0.22;

      sp.roll = THREE.MathUtils.damp(sp.roll, targetRoll, 10.0, dt);
      sp.pitch = THREE.MathUtils.damp(sp.pitch, targetPitch, 8.0, dt);
      sp.carveYaw = THREE.MathUtils.damp(sp.carveYaw, targetCarveYaw, 11.0, dt);

      sp.bounceVel += -120 * sp.bounceY * dt;
      sp.bounceVel *= Math.exp(-10 * dt);
      sp.bounceY += sp.bounceVel * dt;

      const walkBounce =
        mode === 'WALK' && p.specialState === 'NONE' && p.speed > 0.5
          ? Math.abs(Math.sin(sp.walkBob)) * 0.12
          : 0;

      visualTiltRef.current.position.y =
        p.specialState === 'CAMPFIRE' ? -0.18 : Math.max(-0.2, sp.bounceY) + walkBounce;
      visualTiltRef.current.rotation.set(sp.pitch, sp.carveYaw, sp.roll);
    }

    // Animate Expanding Emote Chime Ring (Step 4.2)
    if (emoteRingRef.current) {
      if (p.emoteTimer > 0) {
        const progress = 1.0 - p.emoteTimer / 1.6;
        const s = 0.5 + progress * 5.5;
        emoteRingRef.current.visible = true;
        emoteRingRef.current.scale.set(s, s, s);
        const mat = emoteRingRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = (1.0 - progress) * 0.75;
      } else {
        emoteRingRef.current.visible = false;
      }
    }

    // Animate Head Gaze (Turn anticipation + POI curiosity glance)
    if (headRef.current) {
      let desiredHeadYaw = steerInput * 0.58 + (p.isDrifting ? steerInput * 0.25 : 0);
      let desiredHeadPitch =
        p.specialState === 'CAMPFIRE'
          ? 0.18 + Math.sin(elapsed * 1.8) * 0.05 // Looking warmly into the fire embers
          : !p.isGrounded && p.specialState === 'NONE'
          ? -0.22
          : mode === 'LONGBOARD' && p.speed > 20
          ? -0.25
          : Math.sin(elapsed * 1.6) * 0.04;
      const desiredHeadRoll = steerInput * 0.22;

      if (Math.abs(steerInput) < 0.1 && p.speed < 18 && p.specialState === 'NONE') {
        let closestDist = 32.0;
        let poiX = 0;
        let poiY = 0;
        let poiZ = 0;
        let foundPoi = false;

        for (const w of WILDLIFE_SPECIES) {
          const d = p.position.distanceTo(w.basePos);
          if (d < closestDist) {
            closestDist = d;
            poiX = w.basePos.x;
            poiY = w.basePos.y;
            poiZ = w.basePos.z;
            foundPoi = true;
          }
        }
        for (const st of TRANSITION_STATIONS) {
          const d = p.position.distanceTo(st.position);
          if (d < 14.0 && d < closestDist) {
            closestDist = d;
            poiX = st.position.x;
            poiY = st.position.y + 1.5;
            poiZ = st.position.z;
            foundPoi = true;
          }
        }

        if (foundPoi) {
          const angleToPoi = Math.atan2(poiX - p.position.x, poiZ - p.position.z);
          let relYaw = angleToPoi - p.yaw;
          relYaw = Math.atan2(Math.sin(relYaw), Math.cos(relYaw));
          if (Math.abs(relYaw) < 1.25) {
            desiredHeadYaw = THREE.MathUtils.clamp(relYaw * 0.75, -0.75, 0.75);
            const dy = poiY - (p.position.y + 1.4);
            desiredHeadPitch = THREE.MathUtils.clamp(-dy / Math.max(4, closestDist), -0.45, 0.35);
          }
        }
      }

      if (mode === 'LONGBOARD' && p.specialState === 'NONE') {
        desiredHeadYaw -= 0.45;
      }

      sp.headYaw = THREE.MathUtils.damp(sp.headYaw, desiredHeadYaw, 7.5, dt);
      sp.headPitch = THREE.MathUtils.damp(sp.headPitch, desiredHeadPitch, 7.5, dt);
      sp.headRoll = THREE.MathUtils.damp(sp.headRoll, desiredHeadRoll, 7.5, dt);

      headRef.current.rotation.set(sp.headPitch, sp.headYaw, sp.headRoll);
    }

    // Animate Flowing Scarf in Wind
    if (scarfRef.current) {
      const windFlutter = Math.sin(elapsed * (6 + p.speed * 0.8)) * (0.09 + p.speed * 0.01);
      scarfRef.current.rotation.x = Math.min(0.42, p.speed * 0.016) + windFlutter;
      scarfRef.current.rotation.y = -steerInput * 0.3 + Math.cos(elapsed * 8) * 0.08;
    }

    // Animate Torso, Arms & Legs per Mode / Special State
    if (
      torsoRef.current &&
      leftArmRef.current &&
      rightArmRef.current &&
      leftLegRef.current &&
      rightLegRef.current
    ) {
      if (p.specialState === 'CAMPFIRE') {
        // Seated on log warming hands toward the crackling campfire!
        const breathe = Math.sin(elapsed * 2.2) * 0.04;
        torsoRef.current.rotation.set(0.22 + breathe, 0, 0);
        leftArmRef.current.rotation.set(-1.1 + breathe, 0.25, 0.15);
        rightArmRef.current.rotation.set(-1.1 + breathe, -0.25, -0.15);
        leftLegRef.current.rotation.set(-1.35, 0.12, 0);
        rightLegRef.current.rotation.set(-1.35, -0.12, 0);
      } else if (p.specialState === 'ZIPLINE') {
        torsoRef.current.rotation.set(0.1, 0, 0);
        leftArmRef.current.rotation.set(-2.75, 0, 0.25);
        rightArmRef.current.rotation.set(-2.75, 0, -0.25);
        leftLegRef.current.rotation.set(0.35 + Math.sin(elapsed * 6) * 0.18, 0, 0);
        rightLegRef.current.rotation.set(0.2 + Math.cos(elapsed * 6) * 0.18, 0, 0);
      } else if (mode === 'LONGBOARD') {
        const isAeroTuck = p.speed > 12.5 && accelInput > 0.2 && !p.isDrifting;
        const targetTorsoPitch = p.isDrifting
          ? 0.42
          : isAeroTuck
          ? 0.58
          : sp.pushAnimTimer > 0
          ? 0.28
          : 0.12;
        const targetTorsoYaw = p.isDrifting ? -steerInput * 0.55 : steerInput * 0.28;
        torsoRef.current.rotation.x = THREE.MathUtils.damp(
          torsoRef.current.rotation.x,
          targetTorsoPitch,
          8,
          dt
        );
        torsoRef.current.rotation.y = THREE.MathUtils.damp(
          torsoRef.current.rotation.y,
          targetTorsoYaw,
          8,
          dt
        );

        if (isAeroTuck) {
          leftArmRef.current.rotation.set(0.75, 0, 0.25);
          rightArmRef.current.rotation.set(0.75, 0, -0.25);
        } else if (p.isDrifting) {
          // Expressive counter-balance arm spread during a stand-up powerslide!
          leftArmRef.current.rotation.set(-0.35, 0, 1.25);
          rightArmRef.current.rotation.set(0.35, 0, -1.25);
        } else {
          const wave = Math.sin(elapsed * 3.5) * 0.08;
          leftArmRef.current.rotation.set(-0.2 + steerInput * 0.3, 0, 0.85 + wave);
          rightArmRef.current.rotation.set(0.2 - steerInput * 0.3, 0, -0.85 - wave);
        }
        leftLegRef.current.rotation.set(-0.22, 0, 0.12);
        // Animate Right Leg Foot-Push stroke against the asphalt when pushing!
        if (sp.pushAnimTimer > 0) {
          const pushArc = Math.sin((sp.pushAnimTimer / 0.38) * Math.PI);
          rightLegRef.current.rotation.set(0.22 + pushArc * 0.95, 0, -0.28);
        } else {
          rightLegRef.current.rotation.set(0.22, 0, -0.12);
        }
      } else if (mode === 'BIKE') {
        torsoRef.current.rotation.set(0.38, steerInput * 0.15, 0);
        leftArmRef.current.rotation.set(-0.95 + steerInput * 0.18, 0, 0.22);
        rightArmRef.current.rotation.set(-0.95 - steerInput * 0.18, 0, -0.22);
        leftLegRef.current.rotation.set(Math.sin(sp.pedalPhase) * 0.55 - 0.2, 0, 0);
        rightLegRef.current.rotation.set(Math.sin(sp.pedalPhase + Math.PI) * 0.55 - 0.2, 0, 0);
      } else if (mode === 'CANOE') {
        const stroke = Math.sin(p.paddlePhase);
        const side = p.paddleSide;
        // Turn torso toward the active paddle side (+Y rotation swings +Z chest toward +X!)
        torsoRef.current.rotation.set(0.18 + stroke * 0.14, side * 0.24, -side * 0.06);
        if (side >= 0) {
          // Paddle on +X side: RightArm (+0.23) is lower shaft hand, LeftArm (-0.23) reaches up/across to T-grip
          rightArmRef.current.rotation.set(-1.12 + stroke * 0.38, 0, 0.14);
          leftArmRef.current.rotation.set(-1.42 + stroke * 0.38, 0, 0.52);
        } else {
          // Paddle on -X side: LeftArm (-0.23) is lower shaft hand, RightArm (+0.23) reaches up/across to T-grip
          leftArmRef.current.rotation.set(-1.12 + stroke * 0.38, 0, -0.14);
          rightArmRef.current.rotation.set(-1.42 + stroke * 0.38, 0, -0.52);
        }
        leftLegRef.current.rotation.set(-1.32, 0.1, 0);
        rightLegRef.current.rotation.set(-1.32, -0.1, 0);
      } else {
        const stride = p.speed > 0.4 ? Math.sin(sp.walkBob) * Math.min(1, p.speed / 6) : 0;
        torsoRef.current.rotation.set(p.speed * 0.015, -stride * 0.15, 0);
        leftArmRef.current.rotation.set(stride * 0.65, 0, 0.12);
        rightArmRef.current.rotation.set(-stride * 0.65, 0, -0.12);
        leftLegRef.current.rotation.set(-stride * 0.75, 0, 0);
        rightLegRef.current.rotation.set(stride * 0.75, 0, 0);
      }

      // Step 4.2: Override Right Arm with Joyful Hand Wave during Emote!
      if (p.emoteTimer > 0 && p.specialState !== 'ZIPLINE') {
        rightArmRef.current.rotation.set(
          -2.55,
          0,
          -0.45 + Math.sin(elapsed * 16) * 0.42
        );
      }
    }

    // Steer Bike Handlebars & Spin Wheels visually (Chantier B)
    sp.wheelAngle += (p.speed / 0.32) * dt;
    if (bikeSteerRef.current && mode === 'BIKE') {
      bikeSteerRef.current.rotation.y = THREE.MathUtils.damp(
        bikeSteerRef.current.rotation.y,
        steerInput * 0.45,
        10,
        dt
      );
    }
    if (bikeFrontWheelRef.current && bikeRearWheelRef.current && mode === 'BIKE') {
      bikeFrontWheelRef.current.rotation.x = sp.wheelAngle;
      bikeRearWheelRef.current.rotation.x = sp.wheelAngle;
    }
    if (bikeCrankRef.current && mode === 'BIKE') {
      bikeCrankRef.current.rotation.x = sp.pedalPhase;
    }
    if (mode === 'LONGBOARD') {
      for (let w = 0; w < 4; w++) {
        const wheelMesh = longboardWheelsRef.current[w];
        if (wheelMesh) {
          wheelMesh.rotation.x = sp.wheelAngle * 2.8;
        }
      }
    }

    if (paddleRef.current && mode === 'CANOE') {
      const phase = p.paddlePhase;
      const side = p.paddleSide;
      paddleRef.current.position.x = THREE.MathUtils.damp(
        paddleRef.current.position.x,
        side * 0.14,
        14,
        dt
      );
      paddleRef.current.position.y = 0.62 - Math.max(0, Math.sin(phase)) * 0.06;
      paddleRef.current.position.z = 0.28 - Math.sin(phase) * 0.08;
      // Positive rotation.z when side=+1 tilts bottom (-Y blade) outward to +X and top (+Y T-grip) inward to the upper hand!
      paddleRef.current.rotation.z = side * (0.36 + Math.cos(phase) * 0.08);
      paddleRef.current.rotation.x = Math.sin(phase) * 0.42;
    }

    // 9. Automatic Warm Front Headlamp at Dusk/Night
    if (headlampRef.current && headlampTargetRef.current) {
      const targetIntensity = p.headlampOn ? THREE.MathUtils.lerp(0, 14.0, p.nightFactor) : 0;
      headlampRef.current.intensity = THREE.MathUtils.damp(
        headlampRef.current.intensity,
        targetIntensity,
        6,
        dt
      );
      headlampRef.current.target = headlampTargetRef.current;
      headlampTargetRef.current.updateMatrixWorld();
    }
    if (headlampLensMatRef.current) {
      headlampLensMatRef.current.emissiveIntensity = p.headlampOn ? 2.5 : 0.05;
    }

    // 10. Update Web Audio Soundscape
    soundscape.update(dt, mode);
  });

  const showVehicles = mutablePhysics.specialState === 'NONE';

  return (
    <group ref={rootGroupRef}>
      <group ref={visualTiltRef}>
        <ExplorerCharacter
          mode={mode}
          joints={joints}
          headlampLensMatRef={headlampLensMatRef}
        />

        {/* Step 4.2: Expanding Golden Emote / Bell Chime Ring */}
        <mesh
          ref={emoteRingRef}
          position={[0, 1.15, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          visible={false}
        >
          <ringGeometry args={[0.78, 0.95, 24]} />
          <meshBasicMaterial
            color="#ffd166"
            side={THREE.DoubleSide}
            transparent
            opacity={0.75}
          />
        </mesh>

        {/* Player Warm Headlamp SpotLight */}
        <spotLight
          ref={headlampRef}
          position={[0, 1.48, 0.22]}
          color="#ffe3a8"
          intensity={0}
          distance={46}
          angle={0.58}
          penumbra={0.65}
          decay={1.4}
          castShadow
        />
        <object3D ref={headlampTargetRef} position={[0, -0.35, 14]} />

        {showVehicles && mode === 'LONGBOARD' && (
          <LongboardMesh wheelsRef={longboardWheelsRef} />
        )}
        {showVehicles && mode === 'BIKE' && (
          <MountainBikeMesh
            steerRef={bikeSteerRef}
            frontWheelRef={bikeFrontWheelRef}
            rearWheelRef={bikeRearWheelRef}
            crankRef={bikeCrankRef}
          />
        )}
        {showVehicles && mode === 'CANOE' && <CanoeMesh paddleRef={paddleRef} />}
      </group>
    </group>
  );
};

const ExplorerCharacter: React.FC<{
  mode: MovementMode;
  joints: CharacterJointRefs;
  headlampLensMatRef: React.MutableRefObject<THREE.MeshStandardMaterial | null>;
}> = ({ mode, joints, headlampLensMatRef }) => {
  const { scene } = useGLTF('/models/explorer.glb');

  const characterScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  useEffect(() => {
    joints.torso.current = characterScene.getObjectByName('Torso') || null;
    joints.head.current = characterScene.getObjectByName('Head') || null;
    joints.scarf.current = characterScene.getObjectByName('Scarf') || null;
    joints.leftArm.current = characterScene.getObjectByName('LeftArm') || null;
    joints.rightArm.current = characterScene.getObjectByName('RightArm') || null;
    joints.leftLeg.current = characterScene.getObjectByName('LeftLeg') || null;
    joints.rightLeg.current = characterScene.getObjectByName('RightLeg') || null;

    const lensObj = characterScene.getObjectByName('HeadlampLens') as THREE.Mesh | undefined;
    if (lensObj && lensObj.material) {
      const clonedLensMat = (lensObj.material as THREE.MeshStandardMaterial).clone();
      lensObj.material = clonedLensMat;
      headlampLensMatRef.current = clonedLensMat;
    }
  }, [characterScene, joints, headlampLensMatRef]);

  const isSpecial = mutablePhysics.specialState !== 'NONE';
  const yOffset = isSpecial
    ? 0
    : mode === 'LONGBOARD'
    ? 0.14
    : mode === 'BIKE'
    ? 0.38
    : mode === 'CANOE'
    ? -0.22
    : 0;
  const bodyRotY = !isSpecial && mode === 'LONGBOARD' ? 0.45 : 0;

  return (
    <group position={[0, yOffset, 0]} rotation={[0, bodyRotY, 0]}>
      <primitive object={characterScene} />
    </group>
  );
};

useGLTF.preload('/models/explorer.glb');

const LongboardMesh: React.FC<{
  wheelsRef: React.MutableRefObject<(THREE.Object3D | null)[]>;
}> = ({ wheelsRef }) => {
  const { scene } = useGLTF('/models/longboard.glb');

  const boardScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  useEffect(() => {
    wheelsRef.current[0] = boardScene.getObjectByName('Wheel_FL') || null;
    wheelsRef.current[1] = boardScene.getObjectByName('Wheel_FR') || null;
    wheelsRef.current[2] = boardScene.getObjectByName('Wheel_RL') || null;
    wheelsRef.current[3] = boardScene.getObjectByName('Wheel_RR') || null;
  }, [boardScene, wheelsRef]);

  return <primitive object={boardScene} />;
};

useGLTF.preload('/models/longboard.glb');

const MountainBikeMesh: React.FC<{
  steerRef: React.MutableRefObject<THREE.Object3D | null>;
  frontWheelRef: React.MutableRefObject<THREE.Object3D | null>;
  rearWheelRef: React.MutableRefObject<THREE.Object3D | null>;
  crankRef: React.MutableRefObject<THREE.Object3D | null>;
}> = ({ steerRef, frontWheelRef, rearWheelRef, crankRef }) => {
  const { scene } = useGLTF('/models/mountain_bike.glb');

  const bikeScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  useEffect(() => {
    steerRef.current = bikeScene.getObjectByName('SteerGroup') || null;
    frontWheelRef.current = bikeScene.getObjectByName('FrontWheel') || null;
    rearWheelRef.current = bikeScene.getObjectByName('RearWheel') || null;
    crankRef.current = bikeScene.getObjectByName('Crankset') || null;
  }, [bikeScene, steerRef, frontWheelRef, rearWheelRef, crankRef]);

  return <primitive object={bikeScene} />;
};

useGLTF.preload('/models/mountain_bike.glb');

const CanoeMesh: React.FC<{
  paddleRef: React.MutableRefObject<THREE.Object3D | null>;
}> = ({ paddleRef }) => {
  const { scene } = useGLTF('/models/canoe.glb?v=5');

  const canoeScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  useEffect(() => {
    paddleRef.current = canoeScene.getObjectByName('Paddle') || null;
  }, [canoeScene, paddleRef]);

  return <primitive object={canoeScene} />;
};

useGLTF.preload('/models/canoe.glb?v=5');
