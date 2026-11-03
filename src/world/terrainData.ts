import * as THREE from 'three';
import { fbm2D, simplex2D } from '../math/noise';
import { SurfaceType, MovementMode } from '../state/gameStore';

// Session 3 Upgrade: 1,600m "Red Bull Rampage -> Boreal Forest -> Mirror Lake" Megamap
export const TERRAIN_WIDTH = 440; // X: -220 to +220
export const TERRAIN_LENGTH = 1600; // Z: -800 to +800
export const GRID_SEGMENTS_X = 230; // ~1.91m per cell
export const GRID_SEGMENTS_Z = 720; // ~2.22m per cell
export const WATER_LEVEL = 0.0;

// 1. Scenic Asphalt Road Spline (Sweeping S-curves & hairpins from Z=-762 summit to Z=+480 lake camp)
export const ASPHALT_SPLINE_POINTS = [
  new THREE.Vector3(-10, 0, -762),
  new THREE.Vector3(-12, 0, -715),
  new THREE.Vector3(-68, 0, -610),
  new THREE.Vector3(48, 0, -495),
  new THREE.Vector3(-76, 0, -370),
  new THREE.Vector3(52, 0, -245),
  new THREE.Vector3(-72, 0, -115),
  new THREE.Vector3(44, 0, 15),
  new THREE.Vector3(-66, 0, 145),
  new THREE.Vector3(36, 0, 270),
  new THREE.Vector3(-42, 0, 385),
  new THREE.Vector3(-15, 0, 480),
];

// 2. Dirt Singletrack VTT Trail Spline (Upper "Red Bull Rampage" ridge line + mid-forest berms & kickers)
export const DIRT_SPLINE_POINTS = [
  new THREE.Vector3(16, 0, -762),
  new THREE.Vector3(38, 0, -700),
  new THREE.Vector3(78, 0, -595),
  new THREE.Vector3(-18, 0, -480),
  new THREE.Vector3(64, 0, -365),
  new THREE.Vector3(-44, 0, -250),
  new THREE.Vector3(24, 0, -140),
  new THREE.Vector3(-56, 0, -25),
  new THREE.Vector3(48, 0, 95),
  new THREE.Vector3(-28, 0, 215),
  new THREE.Vector3(42, 0, 340),
  new THREE.Vector3(14, 0, 475),
];

// 3. Downhill Whitewater Kayak/Canoe River Spline (Starts at Z=-320 canyon headwaters and rushes to Mirror Lake at Z=+485)
export const RIVER_SPLINE_POINTS = [
  new THREE.Vector3(54, 0, -320),
  new THREE.Vector3(84, 0, -210),
  new THREE.Vector3(52, 0, -95),
  new THREE.Vector3(86, 0, 20),
  new THREE.Vector3(56, 0, 140),
  new THREE.Vector3(82, 0, 260),
  new THREE.Vector3(48, 0, 375),
  new THREE.Vector3(24, 0, 482),
  new THREE.Vector3(4, 0, 565),
];

export const asphaltCurve = new THREE.CatmullRomCurve3(ASPHALT_SPLINE_POINTS, false, 'catmullrom', 0.5);
export const dirtCurve = new THREE.CatmullRomCurve3(DIRT_SPLINE_POINTS, false, 'catmullrom', 0.5);
export const riverCurve = new THREE.CatmullRomCurve3(RIVER_SPLINE_POINTS, false, 'catmullrom', 0.5);

interface SampledSplinePoint {
  x: number;
  z: number;
  t: number;
  kickerBoost: number;
  tx: number;
  tz: number;
}

const SAMPLE_COUNT = 1200;
const asphaltSamples: SampledSplinePoint[] = [];
const dirtSamples: SampledSplinePoint[] = [];
const riverSamples: SampledSplinePoint[] = [];

// Pure C-2 analytical tabletop jump kickers along the VTT Singletrack (controlled 0.62m height so jumps feel grounded & flow-y!)
export const KICKER_Z_CENTERS = [-615, -435, -210, 15, 235, 385];

function evaluateAnalyticalDirtKicker(z: number): number {
  let boost = 0;
  for (let i = 0; i < KICKER_Z_CENTERS.length; i++) {
    const kz = KICKER_Z_CENTERS[i];
    const dz = z - kz;
    // Smooth 24m approach tabletop (-19m to +6m) with a controlled 0.62m lip
    if (dz > -19.0 && dz <= 0.0) {
      const u = (dz + 19.0) / 19.0;
      const s = u * u * (3 - 2 * u);
      boost += s * 0.62;
    } else if (dz > 0.0 && dz < 8.5) {
      const u = 1.0 - dz / 8.5;
      const s = u * u * (3 - 2 * u);
      boost += s * 0.62;
    }
  }
  return boost;
}

