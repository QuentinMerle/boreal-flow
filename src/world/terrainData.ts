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

// 3. Whitewater River Canyon Spline (Starts at Mid-Mountain Z=-135 and winds into Mirror Lake at Z=+260)
export const RIVER_SPLINE_POINTS = [
  new THREE.Vector3(68, 0, -138),
  new THREE.Vector3(84, 0, -70),
  new THREE.Vector3(54, 0, 10),
  new THREE.Vector3(78, 0, 90),
  new THREE.Vector3(44, 0, 175),
  new THREE.Vector3(22, 0, 255),
  new THREE.Vector3(4, 0, 330),
];

export const asphaltCurve = new THREE.CatmullRomCurve3(ASPHALT_SPLINE_POINTS, false, 'catmullrom', 0.5);
export const dirtCurve = new THREE.CatmullRomCurve3(DIRT_SPLINE_POINTS, false, 'catmullrom', 0.5);
export const riverCurve = new THREE.CatmullRomCurve3(RIVER_SPLINE_POINTS, false, 'catmullrom', 0.5);

interface SampledSplinePoint {
  x: number;
  z: number;
  baseElevation: number;
  tx: number;
  tz: number;
}

const SAMPLE_COUNT = 800;
const asphaltSamples: SampledSplinePoint[] = [];
const dirtSamples: SampledSplinePoint[] = [];
const riverSamples: SampledSplinePoint[] = [];

// Asymmetric Jump Kicker profile along the VTT Singletrack
const KICKER_T_POSITIONS = [0.26, 0.48, 0.71, 0.89];

function evaluateKickerBoost(t: number): number {
  let boost = 0;
  for (let i = 0; i < KICKER_T_POSITIONS.length; i++) {
    const kt = KICKER_T_POSITIONS[i];
    const diff = t - kt;
    // Smooth 14m approach ramp up (+1.65m peak), steep lip on exit for crisp airborne launch!
    if (diff > -0.024 && diff <= 0.003) {
      const u = (diff + 0.024) / 0.024; // 0 to 1
      boost += Math.pow(Math.sin(u * Math.PI * 0.5), 1.6) * 1.65;
    } else if (diff > 0.003 && diff < 0.009) {
      const u = 1.0 - (diff - 0.003) / 0.006;
      boost += u * u * 1.65;
    }
  }
  return boost;
}

// Base mountain profile before spline carving (1,000m canyon from Z=-500 to Z=+500)
function computeRawMountainElevation(x: number, z: number): number {
  // Normalized progression from Summit (t=0 at Z=-465) to Mirror Lake Shore (t=1 at Z=+250)
  const slopeT = THREE.MathUtils.clamp((z + 465) / 715, 0, 1.35);

  // Smooth S-curve mountain drop: 124m at summit down to 0m at Z=+250
  let baseHeight = 0;
  if (slopeT <= 1.0) {
    const smooth = 1.0 - slopeT;
    baseHeight = 124.0 * Math.pow(smooth, 1.36);
  } else {
    // Mirror Lake basin (Z > 250 dips smoothly underwater to -7.5m)
    const waterT = THREE.MathUtils.clamp((z - 250) / 180, 0, 1);
    baseHeight = -7.5 * Math.sin(waterT * Math.PI * 0.5);
  }

  // Dramatic Canadian canyon walls on far left/right flanks
  const edgeDist = Math.max(0, Math.abs(x) - 88);
  const canyonWall =
    Math.pow(edgeDist / 48, 1.85) * 22.0 * THREE.MathUtils.clamp(1.2 - slopeT * 0.82, 0.25, 1.0);

  // Multi-octave Simplex noise for natural rocky ridges and undulations
  const macroNoise = fbm2D(x * 0.009, z * 0.009, 4, 2.0, 0.5) * 11.5;
  const ridgeNoise = Math.abs(simplex2D(x * 0.022 + 10, z * 0.022 - 5)) * 4.8;

  // Fade out rough terrain noise near the flat shore & lake basin
  const noiseMask = THREE.MathUtils.smoothstep(265 - z, 0, 95);

  return baseHeight + canyonWall + (macroNoise + ridgeNoise) * noiseMask;
}

