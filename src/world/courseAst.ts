import * as THREE from 'three';
import { MovementMode, SurfaceType } from '../state/gameStore';

/**
 * ============================================================================
 * BOREAL FLOW — JSON-AST LEVEL DESIGN SPECIFICATION (Session 3)
 * ============================================================================
 * Declarative Abstract Syntax Tree for downhill course design.
 * Replaces opaque coordinate arrays with a human-readable, verifiable,
 * and compiler-driven level design graph.
 *
 * Designed for:
 * 1. 3-Act Narrative Descent (Canadian Rockies -> Boreal Taiga -> Mirror Lake)
 * 2. 3-Line System (Green Tourist Road, Blue Flow Singletrack, Black Gap Line)
 * 3. Micro-Landmarks (North Shore boardwalks, Timber Flumes, Road Gaps)
 * 4. Zero-allocation runtime queries for physics, audio, and diorama cameras.
 */

export type ActId = 'ACT_1_ROCKIES_SUMMIT' | 'ACT_2_BOREAL_LABYRINTH' | 'ACT_3_CANYON_MIRROR_LAKE';
export type LineId = 'LINE_GREEN' | 'LINE_BLUE' | 'LINE_BLACK' | 'LINE_RIVER';
export type LineDifficulty = 'GREEN_FLOW' | 'BLUE_MODERATE' | 'BLACK_EXPERT';
export type TurnDirection = 'LEFT' | 'RIGHT' | 'STRAIGHT';

export type NodeType =
  | 'START_GATE'
  | 'WAYPOINT'
  | 'BERM'
  | 'KICKER_JUMP'
  | 'ROAD_GAP'
  | 'NORTH_SHORE_BOARDWALK'
  | 'TIMBER_FLUME'
  | 'FORK'
  | 'MERGE'
  | 'FINISH_GATE';

export interface BaseNode {
  id: string;
  type: NodeType;
  position: [number, number, number]; // [x, y, z] in world meters
  comment?: string;
}

export interface StartGateNode extends BaseNode {
  type: 'START_GATE';
  archWidth: number;
  initialSpeed: number;
  downhillYaw: number;
  bannerTitle: string;
}

export interface WaypointNode extends BaseNode {
  type: 'WAYPOINT';
  corridorWidth: number;
  bankAngleDegrees?: number;
  targetSpeedKmh?: number;
}

export interface BermNode extends BaseNode {
  type: 'BERM';
  turnDirection: TurnDirection;
  radiusMeters: number;
  arcDegrees: number;
  wallHeightMeters: number;
  corridorWidth: number;
}

export interface KickerJumpNode extends BaseNode {
  type: 'KICKER_JUMP';
  lipHeightMeters: number;
  tabletopGapMeters: number;
  approachLengthMeters: number;
  landingSlopeDegrees: number;
}

export interface RoadGapNode extends BaseNode {
  type: 'ROAD_GAP';
  clearsOverLineId: LineId;
  clearanceHeightMeters: number;
  gapDistanceMeters: number;
  riskRating: number; // 1 to 5
}

export interface BoardwalkNode extends BaseNode {
  type: 'NORTH_SHORE_BOARDWALK';
  deckWidthMeters: number;
  elevationAboveGroundMeters: number;
  hasGuardrail: boolean;
  lengthMeters: number;
}

export interface TimberFlumeNode extends BaseNode {
  type: 'TIMBER_FLUME';
  troughRadiusMeters: number;
  rimHeightMeters: number;
  lengthMeters: number;
}

export interface ForkNode extends BaseNode {
  type: 'FORK';
  divergingLineIds: LineId[];
  signpostLabel: string;
  recommendedMode: MovementMode;
}

export interface MergeNode extends BaseNode {
  type: 'MERGE';
  incomingLineIds: LineId[];
}

export interface FinishGateNode extends BaseNode {
  type: 'FINISH_GATE';
  archWidth: number;
  bannerTitle: string;
  celebrationEffect: string;
}

export type CourseNode =
  | StartGateNode
  | WaypointNode
  | BermNode
  | KickerJumpNode
  | RoadGapNode
  | BoardwalkNode
  | TimberFlumeNode
  | ForkNode
  | MergeNode
  | FinishGateNode;

export interface CourseAct {
  id: ActId;
  title: string;
  subtitle: string;
  zRange: [number, number]; // [startZ, endZ]
  elevationRange: [number, number]; // [startElev, endElev] in meters
  dominantBiome: 'ALPINE_ROCKIES' | 'OLD_GROWTH_TAIGA' | 'CANYON_RAPIDS_LAKE';
  skyPreset: 'DAWN' | 'NOON' | 'GOLDEN' | 'NIGHT';
  audioAmbiance: string;
}

