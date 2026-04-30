import { z } from 'zod';

// ─── Common Schemas ────────────────────────────────────────

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional(),
});

// ─── Lane Schemas ──────────────────────────────────────────

export const laneTypeOptions = [
  'NONE',
  'CITY_DRIVING',
  'BIKING',
  'SIDEWALK',
  'PARKING',
  'SHOULDER',
  'SHARED',
] as const;

export const laneTurnOptions = ['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN'] as const;

export const laneDirectionOptions = ['FORWARD', 'BACKWARD', 'BIDIRECTION'] as const;

export const boundaryTypeOptions = [
  'UNKNOWN',
  'DOTTED_YELLOW',
  'DOTTED_WHITE',
  'SOLID_YELLOW',
  'SOLID_WHITE',
  'DOUBLE_YELLOW',
  'CURB',
] as const;

export const laneSchema = z.object({
  type: z.enum(laneTypeOptions),
  turn: z.enum(laneTurnOptions),
  direction: z.enum(laneDirectionOptions),
  speedLimit: z.number().min(0).max(50),
  leftWidth: z.number().min(0.5).max(10).optional(),
  rightWidth: z.number().min(0.5).max(10).optional(),
  leftBoundaryType: z.enum(boundaryTypeOptions),
  rightBoundaryType: z.enum(boundaryTypeOptions),
});

export type LaneFormValues = z.infer<typeof laneSchema>;

// ─── Junction Schemas ──────────────────────────────────────

export const junctionTypeOptions = [
  'UNKNOWN',
  'IN_ROAD',
  'CROSS_ROAD',
  'FORK_ROAD',
  'MAIN_SIDE',
  'DEAD_END',
] as const;

export const junctionSchema = z.object({
  type: z.enum(junctionTypeOptions),
});

export type JunctionFormValues = z.infer<typeof junctionSchema>;

// ─── Parking Space Schemas ─────────────────────────────────

export const parkingSpaceSchema = z.object({
  heading: z.number().min(-180).max(180),
});

export type ParkingSpaceFormValues = z.infer<typeof parkingSpaceSchema>;

// ─── Signal Schemas ────────────────────────────────────────

export const signalTypeOptions = [
  'UNKNOWN_SIGNAL',
  'MIX_2_HORIZONTAL',
  'MIX_2_VERTICAL',
  'MIX_3_HORIZONTAL',
  'MIX_3_VERTICAL',
  'SINGLE',
] as const;

/**
 * Sign-info enum surfaced in the inspector. Apollo proto also accepts
 * `None` (value 0), but we treat absence of an entry as "none" — only
 * positive flags appear here. Per `signals_xml_parser.cc`, the only
 * currently-supported flag is NO_RIGHT_TURN_ON_RED.
 */
export const signInfoTypeOptions = ['NO_RIGHT_TURN_ON_RED'] as const;

/** Per-bulb subsignal type. Mirrors `Subsignal::Type` in
 *  `map_signal.proto`. UNKNOWN is exposed so users can clear a value. */
export const subsignalTypeOptions = [
  'UNKNOWN_SUBSIGNAL',
  'CIRCLE',
  'ARROW_LEFT',
  'ARROW_FORWARD',
  'ARROW_RIGHT',
  'ARROW_LEFT_AND_FORWARD',
  'ARROW_RIGHT_AND_FORWARD',
  'ARROW_U_TURN',
] as const;

export const signalSchema = z.object({
  type: z.enum(signalTypeOptions),
  // Required (not `.default`) so the schema's input + output types match.
  // The form initialises `signInfo: []` in `defaultValues` instead.
  signInfo: z.array(z.enum(signInfoTypeOptions)),
});

export type SignalFormValues = z.infer<typeof signalSchema>;

// ─── Stop Sign Schemas ─────────────────────────────────────

export const stopSignTypeOptions = [
  'UNKNOWN_STOP_SIGN',
  'ONE_WAY',
  'TWO_WAY',
  'THREE_WAY',
  'FOUR_WAY',
  'ALL_WAY',
] as const;

export const stopSignSchema = z.object({
  type: z.enum(stopSignTypeOptions),
});

export type StopSignFormValues = z.infer<typeof stopSignSchema>;

// ─── Road Schemas ──────────────────────────────────────────

export const roadTypeOptions = ['UNKNOWN_ROAD', 'HIGHWAY', 'CITY_ROAD', 'PARK'] as const;

export const roadSchema = z.object({
  type: z.enum(roadTypeOptions),
});

export type RoadFormValues = z.infer<typeof roadSchema>;
