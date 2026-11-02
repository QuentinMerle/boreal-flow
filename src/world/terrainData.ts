import * as THREE from 'three';
import { fbm2D, simplex2D } from '../math/noise';
import { SurfaceType } from '../state/gameStore';

// 500m Slope Sandbox dimensions
export const TERRAIN_WIDTH = 340; // X: -170 to +170
export const TERRAIN_LENGTH = 500; // Z: -250 to +250
export const GRID_SEGMENTS_X = 170; // 2m per cell
export const GRID_SEGMENTS_Z = 250; // 2m per cell
export const WATER_LEVEL = 0.0;

// 1. Scenic Asphalt Road Spline (Sweeping S-curves & hairpins from summit to western shore)
export const ASPHALT_SPLINE_POINTS = [
  new THREE.Vector3(-8, 0, -230),
  new THREE.Vector3(-12, 0, -195),
  new THREE.Vector3(-48, 0, -155),
  new THREE.Vector3(24, 0, -110),
  new THREE.Vector3(-56, 0, -55),
  new THREE.Vector3(18, 0, 0),
  new THREE.Vector3(-42, 0, 55),
  new THREE.Vector3(-24, 0, 102),
  new THREE.Vector3(-18, 0, 128),
];

// 2. Dirt Singletrack VTT Trail Spline (Technical berms, ridges & roots on eastern flank)
export const DIRT_SPLINE_POINTS = [
  new THREE.Vector3(8, 0, -230),
  new THREE.Vector3(25, 0, -190),
  new THREE.Vector3(58, 0, -145),
  new THREE.Vector3(20, 0, -95),
  new THREE.Vector3(64, 0, -40),
  new THREE.Vector3(28, 0, 15),
  new THREE.Vector3(52, 0, 65),
  new THREE.Vector3(32, 0, 108),
  new THREE.Vector3(26, 0, 134),
];

export const asphaltCurve = new THREE.CatmullRomCurve3(ASPHALT_SPLINE_POINTS, false, 'catmullrom', 0.5);
export const dirtCurve = new THREE.CatmullRomCurve3(DIRT_SPLINE_POINTS, false, 'catmullrom', 0.5);

interface SampledSplinePoint {
  x: number;
  z: number;
  baseElevation: number;
}

const SAMPLE_COUNT = 500;
const asphaltSamples: SampledSplinePoint[] = [];
const dirtSamples: SampledSplinePoint[] = [];

// Base mountain profile before spline carving (500m slope from Z=-250 to Z=+250)
function computeRawMountainElevation(x: number, z: number): number {
  // Normalized progression from top of slope (t=0 at Z=-230) to lake shore (t=1 at Z=+120)
  const slopeT = THREE.MathUtils.clamp((z + 230) / 350, 0, 1.35);

  // Smooth S-curve mountain drop: ~74m at summit down to 0m at Z=120
  let baseHeight = 0;
  if (slopeT <= 1.0) {
    const smooth = 1.0 - slopeT;
    baseHeight = 74.0 * Math.pow(smooth, 1.38);
  } else {
    // Lake basin (Z > 120 dips smoothly underwater to -6.5m)
    const waterT = THREE.MathUtils.clamp((z - 120) / 85, 0, 1);
    baseHeight = -6.8 * Math.sin(waterT * Math.PI * 0.5);
    // River channel entering from the northeast canyon
    const riverCenter = 55 + Math.sin(z * 0.03) * 18;
    const distToRiver = Math.abs(x - riverCenter);
    if (distToRiver < 22) {
      const riverFactor = Math.cos((distToRiver / 22) * Math.PI * 0.5);
      baseHeight -= 2.5 * riverFactor;
    }
  }

  // Valley walls on far left/right edges (crisp Canadian canyon framing)
  const edgeDist = Math.max(0, Math.abs(x) - 68);
  const canyonWall = Math.pow(edgeDist / 42, 1.85) * 16.0 * THREE.MathUtils.clamp(1.15 - slopeT * 0.85, 0.2, 1.0);

  // Multi-octave Simplex noise for natural rocky ridges and undulations
  const macroNoise = fbm2D(x * 0.011, z * 0.011, 4, 2.0, 0.5) * 9.5;
  const ridgeNoise = Math.abs(simplex2D(x * 0.025 + 10, z * 0.025 - 5)) * 4.2;

  // Fade out rough terrain noise near the flat shore & lake basin
  const noiseMask = THREE.MathUtils.smoothstep(135 - z, 0, 65);

  return baseHeight + canyonWall + (macroNoise + ridgeNoise) * noiseMask;
}

