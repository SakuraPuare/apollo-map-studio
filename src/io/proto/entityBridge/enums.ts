import type {
  AreaType,
  BarrierGateType,
  BoundaryEdge,
  BoundaryLineType,
  JunctionType,
  LaneDirection,
  LaneTurn,
  LaneType,
  PassageType,
  RoadType,
  SignInfoType,
  SignalType,
  StopSignType,
  SubsignalType,
} from '@/types/apollo';

function invert<T extends string>(m: Record<number, T>): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const [k, v] of Object.entries(m)) out[v as T] = Number(k);
  return out;
}

export const LANE_BOUNDARY_LINE_TYPE: Record<number, BoundaryLineType> = {
  0: 'UNKNOWN',
  1: 'DOTTED_YELLOW',
  2: 'DOTTED_WHITE',
  3: 'SOLID_YELLOW',
  4: 'SOLID_WHITE',
  5: 'DOUBLE_YELLOW',
  6: 'CURB',
};
export const LANE_BOUNDARY_LINE_TYPE_INV = invert(LANE_BOUNDARY_LINE_TYPE);

export const LANE_TYPE: Record<number, LaneType> = {
  1: 'NONE',
  2: 'CITY_DRIVING',
  3: 'BIKING',
  4: 'SIDEWALK',
  5: 'PARKING',
  6: 'SHOULDER',
  7: 'SHARED',
};
export const LANE_TYPE_INV = invert(LANE_TYPE);

export const LANE_TURN: Record<number, LaneTurn> = {
  1: 'NO_TURN',
  2: 'LEFT_TURN',
  3: 'RIGHT_TURN',
  4: 'U_TURN',
};
export const LANE_TURN_INV = invert(LANE_TURN);

export const LANE_DIRECTION: Record<number, LaneDirection> = {
  1: 'FORWARD',
  2: 'BACKWARD',
  3: 'BIDIRECTION',
};
export const LANE_DIRECTION_INV = invert(LANE_DIRECTION);

export const JUNCTION_TYPE: Record<number, JunctionType> = {
  0: 'UNKNOWN',
  1: 'IN_ROAD',
  2: 'CROSS_ROAD',
  3: 'FORK_ROAD',
  4: 'MAIN_SIDE',
  5: 'DEAD_END',
};
export const JUNCTION_TYPE_INV = invert(JUNCTION_TYPE);

export const ROAD_TYPE: Record<number, RoadType> = {
  0: 'UNKNOWN_ROAD',
  1: 'HIGHWAY',
  2: 'CITY_ROAD',
  3: 'PARK',
};
export const ROAD_TYPE_INV = invert(ROAD_TYPE);

export const BOUNDARY_EDGE_TYPE: Record<number, BoundaryEdge['type']> = {
  0: 'UNKNOWN',
  1: 'NORMAL',
  2: 'LEFT_BOUNDARY',
  3: 'RIGHT_BOUNDARY',
};
export const BOUNDARY_EDGE_TYPE_INV = invert(BOUNDARY_EDGE_TYPE);

export const STOP_SIGN_TYPE: Record<number, StopSignType> = {
  0: 'UNKNOWN_STOP_SIGN',
  1: 'ONE_WAY',
  2: 'TWO_WAY',
  3: 'THREE_WAY',
  4: 'FOUR_WAY',
  5: 'ALL_WAY',
};
export const STOP_SIGN_TYPE_INV = invert(STOP_SIGN_TYPE);

export const SIGNAL_TYPE: Record<number, SignalType> = {
  1: 'UNKNOWN_SIGNAL',
  2: 'MIX_2_HORIZONTAL',
  3: 'MIX_2_VERTICAL',
  4: 'MIX_3_HORIZONTAL',
  5: 'MIX_3_VERTICAL',
  6: 'SINGLE',
};
export const SIGNAL_TYPE_INV = invert(SIGNAL_TYPE);

export const SUBSIGNAL_TYPE: Record<number, SubsignalType> = {
  1: 'UNKNOWN_SUBSIGNAL',
  2: 'CIRCLE',
  3: 'ARROW_LEFT',
  4: 'ARROW_FORWARD',
  5: 'ARROW_RIGHT',
  6: 'ARROW_LEFT_AND_FORWARD',
  7: 'ARROW_RIGHT_AND_FORWARD',
  8: 'ARROW_U_TURN',
};
export const SUBSIGNAL_TYPE_INV = invert(SUBSIGNAL_TYPE);

export const SIGN_INFO_TYPE: Record<number, SignInfoType> = {
  0: 'None',
  1: 'NO_RIGHT_TURN_ON_RED',
};
export const SIGN_INFO_TYPE_INV = invert(SIGN_INFO_TYPE);

export const PASSAGE_TYPE: Record<number, PassageType> = {
  0: 'UNKNOWN_PASSAGE',
  1: 'ENTRANCE',
  2: 'EXIT',
};
export const PASSAGE_TYPE_INV = invert(PASSAGE_TYPE);

export const BARRIER_GATE_TYPE: Record<number, BarrierGateType> = {
  1: 'ROD',
  2: 'FENCE',
  3: 'ADVERTISING',
  4: 'TELESCOPIC',
  5: 'OTHER',
};
export const BARRIER_GATE_TYPE_INV = invert(BARRIER_GATE_TYPE);

export const AREA_TYPE: Record<number, AreaType> = {
  1: 'Driveable',
  2: 'UnDriveable',
  3: 'Custom1',
  4: 'Custom2',
  5: 'Custom3',
};
export const AREA_TYPE_INV = invert(AREA_TYPE);

export function enumFromProto<T extends string>(
  table: Record<number, T>,
  v: number | undefined,
  fallback: T,
): T {
  if (v === undefined) return fallback;
  return table[v] ?? fallback;
}

export function enumToProto<T extends string>(table: Record<T, number>, v: T): number {
  return table[v];
}
