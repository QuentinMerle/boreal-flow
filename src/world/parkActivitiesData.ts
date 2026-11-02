import * as THREE from 'three';
import { MovementMode } from '../state/gameStore';
import { getTerrainHeightOnly, WATER_LEVEL } from './terrainData';

// --- Step 3.1: Contextual Transition Stations (Trailhead Racks & Lakeside Dock) ---
export interface TransitionStation {
  id: string;
  label: string;
  position: THREE.Vector3;
  targetMode: MovementMode;
  altMode: MovementMode;
  color: string;
}

export const TRANSITION_STATIONS: TransitionStation[] = [
  {
    id: 'rack-longboard',
    label: 'Summit Longboard Rack',
    position: new THREE.Vector3(-10, getTerrainHeightOnly(-10, -205), -205),
    targetMode: 'LONGBOARD',
    altMode: 'WALK',
    color: '#eb5e46',
  },
  {
    id: 'rack-bike',
    label: 'Singletrack VTT Trailhead',
    position: new THREE.Vector3(16, getTerrainHeightOnly(16, -205), -205),
    targetMode: 'BIKE',
    altMode: 'WALK',
    color: '#52b788',
  },
  {
    id: 'dock-canoe',
    label: 'Mirror Lake Canoe Dock',
    position: new THREE.Vector3(2, WATER_LEVEL + 0.3, 124),
    targetMode: 'CANOE',
    altMode: 'WALK',
    color: '#4ea8de',
  },
];

// --- Step 3.2: Acoustic Birdwatching & Wildlife Emitters ---
export interface WildlifeSpecies {
  id: string;
  name: string;
  frenchName: string;
  biome: string;
  basePos: THREE.Vector3;
  color: string;
  accentColor: string;
  callFreq: number;
  callPattern: 'LOON' | 'JAY' | 'EAGLE' | 'OWL';
  flightRadius: number;
  flightSpeed: number;
}

export const WILDLIFE_SPECIES: WildlifeSpecies[] = [
  {
    id: 'common-loon',
    name: 'Common Loon',
    frenchName: 'Plongeon Huard',
    biome: 'Mirror Lake Waters',
    basePos: new THREE.Vector3(16, WATER_LEVEL + 0.25, 152),
    color: '#1f2937',
    accentColor: '#f8fafc',
    callFreq: 580,
    callPattern: 'LOON',
    flightRadius: 7.5,
    flightSpeed: 0.45,
  },
  {
    id: 'blue-jay',
    name: 'Stellar Blue Jay',
    frenchName: 'Geai Bleu Boréal',
    biome: 'Eastern Pine Singletrack',
    basePos: new THREE.Vector3(36, getTerrainHeightOnly(36, -48) + 5.8, -48),
    color: '#2563eb',
    accentColor: '#93c5fd',
    callFreq: 1850,
    callPattern: 'JAY',
    flightRadius: 3.5,
    flightSpeed: 1.8,
  },
  {
    id: 'bald-eagle',
    name: 'Boreal Bald Eagle',
    frenchName: 'Pygargue à Tête Blanche',
    biome: 'Western Canyon Thermals',
    basePos: new THREE.Vector3(-42, getTerrainHeightOnly(-42, -90) + 24, -90),
    color: '#4a3525',
    accentColor: '#fef08a',
    callFreq: 2450,
    callPattern: 'EAGLE',
    flightRadius: 18.0,
    flightSpeed: 0.75,
  },
  {
    id: 'great-owl',
    name: 'Great Horned Owl',
    frenchName: 'Grand-Duc d’Amérique',
    biome: 'Summit Firewatch Tower',
    basePos: new THREE.Vector3(0, getTerrainHeightOnly(0, -228) + 22.8, -228),
    color: '#78593c',
    accentColor: '#f59e0b',
    callFreq: 340,
    callPattern: 'OWL',
    flightRadius: 0.4,
    flightSpeed: 0.5,
  },
];

// --- Step 3.3: Bouldering Crag, Summit Firewatch Tower & 340m Zipline ---
export const TOWER_BASE_X = 0;
export const TOWER_BASE_Z = -228;
export const TOWER_BASE_Y = getTerrainHeightOnly(TOWER_BASE_X, TOWER_BASE_Z);
export const TOWER_DECK_HEIGHT = 17.5; // Deck is at TOWER_BASE_Y + 17.5 (~91.5m)

// Bouldering cliff face zone on the south side of the Firewatch Tower foundation
export const CLIMB_ZONE = {
  centerX: 0,
  centerZ: -222.5,
  minY: TOWER_BASE_Y,
  maxY: TOWER_BASE_Y + TOWER_DECK_HEIGHT + 0.5,
  radius: 4.2,
};

// Zipline stretches from the Summit Firewatch Tower Deck all the way to the Lakeside Base Camp!
export const ZIPLINE_START = new THREE.Vector3(2.4, TOWER_BASE_Y + TOWER_DECK_HEIGHT + 1.8, -224);
export const ZIPLINE_END = new THREE.Vector3(-12, getTerrainHeightOnly(-12, 108) + 3.2, 108);

// Helper to evaluate position & tangent along the Zipline (with subtle natural cable sag)
export function getZiplinePoint(t: number, outPos: THREE.Vector3): THREE.Vector3 {
  outPos.lerpVectors(ZIPLINE_START, ZIPLINE_END, t);
  // Subtle catenary sag in the middle of the 330m span
  const sag = Math.sin(t * Math.PI) * 4.5;
  outPos.y -= sag;
  return outPos;
}
