import { create } from 'zustand';
import * as THREE from 'three';

export type MovementMode = 'WALK' | 'LONGBOARD' | 'BIKE' | 'CANOE';
export type SurfaceType = 'ASPHALT' | 'DIRT' | 'GRASS' | 'ROCK' | 'SAND' | 'WATER';
export type TimePreset = 'DAWN' | 'NOON' | 'GOLDEN' | 'NIGHT';
export type SpecialActionState = 'NONE' | 'ZIPLINE' | 'CAMPFIRE';
export type CameraMode = 'DIORAMA' | 'COCKPIT';
export type TriathlonStatus = 'IDLE' | 'ACTIVE' | 'FINISHED';
export type BadgeType = 'MAPLE' | 'JAY' | 'MOOSE' | 'NONE';

export interface PhysicsPreset {
  label: string;
  keyHint: string;
  maxSpeed: number;
  accelForce: number;
  gravityScale: number;
  rollingResistance: number;
  lateralGrip: number;
  driftGrip: number;
  turnSpeed: number;
  leanFactor: number;
  hopImpulse: number;
  accentColor: string;
}

export const PHYSICS_PRESETS: Record<MovementMode, PhysicsPreset> = {
  WALK: {
    label: 'Hike / Walk',
    keyHint: '1',
    maxSpeed: 9,
    accelForce: 28,
    gravityScale: 1.0,
    rollingResistance: 5.5,
    lateralGrip: 14.0,
    driftGrip: 14.0,
    turnSpeed: 3.6,
    leanFactor: 0.15,
    hopImpulse: 5.2,
    accentColor: '#e2a856',
  },
  LONGBOARD: {
    label: 'Longboard',
    keyHint: '2',
    maxSpeed: 38,
    accelForce: 18,
    gravityScale: 1.58,
    rollingResistance: 0.16,
    lateralGrip: 10.5,
    driftGrip: 1.75,
    turnSpeed: 2.55,
    leanFactor: 0.68,
    hopImpulse: 4.1,
    accentColor: '#eb5e46',
  },
  BIKE: {
    label: 'Mountain Bike (VTT)',
    keyHint: '3',
    maxSpeed: 38,
    accelForce: 28,
    gravityScale: 1.62,
    rollingResistance: 0.18,
    lateralGrip: 9.2,
    driftGrip: 2.1,
    turnSpeed: 2.85,
    leanFactor: 0.62,
    hopImpulse: 6.0,
    accentColor: '#52b788',
  },
  CANOE: {
    label: 'Whitewater Canoe / Kayak',
    keyHint: '4',
    maxSpeed: 8.0, // ~28 km/h sprint, cruising at 15-18 km/h
    accelForce: 4.8, // Smooth authentic paddling strokes
    gravityScale: 0.35, // Water viscous resistance dampens steep falls
    rollingResistance: 0.75, // Natural hydrodynamic glide damping
    lateralGrip: 4.5,
    driftGrip: 2.0,
    turnSpeed: 2.2,
    leanFactor: 0.28,
    hopImpulse: 0,
    accentColor: '#4ea8de',
  },
};

// Campfire coordinates in world space (matching TerrainChunk Base Camp at [-10, campY, 470])
export const CAMPFIRE_WORLD_POS = new THREE.Vector3(-7.9, 1.8, 472.7);
export const CAMPFIRE_SEAT_POS = new THREE.Vector3(-6.8, 1.8, 472.8);

// High-frequency mutable physics & environment state (NEVER triggers React re-renders inside useFrame)
export interface MutablePhysicsState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  forward: THREE.Vector3;
  groundNormal: THREE.Vector3;
  yaw: number;
  speed: number;
  lateralSpeed: number;
  slopeAngle: number;
  isGrounded: boolean;
  isDrifting: boolean;
  isPumping: boolean;
  paddleSide: number;
  paddlePhase: number;
  surface: SurfaceType;
  waterDepth: number;
  // Phase 2: Day/Night mutable clock
  timeOfDay: number;
  nightFactor: number;
  headlampOn: boolean;
  // Phase 3: Activities, Zipline, Binoculars & Poof Burst
  specialState: SpecialActionState;
  ziplineT: number;
  poofCounter: number;
  poofPosition: THREE.Vector3;
  contextPrompt: string;
  binocularsYaw: number;
  binocularsPitch: number;
  targetedBirdId: string | null;
  scanProgress: number;
  // Phase 4.2: Non-Verbal Emote / Bell & Campfire Hub
  emoteTimer: number;
  emoteCounter: number;
  // Session 2: Hybrid Camera, Pause & Gamepad
  isPaused: boolean;
  cameraMode: CameraMode;
  gamepadConnected: boolean;
  gamepadName: string;
  // Session 2: Boreal Triathlon & Diegetic Loop
  triathlonStatus: TriathlonStatus;
  triathlonTimer: number;
  triathlonFinishTime: number;
  triathlonBadge: BadgeType;
  triathlonVehicles: MovementMode[];
  triathlonPB: number;
}