// Pre-sample all 3 splines so terrain generation and O(1) queries remain fast
function initSplineSamples() {
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;

    // 1. Asphalt Road
    asphaltCurve.getPoint(t, tmp);
    asphaltCurve.getTangent(t, tan);
    const roadSlopeT = THREE.MathUtils.clamp((tmp.z + 465) / 718, 0, 1);
    const roadElev = 124.0 * Math.pow(1.0 - roadSlopeT, 1.35) + 1.25;
    asphaltSamples.push({ x: tmp.x, z: tmp.z, baseElevation: roadElev, tx: tan.x, tz: tan.z });

    // 2. Dirt Singletrack + Rollers + Jump Kickers
    dirtCurve.getPoint(t, tmp);
    dirtCurve.getTangent(t, tan);
    const dirtSlopeT = THREE.MathUtils.clamp((tmp.z + 465) / 718, 0, 1);
    const rollers = Math.sin(t * Math.PI * 46) * 0.55 * Math.sin(t * Math.PI);
    const kicker = evaluateKickerBoost(t);
    const dirtElev = 124.0 * Math.pow(1.0 - dirtSlopeT, 1.35) + 1.15 + rollers + kicker;
    dirtSamples.push({ x: tmp.x, z: tmp.z, baseElevation: dirtElev, tx: tan.x, tz: tan.z });

    // 3. River Canyon (Carved below WATER_LEVEL = 0)
    riverCurve.getPoint(t, tmp);
    riverCurve.getTangent(t, tan);
    riverSamples.push({ x: tmp.x, z: tmp.z, baseElevation: WATER_LEVEL - 2.8, tx: tan.x, tz: tan.z });
  }
}
initSplineSamples();

// Precomputed regular grid for O(1) physics lookups and mesh generation
const COLS = GRID_SEGMENTS_X + 1;
const ROWS = GRID_SEGMENTS_Z + 1;
export const heightGrid = new Float32Array(COLS * ROWS);
export const surfaceGrid = new Uint8Array(COLS * ROWS);
// Surface codes: 0 = GRASS, 1 = ASPHALT, 2 = DIRT, 3 = ROCK, 4 = SAND, 5 = WATER