/**
 * Pure C-infinity analytical mountain slope elevation at any Z coordinate (1,600m map).
 * Drops 335m from the steep "Red Bull Rampage" summit (Z=-765) down to Mirror Lake (Z=+480).
 */
export function computeSmoothSlopeElevation(z: number): number {
  const slopeT = THREE.MathUtils.clamp((z + 765) / 1245, 0, 1.35);
  if (slopeT <= 1.0) {
    const smooth = 1.0 - slopeT;
    // Steeper upper Rampage headwall (power 1.52) transitioning into fast flowing mid-mountain valley
    return 335.0 * Math.pow(smooth, 1.52);
  } else {
    const waterT = THREE.MathUtils.clamp((z - 480) / 245, 0, 1);
    return -8.0 * Math.sin(waterT * Math.PI * 0.5);
  }
}

// Base mountain profile before spline carving (1,600m canyon from Z=-800 to Z=+800)
function computeRawMountainElevation(x: number, z: number): number {
  const slopeT = THREE.MathUtils.clamp((z + 765) / 1245, 0, 1.35);
  const baseHeight = computeSmoothSlopeElevation(z);

  // Dramatic Canadian canyon walls on far left/right flanks
  const edgeDist = Math.max(0, Math.abs(x) - 92);
  const canyonWall =
    Math.pow(edgeDist / 46, 1.88) * 34.0 * THREE.MathUtils.clamp(1.3 - slopeT * 0.85, 0.25, 1.15);

  // "Red Bull Rampage" Upper Summit Zone (Z = -800 to -310):
  // Rugged sharp rock spines, terraced sandstone/granite cliff ribs & dramatic couloirs!
  const rampageZone = 1.0 - THREE.MathUtils.smoothstep(z, -680, -260);
  const ridgeSharp = 1.0 - Math.abs(simplex2D(x * 0.019 + 3.1, z * 0.014 - 2.4));
  const rampageSpines = Math.pow(ridgeSharp, 2.6) * 26.0 * rampageZone;
  const rockTerrace = Math.sin(baseHeight * 0.22 + simplex2D(x * 0.025, z * 0.025) * 1.8) * 3.8 * rampageZone;

  // Multi-octave Simplex noise for natural rocky ridges and undulations
  const macroNoise = fbm2D(x * 0.009, z * 0.009, 4, 2.0, 0.5) * (12.0 + rampageZone * 9.0);
  const ridgeNoise = Math.abs(simplex2D(x * 0.022 + 10, z * 0.022 - 5)) * (5.0 + rampageZone * 5.5);

  // Fade out rough terrain noise near the flat shore & lake basin (Z > 480)
  const noiseMask = THREE.MathUtils.smoothstep(495 - z, 0, 95);

  // Curved southern shoreline & wooded ridge enclosing Mirror Lake inside an oval alpine basin (Z = 725..796)
  const southArchZ = 725 - (x * x) * 0.002 + simplex2D(x * 0.014, 7.3) * 18.0;
  const southShoreT = THREE.MathUtils.smoothstep(z, southArchZ - 32, 794);
  const southRidgeNoise = Math.abs(simplex2D(x * 0.018 + 4.2, z * 0.018)) * 15.0;
  const southShoreRise = Math.pow(southShoreT, 1.45) * (36.0 + southRidgeNoise);

  return (
    baseHeight +
    canyonWall +
    southShoreRise +
    (macroNoise + ridgeNoise + rampageSpines + rockTerrace) * noiseMask
  );
}

// Pre-sample all 3 splines for fast 2D distance queries
function initSplineSamples() {
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;

    // 1. Asphalt Road
    asphaltCurve.getPoint(t, tmp);
    asphaltCurve.getTangent(t, tan);
    asphaltSamples.push({ x: tmp.x, z: tmp.z, t, kickerBoost: 0, tx: tan.x, tz: tan.z });

    // 2. Dirt Singletrack
    dirtCurve.getPoint(t, tmp);
    dirtCurve.getTangent(t, tan);
    dirtSamples.push({ x: tmp.x, z: tmp.z, t, kickerBoost: 0, tx: tan.x, tz: tan.z });

    // 3. Downhill Whitewater River
    riverCurve.getPoint(t, tmp);
    riverCurve.getTangent(t, tan);
    riverSamples.push({ x: tmp.x, z: tmp.z, t, kickerBoost: 0, tx: tan.x, tz: tan.z });
  }
}
initSplineSamples();