export const mutablePhysics: MutablePhysicsState = {
  position: new THREE.Vector3(-10, 332, -755),
  velocity: new THREE.Vector3(0, 0, 0),
  forward: new THREE.Vector3(0, 0, 1),
  groundNormal: new THREE.Vector3(0, 1, 0),
  yaw: 0,
  speed: 0,
  lateralSpeed: 0,
  slopeAngle: 0,
  isGrounded: true,
  isDrifting: false,
  isPumping: false,
  paddleSide: 1,
  paddlePhase: 0,
  surface: 'ASPHALT',
  waterDepth: 0,
  timeOfDay: 17.5,
  nightFactor: 0,
  headlampOn: false,
  specialState: 'NONE',
  ziplineT: 0,
  poofCounter: 0,
  poofPosition: new THREE.Vector3(),
  contextPrompt: '',
  binocularsYaw: 0,
  binocularsPitch: 0,
  targetedBirdId: null,
  scanProgress: 0,
  emoteTimer: 0,
  emoteCounter: 0,
  isPaused: false,
  cameraMode: 'DIORAMA',
  gamepadConnected: false,
  gamepadName: '',
  triathlonStatus: 'IDLE',
  triathlonTimer: 0,
  triathlonFinishTime: 0,
  triathlonBadge: 'NONE',
  triathlonVehicles: ['LONGBOARD'],
  triathlonPB: (() => {
    try {
      const saved = localStorage.getItem('boreal_triathlon_pb');
      return saved ? parseFloat(saved) : Infinity;
    } catch {
      return Infinity;
    }
  })(),
};

export function triggerPoofEffect(pos: THREE.Vector3) {
  mutablePhysics.poofPosition.copy(pos);
  mutablePhysics.poofCounter += 1;
}

export function triggerPlayerEmote() {
  mutablePhysics.emoteTimer = 1.6;
  mutablePhysics.emoteCounter += 1;
}

export type SpawnLocation = 'SUMMIT_ROAD' | 'SUMMIT_TRAIL' | 'LAKE_SHORE' | 'FIREWATCH_TOWER' | 'CAMPFIRE_HUB';

interface GameUIState {
  mode: MovementMode;
  isPaused: boolean;
  spawnCounter: number;
  spawnTarget: SpawnLocation;
  timeCyclePaused: boolean;
  audioMuted: boolean;
  binocularsActive: boolean;
  discoveredBirds: string[];
  cameraMode: CameraMode;
  gamepadConnected: boolean;
  triathlonStatus: TriathlonStatus;
  triathlonTimer: number;
  triathlonFinishTime: number;
  triathlonBadge: BadgeType;
  triathlonVehicles: MovementMode[];
  triathlonPB: number;
  setMode: (mode: MovementMode, withPoof?: boolean) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  respawnAt: (target: SpawnLocation, defaultMode?: MovementMode) => void;
  setTimePreset: (preset: TimePreset) => void;
  toggleTimePause: () => void;
  toggleAudioMute: () => void;
  toggleBinoculars: () => void;
  setBinocularsActive: (active: boolean) => void;
  discoverBird: (birdId: string) => void;
  toggleCameraMode: () => void;
  setCameraMode: (mode: CameraMode) => void;
  setGamepadConnected: (connected: boolean) => void;
  startTriathlon: (initialMode: MovementMode) => void;
  updateTriathlonVehicle: (mode: MovementMode) => void;
  finishTriathlon: (finishTime: number, badge: BadgeType) => void;
  resetTriathlon: () => void;
}

export const TIME_PRESET_HOURS: Record<TimePreset, number> = {
  DAWN: 6.2,
  NOON: 12.5,
  GOLDEN: 17.8,
  NIGHT: 22.8,
};