function evaluatePoint(x: number, z: number): {
  height: number;
  surfaceCode: number;
  roadBlend: number;
  dirtBlend: number;
} {
  let rawH = computeRawMountainElevation(x, z);

  // 1. Find closest distance to Asphalt Road spline
  let minRoadDistSq = Infinity;
  let closestRoadElev = rawH;
  for (let i = 0; i < asphaltSamples.length; i++) {
    const s = asphaltSamples[i];
    const dz = s.z - z;
    if (Math.abs(dz) > 34) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minRoadDistSq) {
      minRoadDistSq = dSq;
      closestRoadElev = s.baseElevation;
    }
  }

  // 2. Find closest distance to Dirt Trail spline
  let minDirtDistSq = Infinity;
  let closestDirtElev = rawH;
  for (let i = 0; i < dirtSamples.length; i++) {
    const s = dirtSamples[i];
    const dz = s.z - z;
    if (Math.abs(dz) > 28) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDirtDistSq) {
      minDirtDistSq = dSq;
      closestDirtElev = s.baseElevation;
    }
  }

  // 3. Find closest distance to Whitewater River Canyon spline
  let minRiverDistSq = Infinity;
  for (let i = 0; i < riverSamples.length; i++) {
    const s = riverSamples[i];
    const dz = s.z - z;
    if (Math.abs(dz) > 36) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minRiverDistSq) {
      minRiverDistSq = dSq;
    }
  }

  const roadDist = Math.sqrt(minRoadDistSq);
  const dirtDist = Math.sqrt(minDirtDistSq);
  const riverDist = Math.sqrt(minRiverDistSq);

  // Carve the Whitewater River Canyon into the eastern mountain flank (Z > -148)
  if (z > -150 && riverDist < 26.0) {
    const canyonBlend = 1.0 - THREE.MathUtils.smoothstep(riverDist, 7.5, 26.0);
    const channelDepth =
      riverDist < 8.5 ? WATER_LEVEL - 2.6 * Math.cos((riverDist / 8.5) * Math.PI * 0.42) : WATER_LEVEL + 0.6;
    rawH = THREE.MathUtils.lerp(rawH, channelDepth, canyonBlend);
  }

  // Dirt trail carving profile: 2.8m half-width core, 7.5m shoulder
  const dirtFlatten = 1.0 - THREE.MathUtils.smoothstep(dirtDist, 2.6, 7.8);
  const dirtCarve = dirtDist < 2.8 ? -0.18 * Math.cos((dirtDist / 2.8) * Math.PI * 0.5) : 0;
  rawH = THREE.MathUtils.lerp(rawH, closestDirtElev + dirtCarve, dirtFlatten);

  // Road flattening profile: 5.2m half-width core, 12.5m smooth embankment shoulder
  const roadFlatten = 1.0 - THREE.MathUtils.smoothstep(roadDist, 4.8, 12.5);
  rawH = THREE.MathUtils.lerp(rawH, closestRoadElev, roadFlatten);

  // Determine dominant surface code
  let surfaceCode = 0; // GRASS
  if (rawH < WATER_LEVEL + 0.15) {
    surfaceCode = 5; // WATER
  } else if (roadDist < 4.6 && z < 252) {
    surfaceCode = 1; // ASPHALT
  } else if (dirtDist < 2.75 && z < 250) {
    surfaceCode = 2; // DIRT
  } else if (rawH < WATER_LEVEL + 1.85 && (z > 210 || riverDist < 12.5)) {
    surfaceCode = 4; // SAND / SHORE / RIVER BANK
  } else if (rawH > 88 || Math.abs(x) > 95 || (riverDist >= 8.5 && riverDist < 19.0 && z > -140 && z < 220)) {
    surfaceCode = 3; // ROCK / CANYON WALLS
  }

  return {
    height: rawH,
    surfaceCode,
    roadBlend: roadDist < 5.2 ? 1 : 0,
    dirtBlend: dirtDist < 3.0 ? 1 : 0,
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

  // Exact triangle interpolation matching Three.js PlaneGeometry diagonal split
  if (fx + fz <= 1.0) {
    return h00 + fx * (h10 - h00) + fz * (h01 - h00);
  } else {
    return h11 + (1.0 - fx) * (h01 - h11) + (1.0 - fz) * (h10 - h11);
  }
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
 * Evaluates directional river current vector at (x, z) for Canoe canyon gliding.
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
    // Fast canyon current (up to 4.2 m/s along river tangent)
    const strength = THREE.MathUtils.lerp(4.2, 1.4, THREE.MathUtils.clamp((z + 135) / 400, 0, 1));
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
 * Populates `outNormal` with the exact surface normal at (x, z).
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

  let height = 0;
  let dhdx = 0;
  let dhdz = 0;

  if (fx + fz <= 1.0) {
    height = h00 + fx * (h10 - h00) + fz * (h01 - h00);
    dhdx = (h10 - h00) / cellW;
    dhdz = (h01 - h00) / cellL;
  } else {
    height = h11 + (1.0 - fx) * (h01 - h11) + (1.0 - fz) * (h10 - h11);
    dhdx = (h11 - h01) / cellW;
    dhdz = (h11 - h10) / cellL;
  }

  outNormal.set(-dhdx, 1.0, -dhdz).normalize();

  // Nearest grid vertex for surface type
  const nearX = fx < 0.5 ? ix : ix + 1;
  const nearZ = fz < 0.5 ? iz : iz + 1;
  const sCode = surfaceGrid[nearZ * COLS + nearX] ?? 0;

  const waterDepth = Math.max(0, WATER_LEVEL - height);
  _sampleResult.height = height;
  _sampleResult.waterDepth = waterDepth;
  _sampleResult.surface = waterDepth > 0.25 ? 'WATER' : (SURFACE_MAP[sCode] ?? 'GRASS');

  return _sampleResult;
}