// Precomputed regular grid for O(1) physics lookups and mesh generation
const COLS = GRID_SEGMENTS_X + 1;
const ROWS = GRID_SEGMENTS_Z + 1;
export const heightGrid = new Float32Array(COLS * ROWS);
export const surfaceGrid = new Uint8Array(COLS * ROWS);
// Surface codes: 0 = GRASS, 1 = ASPHALT, 2 = DIRT, 3 = ROCK, 4 = SAND, 5 = WATER

/**
 * Fast coarse-to-fine closest spline sample lookup (~20x faster than full linear scan).
 */
function findClosestSplineSample(
  samples: SampledSplinePoint[],
  x: number,
  z: number,
  zWindow: number
): { distSq: number; sample: SampledSplinePoint } {
  let bestIdx = 0;
  let minDistSq = Infinity;
  const len = samples.length;

  // 1. Coarse pass (stride = 8)
  for (let i = 0; i < len; i += 8) {
    const s = samples[i];
    const dz = s.z - z;
    if (Math.abs(dz) > zWindow) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      bestIdx = i;
    }
  }

  // 2. Local fine pass (±8 samples around best coarse hit)
  const start = Math.max(0, bestIdx - 8);
  const end = Math.min(len - 1, bestIdx + 8);
  for (let i = start; i <= end; i++) {
    const s = samples[i];
    const dx = s.x - x;
    const dz = s.z - z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      bestIdx = i;
    }
  }

  return { distSq: minDistSq, sample: samples[bestIdx] };
}

function evaluatePoint(x: number, z: number): {
  height: number;
  surfaceCode: number;
} {
  let rawH = computeRawMountainElevation(x, z);
  const smoothSlopeH = Math.max(0, computeSmoothSlopeElevation(z));

  const roadHit = findClosestSplineSample(asphaltSamples, x, z, 48);
  const dirtHit = findClosestSplineSample(dirtSamples, x, z, 42);
  const riverHit = findClosestSplineSample(riverSamples, x, z, 48);

  const roadDist = Math.sqrt(roadHit.distSq);
  const dirtDist = Math.sqrt(dirtHit.distSq);
  const riverDist = Math.sqrt(riverHit.distSq);

  // Carve the Downhill Mountain Whitewater River Channel (from Z = -322 down to Mirror Lake at Z = +485)
  const inRiverZone = z > -322 && z < 492 && riverDist < 22.0;
  if (inRiverZone) {
    const canyonBlend = 1.0 - THREE.MathUtils.smoothstep(riverDist, 7.5, 22.0);
    // River bed follows the downhill mountain slope (-1.35m trough in center, +1.8m rocky banks)
    const riverBedH =
      riverDist < 7.5
        ? smoothSlopeH - 1.35 * Math.cos((riverDist / 7.5) * Math.PI * 0.4)
        : smoothSlopeH + 1.8;
    rawH = THREE.MathUtils.lerp(rawH, riverBedH, canyonBlend);
  }

  // Dirt trail carving profile: 5.5m parabolic bobsleigh bowl + pure analytical kicker in Z
  // Incurved cuvette profile: center is sunken (-0.22m) and lateral berms rise (+0.38m)
  // This physically creates an inward normal gradient that funnels bikes towards the center and prevents uphill rollback!
  const dirtNormDist = Math.min(1.0, dirtDist / 4.4);
  const dirtCuvette = dirtNormDist * dirtNormDist * 0.60 - 0.22;
  const dirtTargetElev = smoothSlopeH + 1.15 + dirtCuvette + evaluateAnalyticalDirtKicker(z);
  const dirtFlatten = 1.0 - THREE.MathUtils.smoothstep(dirtDist, 5.5, 12.0);
  rawH = THREE.MathUtils.lerp(rawH, dirtTargetElev, dirtFlatten);

  // Road flattening profile: wide 8.0m corridor with subtle 0.20m banking bowl
  const roadNormDist = Math.min(1.0, roadDist / 5.2);
  const roadCuvette = roadNormDist * roadNormDist * 0.30 - 0.10;
  const roadTargetElev = smoothSlopeH + 1.25 + roadCuvette;
  const roadFlatten = 1.0 - THREE.MathUtils.smoothstep(roadDist, 8.0, 15.5);
  rawH = THREE.MathUtils.lerp(rawH, roadTargetElev, roadFlatten);

  // Determine dominant surface code
  let surfaceCode = 0; // GRASS
  if (rawH < WATER_LEVEL + 0.15 || (z > -318 && z < 486 && riverDist < 5.8)) {
    surfaceCode = 5; // WATER (Lake OR Downhill Mountain River Rapids!)
  } else if (roadDist < 4.6 && z < 482) {
    surfaceCode = 1; // ASPHALT
  } else if (dirtDist < 2.75 && z < 478) {
    surfaceCode = 2; // DIRT
  } else if ((rawH < WATER_LEVEL + 1.85 && z > 440) || (z > -318 && z < 486 && riverDist < 9.2)) {
    surfaceCode = 4; // SAND / SHORE / RIVER BANK
  } else if (
    rawH > 195 ||
    Math.abs(x) > 102 ||
    (riverDist >= 9.2 && riverDist < 17.5 && z > -315 && z < 450)
  ) {
    surfaceCode = 3; // ROCK / RAMPAGE SUMMIT CLIFFS & CANYON WALLS
  }

  return {
    height: rawH,
    surfaceCode,
  };
}