export const useGameStore = create<GameUIState>((set) => ({
  mode: 'LONGBOARD',
  isPaused: false,
  spawnCounter: 0,
  spawnTarget: 'SUMMIT_ROAD',
  timeCyclePaused: false,
  audioMuted: false,
  binocularsActive: false,
  discoveredBirds: [],
  cameraMode: 'DIORAMA',
  gamepadConnected: false,
  triathlonStatus: 'IDLE',
  triathlonTimer: 0,
  triathlonFinishTime: 0,
  triathlonBadge: 'NONE',
  triathlonVehicles: ['LONGBOARD'],
  triathlonPB: mutablePhysics.triathlonPB,
  setMode: (mode, withPoof = true) =>
    set((state) => {
      if (mutablePhysics.specialState === 'CAMPFIRE') {
        mutablePhysics.specialState = 'NONE';
      }
      if (withPoof && state.mode !== mode) {
        triggerPoofEffect(mutablePhysics.position);
      }
      if (mutablePhysics.triathlonStatus === 'ACTIVE' && !mutablePhysics.triathlonVehicles.includes(mode)) {
        mutablePhysics.triathlonVehicles.push(mode);
      }
      return {
        mode,
        binocularsActive: false,
        triathlonVehicles: [...mutablePhysics.triathlonVehicles],
      };
    }),
  togglePause: () =>
    set((state) => {
      const next = !state.isPaused;
      mutablePhysics.isPaused = next;
      return { isPaused: next };
    }),
  setPaused: (paused) => {
    mutablePhysics.isPaused = paused;
    set({ isPaused: paused });
  },
  respawnAt: (target, defaultMode) =>
    set((state) => {
      mutablePhysics.isPaused = false;
      mutablePhysics.specialState = target === 'CAMPFIRE_HUB' ? 'CAMPFIRE' : 'NONE';
      if (target === 'SUMMIT_ROAD' || target === 'SUMMIT_TRAIL') {
        mutablePhysics.triathlonStatus = 'IDLE';
        mutablePhysics.triathlonTimer = 0;
        mutablePhysics.triathlonFinishTime = 0;
        mutablePhysics.triathlonBadge = 'NONE';
      }
      return {
        isPaused: false,
        spawnTarget: target,
        spawnCounter: state.spawnCounter + 1,
        mode: defaultMode ?? state.mode,
        binocularsActive: false,
        triathlonStatus: mutablePhysics.triathlonStatus,
        triathlonTimer: mutablePhysics.triathlonTimer,
      };
    }),
  setTimePreset: (preset) => {
    mutablePhysics.timeOfDay = TIME_PRESET_HOURS[preset];
  },
  toggleTimePause: () => set((s) => ({ timeCyclePaused: !s.timeCyclePaused })),
  toggleAudioMute: () => set((s) => ({ audioMuted: !s.audioMuted })),
  toggleBinoculars: () =>
    set((s) => {
      const next = !s.binocularsActive;
      if (next) {
        mutablePhysics.binocularsYaw = mutablePhysics.yaw;
        mutablePhysics.binocularsPitch = -0.05;
        mutablePhysics.scanProgress = 0;
      }
      return { binocularsActive: next };
    }),
  setBinocularsActive: (active) => set({ binocularsActive: active }),
  discoverBird: (birdId) =>
    set((s) =>
      s.discoveredBirds.includes(birdId)
        ? s
        : { discoveredBirds: [...s.discoveredBirds, birdId] }
    ),
  toggleCameraMode: () =>
    set((s) => {
      const next: CameraMode = s.cameraMode === 'DIORAMA' ? 'COCKPIT' : 'DIORAMA';
      mutablePhysics.cameraMode = next;
      return { cameraMode: next };
    }),
  setCameraMode: (mode) => {
    mutablePhysics.cameraMode = mode;
    set({ cameraMode: mode });
  },
  setGamepadConnected: (connected) => {
    mutablePhysics.gamepadConnected = connected;
    set({ gamepadConnected: connected });
  },
  startTriathlon: (initialMode) => {
    mutablePhysics.triathlonStatus = 'ACTIVE';
    mutablePhysics.triathlonTimer = 0;
    mutablePhysics.triathlonFinishTime = 0;
    mutablePhysics.triathlonBadge = 'NONE';
    mutablePhysics.triathlonVehicles = [initialMode];
    set({
      triathlonStatus: 'ACTIVE',
      triathlonTimer: 0,
      triathlonFinishTime: 0,
      triathlonBadge: 'NONE',
      triathlonVehicles: [initialMode],
    });
  },
  updateTriathlonVehicle: (mode) => {
    if (!mutablePhysics.triathlonVehicles.includes(mode)) {
      mutablePhysics.triathlonVehicles.push(mode);
      set((s) => ({ triathlonVehicles: [...s.triathlonVehicles, mode] }));
    }
  },
  finishTriathlon: (finishTime, badge) => {
    mutablePhysics.triathlonStatus = 'FINISHED';
    mutablePhysics.triathlonFinishTime = finishTime;
    mutablePhysics.triathlonBadge = badge;
    const isNewPB = finishTime < mutablePhysics.triathlonPB;
    if (isNewPB) {
      mutablePhysics.triathlonPB = finishTime;
      try {
        localStorage.setItem('boreal_triathlon_pb', finishTime.toFixed(2));
      } catch {}
    }
    set({
      triathlonStatus: 'FINISHED',
      triathlonFinishTime: finishTime,
      triathlonBadge: badge,
      triathlonPB: mutablePhysics.triathlonPB,
    });
  },
  resetTriathlon: () => {
    mutablePhysics.triathlonStatus = 'IDLE';
    mutablePhysics.triathlonTimer = 0;
    mutablePhysics.triathlonFinishTime = 0;
    set({
      triathlonStatus: 'IDLE',
      triathlonTimer: 0,
      triathlonFinishTime: 0,
    });
  },
}));