// Pre-sample both 3D splines so terrain creation and height queries are super fast
function initSplineSamples() {
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    asphaltCurve.getPoint(t, tmp);
    // Smooth elevation along the road spline (pure monotonic downhill grade)
    const roadSlopeT = THREE.MathUtils.clamp((tmp.z + 230) / 355, 0, 1);
    const roadElev = 74.0 * Math.pow(1.0 - roadSlopeT, 1.35) + 1.2;
    asphaltSamples.push({ x: tmp.x, z: tmp.z, baseElevation: roadElev });

    dirtCurve.getPoint(t, tmp);
    const dirtSlopeT = THREE.MathUtils.clamp((tmp.z + 230) / 360, 0, 1);
    // Add playful VTT rollers/bumps along the dirt trail
    const rollers = Math.sin(t * Math.PI * 28) * 0.65 * Math.sin(t * Math.PI);
    const dirtElev = 74.0 * Math.pow(1.0 - dirtSlopeT, 1.35) + 1.1 + rollers;
    dirtSamples.push({ x: tmp.x, z: tmp.z, baseElevation: dirtElev });
  }
}
initSplineSamples();

// Precomputed regular grid for O(1) physics lookups and mesh generation
const COLS = GRID_SEGMENTS_X + 1;
const ROWS = GRID_SEGMENTS_Z + 1;
export const heightGrid = new Float32Array(COLS * ROWS);
export const surfaceGrid = new Uint8Array(COLS * ROWS);
// Surface codes: 0 = GRASS, 1 = ASPHALT, 2 = DIRT, 3 = ROCK, 4 = SAND, 5 = WATER

function evaluatePoint(x: number, z: number): { height: number; surfaceCode: number; roadBlend: number; dirtBlend: number } {
  let rawH = computeRawMountainElevation(x, z);

  // Find closest distance to Asphalt Road spline
  let minRoadDistSq = Infinity;
  let closestRoadElev = rawH;
  for (let i = 0; i < asphaltSamples.length; i++) {
    const s = asphaltSamples[i];
    const dz = s.z - z;
    if (Math.abs(dz) > 28) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minRoadDistSq) {
      minRoadDistSq = dSq;
      closestRoadElev = s.baseElevation;
    }
  }

  // Find closest distance to Dirt Trail spline
  let minDirtDistSq = Infinity;
  let closestDirtElev = rawH;
  for (let i = 0; i < dirtSamples.length; i++) {
    const s = dirtSamples[i];
    const dz = s.z - z;
    if (Math.abs(dz) > 22) continue;
    const dx = s.x - x;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDirtDistSq) {
      minDirtDistSq = dSq;
      closestDirtElev = s.baseElevation;
    }
  }

  const roadDist = Math.sqrt(minRoadDistSq);
  const dirtDist = Math.sqrt(minDirtDistSq);

  // Road flattening profile: 5.2m half-width core, 11m smooth embankment shoulder
  const roadFlatten = 1.0 - THREE.MathUtils.smoothstep(roadDist, 4.6, 12.0);
  rawH = THREE.MathUtils.lerp(rawH, closestRoadElev, roadFlatten);

  // Dirt trail carving profile: 2.8m half-width core, 7.5m shoulder + slight berm dip
  const dirtFlatten = 1.0 - THREE.MathUtils.smoothstep(dirtDist, 2.5, 7.5);
  const dirtCarve = dirtDist < 2.8 ? -0.22 * Math.cos((dirtDist / 2.8) * Math.PI * 0.5) : 0;
  rawH = THREE.MathUtils.lerp(rawH, closestDirtElev + dirtCarve, dirtFlatten);

  // Determine dominant surface code
  let surfaceCode = 0; // GRASS
  if (rawH < WATER_LEVEL + 0.15) {
    surfaceCode = 5; // WATER
  } else if (roadDist < 4.5 && z < 126) {
    surfaceCode = 1; // ASPHALT
  } else if (dirtDist < 2.7 && z < 132) {
    surfaceCode = 2; // DIRT
  } else if (rawH < WATER_LEVEL + 1.85 && z > 85) {
    surfaceCode = 4; // SAND / SHORE
  } else if (rawH > 52 || Math.abs(x) > 78) {
    surfaceCode = 3; // ROCK
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

// Update spline Y coordinates so debug/prop placement has exact 3D heights
for (let i = 0; i < ASPHALT_SPLINE_POINTS.length; i++) {
  const pt = ASPHALT_SPLINE_POINTS[i];
  pt.y = getTerrainHeightOnly(pt.x, pt.z) + 0.2;
}
for (let i = 0; i < DIRT_SPLINE_POINTS.length; i++) {
  const pt = DIRT_SPLINE_POINTS[i];
  pt.y = getTerrainHeightOnly(pt.x, pt.z) + 0.2;
}

export function getTerrainHeightOnly(x: number, z: number): number {
  const gx = ((x / TERRAIN_WIDTH) + 0.5) * GRID_SEGMENTS_X;
  const gz = ((z / TERRAIN_LENGTH) + 0.5) * GRID_SEGMENTS_Z;

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
  const gx = ((x / TERRAIN_WIDTH) + 0.5) * GRID_SEGMENTS_X;
  const gz = ((z / TERRAIN_LENGTH) + 0.5) * GRID_SEGMENTS_Z;

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
