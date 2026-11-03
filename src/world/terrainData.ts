import * as THREE from 'three';
import { fbm2D, simplex2D } from '../math/noise';
import { SurfaceType } from '../state/gameStore';

// Session 2 Upgrade: 1,000m Boreal Canyon Sandbox (400m x 1,000m)
export const TERRAIN_WIDTH = 400; // X: -200 to +200
export const TERRAIN_LENGTH = 1000; // Z: -500 to +500
export const GRID_SEGMENTS_X = 220; // ~1.81m per cell (smooth indexed mesh)
export const GRID_SEGMENTS_Z = 480; // ~2.08m per cell
export const WATER_LEVEL = 0.0;

// 1. Scenic Asphalt Road Spline (Sweeping S-curves & hairpins from Z=-460 summit to Z=+252 lake camp)
export const ASPHALT_SPLINE_POINTS = [
  new THREE.Vector3(-10, 0, -462),
  new THREE.Vector3(-13, 0, -420),
  new THREE.Vector3(-64, 0, -340),
  new THREE.Vector3(42, 0, -250),
  new THREE.Vector3(-72, 0, -150),
  new THREE.Vector3(38, 0, -50),
  new THREE.Vector3(-62, 0, 50),
  new THREE.Vector3(24, 0, 140),
  new THREE.Vector3(-30, 0, 205),
  new THREE.Vector3(-15, 0, 250),
];

// 2. Dirt Singletrack VTT Trail Spline (Cuts across road hairpins through forest with natural jump kickers)
export const DIRT_SPLINE_POINTS = [
  new THREE.Vector3(16, 0, -462),
  new THREE.Vector3(36, 0, -405),
  new THREE.Vector3(68, 0, -320),
  new THREE.Vector3(-22, 0, -235),
  new THREE.Vector3(-48, 0, -160),
  new THREE.Vector3(18, 0, -85),
  new THREE.Vector3(54, 0, -10),
  new THREE.Vector3(-18, 0, 75),
  new THREE.Vector3(36, 0, 165),
  new THREE.Vector3(14, 0, 245),
];