export interface CourseLineDefinition {
  id: LineId;
  title: string;
  difficulty: LineDifficulty;
  primarySurface: SurfaceType;
  allowedModes: MovementMode[];
  defaultCorridorWidth: number;
  parabolicBowlDepth: number; // in meters (e.g. 0.22m)
  parabolicBermRise: number; // in meters (e.g. 0.60m)
  estimatedDurationSeconds: number;
  colorHex: string;
  nodes: CourseNode[];
}

export interface CourseLandmarkDefinition {
  id: string;
  title: string;
  kind: 'WATCHTOWER' | 'BROKEN_BRIDGE' | 'TIMBER_FLUME' | 'STONE_ARCH' | 'WATERFALL' | 'CAMPFIRE_HUB' | 'PIER';
  position: [number, number, number];
  actId: ActId;
  interactionPrompt?: string;
}

export interface CourseAst {
  meta: {
    courseId: string;
    courseName: string;
    author: string;
    version: string;
    totalDescentMeters: number;
    totalLengthMeters: number;
    targetFps: number;
  };
  acts: CourseAct[];
  lines: CourseLineDefinition[];
  landmarks: CourseLandmarkDefinition[];
}

/**
 * ============================================================================
 * COMPILED RUNTIME DATA STRUCTURES
 * ============================================================================
 */

export interface CompiledLine {
  id: LineId;
  curve: THREE.CatmullRomCurve3;
  samplePoints: {
    position: THREE.Vector3;
    tangent: THREE.Vector3;
    t: number;
    z: number;
    corridorWidth: number;
    bankAngle: number;
  }[];
  totalCurveLength: number;
  definition: CourseLineDefinition;
  kickers: KickerJumpNode[];
  boardwalks: BoardwalkNode[];
  gaps: RoadGapNode[];
  flumes: TimberFlumeNode[];
}

export interface CompiledCourse {
  ast: CourseAst;
  lines: Map<LineId, CompiledLine>;
  acts: CourseAct[];
  landmarks: CourseLandmarkDefinition[];
  totalCheckpoints: number;
}

/**
 * ============================================================================
 * AST COMPILER FUNCTION
 * ============================================================================
 * Turns the declarative CourseAst JSON tree into high-speed CatmullRom splines,
 * sampled point arrays and spatial lookup structures.
 */
export function compileCourseAst(ast: CourseAst): CompiledCourse {
  const compiledLines = new Map<LineId, CompiledLine>();

  for (const lineDef of ast.lines) {
    const rawVectorPoints: THREE.Vector3[] = [];
    const kickers: KickerJumpNode[] = [];
    const boardwalks: BoardwalkNode[] = [];
    const gaps: RoadGapNode[] = [];
    const flumes: TimberFlumeNode[] = [];

    for (const node of lineDef.nodes) {
      rawVectorPoints.push(new THREE.Vector3(node.position[0], node.position[1], node.position[2]));

      if (node.type === 'KICKER_JUMP') kickers.push(node);
      if (node.type === 'NORTH_SHORE_BOARDWALK') boardwalks.push(node);
      if (node.type === 'ROAD_GAP') gaps.push(node);
      if (node.type === 'TIMBER_FLUME') flumes.push(node);
    }

    // Build Catmull-Rom 3D Curve
    const curve = new THREE.CatmullRomCurve3(
      rawVectorPoints.length >= 2 ? rawVectorPoints : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)],
      false,
      'catmullrom',
      0.5
    );

    // Pre-sample spline evenly with tangents
    const SAMPLE_COUNT = 300;
    const samplePoints: CompiledLine['samplePoints'] = [];
    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();

    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT;
      curve.getPoint(t, pos);
      curve.getTangent(t, tan);
      tan.normalize();

      samplePoints.push({
        position: pos.clone(),
        tangent: tan.clone(),
        t,
        z: pos.z,
        corridorWidth: lineDef.defaultCorridorWidth,
        bankAngle: 0,
      });
    }

    const totalCurveLength = curve.getLength();

    compiledLines.set(lineDef.id, {
      id: lineDef.id,
      curve,
      samplePoints,
      totalCurveLength,
      definition: lineDef,
      kickers,
      boardwalks,
      gaps,
      flumes,
    });
  }

  return {
    ast,
    lines: compiledLines,
    acts: ast.acts,
    landmarks: ast.landmarks,
    totalCheckpoints: Array.from(compiledLines.values()).reduce(
      (acc, l) => acc + Math.floor(l.totalCurveLength / 40),
      0
    ),
  };
}

import courseJsonRaw from './course.boreal.json';

export const BOREAL_COURSE_AST: CourseAst = courseJsonRaw as unknown as CourseAst;
export const COMPILED_BOREAL_COURSE: CompiledCourse = compileCourseAst(BOREAL_COURSE_AST);