// Build heightGrid & surfaceGrid once at module load
for (let iz = 0; iz < ROWS; iz++) {
  const z = (iz / GRID_SEGMENTS_Z - 0.5) * TERRAIN_LENGTH;
  for (let ix = 0; ix < COLS; ix++) {
    const x = (ix / GRID_SEGMENTS_X - 0.5) * TERRAIN_WIDTH;
    const idx = iz * COLS + ix;
    const res = evaluatePoint(x, z);
    heightGrid[idx] = res.height;
    surfaceGrid[idx] = res.surfaceCode;
  }
}

export function getTerrainHeightOnly(x: number, z: number): number {
  const gx = (x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X;
  const gz = (z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z;

  const ix = THREE.MathUtils.clamp(Math.floor(gx), 0, GRID_SEGMENTS_X - 1);
  const iz = THREE.MathUtils.clamp(Math.floor(gz), 0, GRID_SEGMENTS_Z - 1);
  const fx = THREE.MathUtils.clamp(gx - ix, 0, 1);
  const fz = THREE.MathUtils.clamp(gz - iz, 0, 1);

  const i00 = iz * COLS + ix;
  const i10 = i00 + 1;
  const i01 = i00 + COLS;
  const i11 = i01 + 1;

  const h00 = heightGrid[i00];
  const h10 = heightGrid[i10];
  const h01 = heightGrid[i01];
  const h11 = heightGrid[i11];

  // Smooth bilinear interpolation (eliminates diagonal triangle crease bumps!)
  const h0 = h00 + fx * (h10 - h00);
  const h1 = h01 + fx * (h11 - h01);
  return h0 + fz * (h1 - h0);
}

// Update spline Y coordinates so prop placement has exact 3D heights
for (let i = 0; i < ASPHALT_SPLINE_POINTS.length; i++) {
  const pt = ASPHALT_SPLINE_POINTS[i];
  pt.y = getTerrainHeightOnly(pt.x, pt.z) + 0.2;
}
for (let i = 0; i < DIRT_SPLINE_POINTS.length; i++) {
  const pt = DIRT_SPLINE_POINTS[i];
  pt.y = getTerrainHeightOnly(pt.x, pt.z) + 0.2;
}

// --- Fallen Tree Log Hurdles across Road & Singletrack (Bunny-Hop Obstacles) ---
export interface FallenLogObstacle {
  id: string;
  position: THREE.Vector3;
  yaw: number;
  length: number;
  radius: number;
}

function buildFallenLogs(): FallenLogObstacle[] {
  const logs: FallenLogObstacle[] = [];
  const pt = new THREE.Vector3();
  const tan = new THREE.Vector3();

  // 4 Fallen Logs across the 1,600m Asphalt Road
  const roadLogT = [0.21, 0.44, 0.67, 0.85];
  roadLogT.forEach((t, idx) => {
    asphaltCurve.getPoint(t, pt);
    asphaltCurve.getTangent(t, tan);
    const y = getTerrainHeightOnly(pt.x, pt.z);
    // Perpendicular to the road tangent
    const yaw = Math.atan2(tan.x, tan.z) + Math.PI * 0.5;
    logs.push({
      id: `road-log-${idx}`,
      position: new THREE.Vector3(pt.x, y + 0.34, pt.z),
      yaw,
      length: 7.6,
      radius: 0.36,
    });
  });

  // 4 Fallen Logs across the 1,600m Dirt Singletrack
  const dirtLogT = [0.19, 0.39, 0.61, 0.79];
  dirtLogT.forEach((t, idx) => {
    dirtCurve.getPoint(t, pt);
    dirtCurve.getTangent(t, tan);
    const y = getTerrainHeightOnly(pt.x, pt.z);
    const yaw = Math.atan2(tan.x, tan.z) + Math.PI * 0.5;
    logs.push({
      id: `dirt-log-${idx}`,
      position: new THREE.Vector3(pt.x, y + 0.32, pt.z),
      yaw,
      length: 5.2,
      radius: 0.34,
    });
  });

  return logs;
}

export const FALLEN_LOGS: FallenLogObstacle[] = buildFallenLogs();

/**
 * Evaluates directional river current vector at (x, z) for Downhill Whitewater Canoe/Kayak rapids.
 * Zero allocations in useFrame.
 */
export function getRiverCurrentVector(x: number, z: number, outVec: THREE.Vector3): THREE.Vector3 {
  let minDistSq = Infinity;
  let bestTx = 0;
  let bestTz = 1;

  for (let i = 0; i < riverSamples.length; i += 2) {
    const s = riverSamples[i];
    const dz = s.z - z;
    if (Math.abs(dz) > 42) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      bestTx = s.tx;
      bestTz = s.tz;
    }
  }

  if (minDistSq < 400 && z < 495) {
    // Fast downhill whitewater rapids current (up to 7.2 m/s along river tangent)
    const strength = THREE.MathUtils.lerp(7.2, 1.8, THREE.MathUtils.clamp((z + 320) / 805, 0, 1));
    outVec.set(bestTx * strength, 0, bestTz * strength);
  } else {
    // Gentle lake breeze drift
    outVec.set(-0.4, 0, 0.8);
  }
  return outVec;
}

const SURFACE_MAP: SurfaceType[] = ['GRASS', 'ASPHALT', 'DIRT', 'ROCK', 'SAND', 'WATER'];

export interface TerrainSample {
  height: number;
  surface: SurfaceType;
  waterDepth: number;
}

const _sampleResult: TerrainSample = {
  height: 0,
  surface: 'GRASS',
  waterDepth: 0,
};

/**
 * Zero-allocation O(1) terrain query for useFrame physics.
 * Uses smooth Bilinear Interpolation so there are ZERO diagonal triangle crease bumps!
 */
export function sampleTerrain(x: number, z: number, outNormal: THREE.Vector3): TerrainSample {
  const gx = (x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X;
  const gz = (z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z;

  const ix = THREE.MathUtils.clamp(Math.floor(gx), 0, GRID_SEGMENTS_X - 1);
  const iz = THREE.MathUtils.clamp(Math.floor(gz), 0, GRID_SEGMENTS_Z - 1);
  const fx = THREE.MathUtils.clamp(gx - ix, 0, 1);
  const fz = THREE.MathUtils.clamp(gz - iz, 0, 1);

  const i00 = iz * COLS + ix;
  const i10 = i00 + 1;
  const i01 = i00 + COLS;
  const i11 = i01 + 1;

  const h00 = heightGrid[i00];
  const h10 = heightGrid[i10];
  const h01 = heightGrid[i01];
  const h11 = heightGrid[i11];

  const cellW = TERRAIN_WIDTH / GRID_SEGMENTS_X;
  const cellL = TERRAIN_LENGTH / GRID_SEGMENTS_Z;

  // Smooth Bilinear Interpolation of height and partial derivatives (dhdx, dhdz)
  const h0 = h00 + fx * (h10 - h00);
  const h1 = h01 + fx * (h11 - h01);
  const height = h0 + fz * (h1 - h0);

  const dhdx = ((1.0 - fz) * (h10 - h00) + fz * (h11 - h01)) / cellW;
  const dhdz = (h1 - h0) / cellL;

  outNormal.set(-dhdx, 1.0, -dhdz).normalize();

  // Nearest grid vertex for surface type
  const nearX = fx < 0.5 ? ix : ix + 1;
  const nearZ = fz < 0.5 ? iz : iz + 1;
  const sCode = surfaceGrid[nearZ * COLS + nearX] ?? 0;

  // In the Downhill Whitewater River (sCode === 5 at z < 485), waterDepth is 1.2m so Canoe/Kayak glides down the slope!
  const lakeDepth = Math.max(0, WATER_LEVEL - height);
  const waterDepth = sCode === 5 ? Math.max(1.2, lakeDepth) : lakeDepth;

  _sampleResult.height = height;
  _sampleResult.waterDepth = waterDepth;
  _sampleResult.surface = waterDepth > 0.25 ? 'WATER' : (SURFACE_MAP[sCode] ?? 'GRASS');

  return _sampleResult;
}

// ============================================================================
// WP 3.5: O(1) SPATIAL HASH OBSTACLE SYSTEM (TREES & ROCKS COLLISIONS)
// ============================================================================

export interface TreeObstacle {
  x: number;
  y: number;
  z: number;
  scale: number;
  scaleY: number;
  rotY: number;
  radius: number;
  variant: 'SPRUCE' | 'LARCH';
  colorShade: number; // 0..4 for rich Boreal green variation
}

export interface RockObstacle {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  radius: number;
}

export interface SpatialObstacle {
  x: number;
  z: number;
  radius: number;
  kind: 'TREE' | 'ROCK';
}

export const FOREST_TREES: TreeObstacle[] = [];
export const CANYON_ROCKS: RockObstacle[] = [];

const HASH_CELL_SIZE = 10.0;
const HASH_COLS = Math.ceil(TERRAIN_WIDTH / HASH_CELL_SIZE) + 2;
const HASH_ROWS = Math.ceil(TERRAIN_LENGTH / HASH_CELL_SIZE) + 2;
const spatialBuckets: SpatialObstacle[][] = Array.from(
  { length: HASH_COLS * HASH_ROWS },
  () => []
);

function getBucketIndex(x: number, z: number): number {
  const cx = THREE.MathUtils.clamp(
    Math.floor((x + TERRAIN_WIDTH * 0.5) / HASH_CELL_SIZE),
    0,
    HASH_COLS - 1
  );
  const cz = THREE.MathUtils.clamp(
    Math.floor((z + TERRAIN_LENGTH * 0.5) / HASH_CELL_SIZE),
    0,
    HASH_ROWS - 1
  );
  return cz * HASH_COLS + cx;
}

function initForestAndRockObstacles() {
  // 1. Deterministic Boreal Pines & Dense Forest Clusters (up to tree line at Y = 228m)
  for (let i = 0; i < 3100; i++) {
    const rx = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
    const rz = ((Math.sin(i * 311.7) * 43758.5453) % 1 + 1) % 1;
    const x = (rx - 0.5) * (TERRAIN_WIDTH - 24);
    const z = (rz - 0.5) * (TERRAIN_LENGTH - 36);

    // Clear Lakeside Camp (Z=+470) & Summit Firewatch Tower (Z=-775) zones
    if (Math.hypot(x - -10, z - 470) < 15) continue;
    if (Math.hypot(x - 0, z - -775) < 18) continue;

    // Organic Forest Cluster Density: creates deep, dense woodland groves alternating with open glades!
    const clusterVal = fbm2D(x * 0.012 + 4.5, z * 0.012 - 8.2, 3, 2.0, 0.5);
    const keepProb = THREE.MathUtils.clamp(0.58 + clusterVal * 0.85, 0.14, 0.98);
    const roll = ((Math.sin(i * 743.9 + 19) * 43758.5453) % 1 + 1) % 1;
    if (roll > keepProb) continue;

    const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
    const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
    const sCode = surfaceGrid[gz * COLS + gx];
    const y = getTerrainHeightOnly(x, z);

    if (sCode === 0 && y > WATER_LEVEL + 1.5 && y < 228) {
      // Strictly keep trees clear of road, singletrack & river corridors
      if (findClosestSplineSample(asphaltSamples, x, z, 32).distSq < 6.8 * 6.8) continue;
      if (findClosestSplineSample(dirtSamples, x, z, 32).distSq < 4.5 * 4.5) continue;
      if (findClosestSplineSample(riverSamples, x, z, 32).distSq < 7.8 * 7.8) continue;

      // Trees in dense grove hearts grow slightly taller!
      const groveBoost = clusterVal > 0.15 ? 1.16 : 0.95;
      const scale = (0.82 + ((i * 17) % 15) * 0.11) * groveBoost;
      const scaleY = scale * (1.04 + (i % 5) * 0.11);
      const rotY = (i * 1.3) % (Math.PI * 2);
      const radius = 0.42 * scale;
      // ~20% Golden Autumn Larch / Birch trees clustered naturally via low-frequency noise
      const larchNoise = simplex2D(x * 0.018 + 7, z * 0.018 - 13);
      const variant: 'SPRUCE' | 'LARCH' = larchNoise > 0.42 || i % 7 === 0 ? 'LARCH' : 'SPRUCE';

      // Spatial + per-tree green shade (0..4) for rich Boreal foliage color diversity
      const greenNoise = simplex2D(x * 0.024 - 11, z * 0.024 + 5);
      const colorShade = Math.abs(Math.floor((greenNoise + 1.0) * 2.5 + (i % 3))) % 5;

      FOREST_TREES.push({ x, y, z, scale, scaleY, rotY, radius, variant, colorShade });
      spatialBuckets[getBucketIndex(x, z)].push({ x, z, radius, kind: 'TREE' });
    }
  }

  // 2. Deterministic Granite & Red Bull Rampage Boulders
  for (let i = 0; i < 820; i++) {
    const rx = ((Math.sin(i * 517.3 + 9) * 43758.5453) % 1 + 1) % 1;
    const rz = ((Math.sin(i * 811.1 + 3) * 43758.5453) % 1 + 1) % 1;
    const x = (rx - 0.5) * (TERRAIN_WIDTH - 24);
    const z = (rz - 0.5) * (TERRAIN_LENGTH - 36);

    if (Math.hypot(x - -10, z - 470) < 13) continue;
    if (Math.hypot(x - 0, z - -775) < 16) continue;

    const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
    const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
    const sCode = surfaceGrid[gz * COLS + gx];
    const y = getTerrainHeightOnly(x, z);

    if ((sCode === 0 || sCode === 3 || sCode === 4) && y > WATER_LEVEL + 0.25) {
      // Strictly keep boulders off the asphalt road, dirt singletrack & whitewater river!
      if (findClosestSplineSample(asphaltSamples, x, z, 32).distSq < 7.2 * 7.2) continue;
      if (findClosestSplineSample(dirtSamples, x, z, 32).distSq < 5.2 * 5.2) continue;
      if (findClosestSplineSample(riverSamples, x, z, 32).distSq < 8.2 * 8.2) continue;

      // Larger, craggier rock outcrops in the upper Red Bull Rampage zone (y > 190m)
      const rampageScale = y > 190 ? 1.45 : 1.0;
      const sx = (0.6 + ((i * 13) % 9) * 0.18) * rampageScale;
      const sy = sx * (0.65 + ((i * 7) % 5) * 0.14);
      const sz = sx * 0.9;
      const radius = sx * 0.72;

      CANYON_ROCKS.push({
        x,
        y: y + sy * 0.25,
        z,
        sx,
        sy,
        sz,
        rx: (i * 0.4) % 1,
        ry: (i * 1.9) % 6,
        rz: (i * 0.3) % 1,
        radius,
      });
      spatialBuckets[getBucketIndex(x, z)].push({ x, z, radius, kind: 'ROCK' });
    }
  }
}
initForestAndRockObstacles();

export interface ObstacleHitResult {
  hit: boolean;
  pushX: number;
  pushZ: number;
  normalX: number;
  normalZ: number;
  kind: 'TREE' | 'ROCK';
}

const _hitResult: ObstacleHitResult = {
  hit: false,
  pushX: 0,
  pushZ: 0,
  normalX: 0,
  normalZ: 1,
  kind: 'TREE',
};

/**
 * O(1) Zero-Allocation 3x3 Neighborhood Spatial Hash Collision Query for useFrame.
 */
export function queryObstacleCollision(
  x: number,
  z: number,
  playerRadius: number
): ObstacleHitResult {
  _hitResult.hit = false;
  _hitResult.pushX = 0;
  _hitResult.pushZ = 0;

  const baseCx = Math.floor((x + TERRAIN_WIDTH * 0.5) / HASH_CELL_SIZE);
  const baseCz = Math.floor((z + TERRAIN_LENGTH * 0.5) / HASH_CELL_SIZE);

  for (let dz = -1; dz <= 1; dz++) {
    const cz = baseCz + dz;
    if (cz < 0 || cz >= HASH_ROWS) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const cx = baseCx + dx;
      if (cx < 0 || cx >= HASH_COLS) continue;
      const bucket = spatialBuckets[cz * HASH_COLS + cx];
      for (let i = 0; i < bucket.length; i++) {
        const obs = bucket[i];
        const ox = x - obs.x;
        const oz = z - obs.z;
        const minDist = playerRadius + obs.radius;
        const dSq = ox * ox + oz * oz;
        if (dSq < minDist * minDist && dSq > 0.00001) {
          const dist = Math.sqrt(dSq);
          const nx = ox / dist;
          const nz = oz / dist;
          const penetration = minDist - dist;
          _hitResult.hit = true;
          _hitResult.pushX += nx * penetration;
          _hitResult.pushZ += nz * penetration;
          _hitResult.normalX = nx;
          _hitResult.normalZ = nz;
          _hitResult.kind = obs.kind;
        }
      }
    }
  }

  return _hitResult;
}

/**
 * Evaluates soft Ground Ambient Occlusion (0.0 to 1.0) under trees and boulders
 * using the O(1) spatial hash so terrain vertex colors have grounded contact shadows!
 */
export function computeCanopyAmbientOcclusion(x: number, z: number): number {
  const baseCx = Math.floor((x + TERRAIN_WIDTH * 0.5) / HASH_CELL_SIZE);
  const baseCz = Math.floor((z + TERRAIN_LENGTH * 0.5) / HASH_CELL_SIZE);
  let ao = 0;

  for (let dz = -1; dz <= 1; dz++) {
    const cz = baseCz + dz;
    if (cz < 0 || cz >= HASH_ROWS) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const cx = baseCx + dx;
      if (cx < 0 || cx >= HASH_COLS) continue;
      const bucket = spatialBuckets[cz * HASH_COLS + cx];
      for (let i = 0; i < bucket.length; i++) {
        const obs = bucket[i];
        const ox = x - obs.x;
        const oz = z - obs.z;
        const dSq = ox * ox + oz * oz;
        const aoRadius = obs.kind === 'TREE' ? obs.radius * 6.2 : obs.radius * 2.8;
        if (dSq < aoRadius * aoRadius) {
          const falloff = 1.0 - Math.sqrt(dSq) / aoRadius;
          ao = Math.max(ao, falloff * (obs.kind === 'TREE' ? 0.34 : 0.25));
        }
      }
    }
  }
  return ao;
}

/**
 * Fast zero-allocation upstream checkpoint locator for Lonely Mountains [R] instant rewind.
 * Samples ~38m uphill along the active trajectory and outputs downhill position & tangent.
 */
export function getUpstreamCheckpoint(
  x: number,
  z: number,
  mode: MovementMode,
  outPos: THREE.Vector3,
  outTangent: THREE.Vector3
): { yaw: number; speed: number } {
  let curve: THREE.CatmullRomCurve3;
  let samples: SampledSplinePoint[];

  if (mode === 'CANOE' && z > -330) {
    curve = riverCurve;
    samples = riverSamples;
  } else if (mode === 'BIKE') {
    curve = dirtCurve;
    samples = dirtSamples;
  } else {
    const roadHit = findClosestSplineSample(asphaltSamples, x, z, 48);
    const dirtHit = findClosestSplineSample(dirtSamples, x, z, 42);
    if (dirtHit.distSq < roadHit.distSq * 0.7) {
      curve = dirtCurve;
      samples = dirtSamples;
    } else {
      curve = asphaltCurve;
      samples = asphaltSamples;
    }
  }

  const hit = findClosestSplineSample(samples, x, z, 140);
  const curT = hit.sample ? hit.sample.t : THREE.MathUtils.clamp((z + 765) / 1245, 0, 1);

  // Offset ~38m upstream along track (dt ~= 38 / 1250 ~= 0.030)
  const targetT = THREE.MathUtils.clamp(curT - 0.030, 0.008, 0.992);

  curve.getPoint(targetT, outPos);
  curve.getTangent(targetT, outTangent);
  outTangent.normalize();

  outPos.y = getTerrainHeightOnly(outPos.x, outPos.z) + 0.35;
  const yaw = Math.atan2(outTangent.x, outTangent.z);
  const speed = 7.0; // 25 km/h instant roll-in momentum

  return { yaw, speed };
}