// 3. Downhill Whitewater Kayak/Canoe River Spline (Starts high at Z=-280, Y=120m and rushes down to Mirror Lake at Z=+255)
export const RIVER_SPLINE_POINTS = [
  new THREE.Vector3(54, 0, -280),
  new THREE.Vector3(78, 0, -195),
  new THREE.Vector3(52, 0, -105),
  new THREE.Vector3(82, 0, -15),
  new THREE.Vector3(56, 0, 75),
  new THREE.Vector3(74, 0, 165),
  new THREE.Vector3(24, 0, 252),
  new THREE.Vector3(4, 0, 325),
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

const SAMPLE_COUNT = 900;
const asphaltSamples: SampledSplinePoint[] = [];
const dirtSamples: SampledSplinePoint[] = [];
const riverSamples: SampledSplinePoint[] = [];

// Pure C-2 analytical jump kickers along the VTT Singletrack (evaluated directly at world Z, zero discrete steps!)
const KICKER_Z_CENTERS = [-290, -135, 25, 165];

function evaluateAnalyticalDirtKicker(z: number): number {
  let boost = 0;
  for (let i = 0; i < KICKER_Z_CENTERS.length; i++) {
    const kz = KICKER_Z_CENTERS[i];
    const dz = z - kz;
    // Smooth 22m approach ramp (-18m to +4m) with a 0.95m crest
    if (dz > -18.0 && dz <= 0.0) {
      const u = (dz + 18.0) / 18.0; // 0 to 1
      const s = u * u * (3 - 2 * u);
      boost += s * 0.95;
    } else if (dz > 0.0 && dz < 7.5) {
      const u = 1.0 - dz / 7.5;
      const s = u * u * (3 - 2 * u);
      boost += s * 0.95;
    }
  }
  return boost;
}

/**
 * Pure C-infinity analytical mountain slope elevation at any Z coordinate.
 * Using this directly at (z) eliminates all discrete spline-sample staircase bumps on the road!
 */
export function computeSmoothSlopeElevation(z: number): number {
  const slopeT = THREE.MathUtils.clamp((z + 465) / 715, 0, 1.35);
  if (slopeT <= 1.0) {
    const smooth = 1.0 - slopeT;
    return 210.0 * Math.pow(smooth, 1.38);
  } else {
    const waterT = THREE.MathUtils.clamp((z - 250) / 180, 0, 1);
    return -7.5 * Math.sin(waterT * Math.PI * 0.5);
  }
}

// Base mountain profile before spline carving (1,000m canyon from Z=-500 to Z=+500)
function computeRawMountainElevation(x: number, z: number): number {
  const slopeT = THREE.MathUtils.clamp((z + 465) / 715, 0, 1.35);
  const baseHeight = computeSmoothSlopeElevation(z);

  // Dramatic Canadian canyon walls on far left/right flanks
  const edgeDist = Math.max(0, Math.abs(x) - 88);
  const canyonWall =
    Math.pow(edgeDist / 48, 1.85) * 28.0 * THREE.MathUtils.clamp(1.2 - slopeT * 0.82, 0.25, 1.0);

  // Multi-octave Simplex noise for natural rocky ridges and undulations
  const macroNoise = fbm2D(x * 0.009, z * 0.009, 4, 2.0, 0.5) * 11.5;
  const ridgeNoise = Math.abs(simplex2D(x * 0.022 + 10, z * 0.022 - 5)) * 4.8;

  // Fade out rough terrain noise near the flat shore & lake basin
  const noiseMask = THREE.MathUtils.smoothstep(265 - z, 0, 95);

  // Curved southern shoreline & wooded ridge enclosing Mirror Lake inside an oval alpine basin (no straight map-edge cut at Z=+500!)
  const southArchZ = 432 - (x * x) * 0.0022 + simplex2D(x * 0.014, 7.3) * 16.0;
  const southShoreT = THREE.MathUtils.smoothstep(z, southArchZ - 28, 496);
  const southRidgeNoise = Math.abs(simplex2D(x * 0.018 + 4.2, z * 0.018)) * 14.0;
  const southShoreRise = Math.pow(southShoreT, 1.45) * (34.0 + southRidgeNoise);

  return baseHeight + canyonWall + southShoreRise + (macroNoise + ridgeNoise) * noiseMask;
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

  const roadHit = findClosestSplineSample(asphaltSamples, x, z, 40);
  const dirtHit = findClosestSplineSample(dirtSamples, x, z, 34);
  const riverHit = findClosestSplineSample(riverSamples, x, z, 42);

  const roadDist = Math.sqrt(roadHit.distSq);
  const dirtDist = Math.sqrt(dirtHit.distSq);
  const riverDist = Math.sqrt(riverHit.distSq);

  // Carve the Downhill Mountain Whitewater River Channel (from Z = -282 down to Mirror Lake at Z = +252)
  const inRiverZone = z > -282 && z < 260 && riverDist < 22.0;
  if (inRiverZone) {
    const canyonBlend = 1.0 - THREE.MathUtils.smoothstep(riverDist, 7.5, 22.0);
    // River bed follows the downhill mountain slope (-1.35m trough in center, +1.8m rocky banks)
    const riverBedH =
      riverDist < 7.5
        ? smoothSlopeH - 1.35 * Math.cos((riverDist / 7.5) * Math.PI * 0.4)
        : smoothSlopeH + 1.8;
    rawH = THREE.MathUtils.lerp(rawH, riverBedH, canyonBlend);
  }

  // Dirt trail carving profile: wide 6.0m flat shelf + pure analytical kicker in Z
  // (Guarantees all 4 corners of any bilinear grid cell under the bike are 100% free of mountain noise!)
  const dirtTargetElev = smoothSlopeH + 1.15 + evaluateAnalyticalDirtKicker(z);
  const dirtFlatten = 1.0 - THREE.MathUtils.smoothstep(dirtDist, 6.0, 13.0);
  rawH = THREE.MathUtils.lerp(rawH, dirtTargetElev, dirtFlatten);

  // Road flattening profile: wide 8.2m flat shelf + pure analytical smoothSlopeH + 1.25
  // (Guarantees all 4 corners of any bilinear grid cell on the road are 100% glass-smooth!)
  const roadTargetElev = smoothSlopeH + 1.25;
  const roadFlatten = 1.0 - THREE.MathUtils.smoothstep(roadDist, 8.2, 16.5);
  rawH = THREE.MathUtils.lerp(rawH, roadTargetElev, roadFlatten);

  // Determine dominant surface code
  let surfaceCode = 0; // GRASS
  if (rawH < WATER_LEVEL + 0.15 || (z > -278 && z < 255 && riverDist < 5.8)) {
    surfaceCode = 5; // WATER (Lake OR Downhill Mountain River Rapids!)
  } else if (roadDist < 4.6 && z < 252) {
    surfaceCode = 1; // ASPHALT
  } else if (dirtDist < 2.75 && z < 250) {
    surfaceCode = 2; // DIRT
  } else if ((rawH < WATER_LEVEL + 1.85 && z > 210) || (z > -278 && z < 255 && riverDist < 9.2)) {
    surfaceCode = 4; // SAND / SHORE / RIVER BANK
  } else if (rawH > 135 || Math.abs(x) > 95 || (riverDist >= 9.2 && riverDist < 17.5 && z > -275 && z < 220)) {
    surfaceCode = 3; // ROCK / CANYON WALLS
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

  // 3 Fallen Logs across the Asphalt Road
  const roadLogT = [0.22, 0.53, 0.81];
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

  // 3 Fallen Logs across the Dirt Singletrack
  const dirtLogT = [0.18, 0.41, 0.65];
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
    if (Math.abs(dz) > 35) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      bestTx = s.tx;
      bestTz = s.tz;
    }
  }

  if (minDistSq < 400 && z < 265) {
    // Fast downhill whitewater rapids current (up to 6.8 m/s along river tangent)
    const strength = THREE.MathUtils.lerp(6.8, 1.8, THREE.MathUtils.clamp((z + 280) / 535, 0, 1));
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

  // In the Downhill Whitewater River (sCode === 5 at z < 252), waterDepth is 1.2m so Canoe/Kayak glides down the slope!
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
  // 1. Deterministic Boreal Pines (up to sub-alpine tree line at Y = 172m)
  for (let i = 0; i < 1450; i++) {
    const rx = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
    const rz = ((Math.sin(i * 311.7) * 43758.5453) % 1 + 1) % 1;
    const x = (rx - 0.5) * (TERRAIN_WIDTH - 24);
    const z = (rz - 0.5) * (TERRAIN_LENGTH - 30);

    // Clear Lakeside Camp & Summit Firewatch Tower zones
    if (Math.hypot(x - -10, z - 240) < 14) continue;
    if (Math.hypot(x - 0, z - -475) < 17) continue;

    const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
    const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
    const sCode = surfaceGrid[gz * COLS + gx];
    const y = getTerrainHeightOnly(x, z);

    if (sCode === 0 && y > WATER_LEVEL + 1.5 && y < 172) {
      // Strictly keep trees clear of road, singletrack & river corridors
      if (findClosestSplineSample(asphaltSamples, x, z, 25).distSq < 6.8 * 6.8) continue;
      if (findClosestSplineSample(dirtSamples, x, z, 25).distSq < 4.5 * 4.5) continue;
      if (findClosestSplineSample(riverSamples, x, z, 25).distSq < 7.8 * 7.8) continue;

      const scale = 0.85 + ((i * 17) % 14) * 0.11;
      const scaleY = scale * (1.05 + (i % 5) * 0.1);
      const rotY = (i * 1.3) % (Math.PI * 2);
      const radius = 0.42 * scale;
      // ~20% Golden Autumn Larch / Birch trees clustered naturally via low-frequency noise
      const larchNoise = simplex2D(x * 0.018 + 7, z * 0.018 - 13);
      const variant: 'SPRUCE' | 'LARCH' = larchNoise > 0.42 || i % 7 === 0 ? 'LARCH' : 'SPRUCE';

      FOREST_TREES.push({ x, y, z, scale, scaleY, rotY, radius, variant });
      spatialBuckets[getBucketIndex(x, z)].push({ x, z, radius, kind: 'TREE' });
    }
  }

  // 2. Deterministic Granite Boulders
  for (let i = 0; i < 520; i++) {
    const rx = ((Math.sin(i * 517.3 + 9) * 43758.5453) % 1 + 1) % 1;
    const rz = ((Math.sin(i * 811.1 + 3) * 43758.5453) % 1 + 1) % 1;
    const x = (rx - 0.5) * (TERRAIN_WIDTH - 24);
    const z = (rz - 0.5) * (TERRAIN_LENGTH - 30);

    if (Math.hypot(x - -10, z - 240) < 12) continue;
    if (Math.hypot(x - 0, z - -475) < 15) continue;

    const gx = Math.round((x / TERRAIN_WIDTH + 0.5) * GRID_SEGMENTS_X);
    const gz = Math.round((z / TERRAIN_LENGTH + 0.5) * GRID_SEGMENTS_Z);
    const sCode = surfaceGrid[gz * COLS + gx];
    const y = getTerrainHeightOnly(x, z);

    if ((sCode === 0 || sCode === 3 || sCode === 4) && y > WATER_LEVEL + 0.25) {
      // Strictly keep boulders off the asphalt road, dirt singletrack & whitewater river!
      if (findClosestSplineSample(asphaltSamples, x, z, 25).distSq < 7.2 * 7.2) continue;
      if (findClosestSplineSample(dirtSamples, x, z, 25).distSq < 5.2 * 5.2) continue;
      if (findClosestSplineSample(riverSamples, x, z, 25).distSq < 8.2 * 8.2) continue;

      const sx = 0.6 + ((i * 13) % 9) * 0.18;
      const sy = sx * (0.6 + ((i * 7) % 5) * 0.12);
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
