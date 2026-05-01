/**
 * Enum display-label registry — i18n 抓手.
 *
 * Proto-derived enum values (e.g. 'CITY_DRIVING', 'MIX_3_VERTICAL')
 * are the source of truth on the wire and in zod schemas. The UI
 * needs human-readable labels per language. This module is the
 * single funnel: components call `getEnumLabel(category, value)`
 * and a future i18n layer only has to swap the dictionary.
 *
 * Categories match the proto message that owns the enum, not the
 * form-field name, so the same boundary type used by Lane.left and
 * Lane.right shares one entry.
 */
import type {
  LaneType,
  LaneTurn,
  LaneDirection,
  BoundaryLineType,
  JunctionType,
  SignalType,
  SignInfoType,
  StopSignType,
  RoadType,
  PassageType,
  SubsignalType,
  AreaType,
  BarrierGateType,
} from '@/types/apollo';

export type EnumCategory =
  | 'laneType'
  | 'laneTurn'
  | 'laneDirection'
  | 'boundaryType'
  | 'junctionType'
  | 'signalType'
  | 'signInfoType'
  | 'subsignalType'
  | 'stopSignType'
  | 'roadType'
  | 'passageType'
  | 'areaType'
  | 'barrierGateType';

type Dict<V extends string> = Readonly<Record<V, string>>;

const laneType: Dict<LaneType> = {
  NONE: 'None',
  CITY_DRIVING: 'City Driving',
  BIKING: 'Biking',
  SIDEWALK: 'Sidewalk',
  PARKING: 'Parking',
  SHOULDER: 'Shoulder',
  SHARED: 'Shared',
};

const laneTurn: Dict<LaneTurn> = {
  NO_TURN: 'No Turn',
  LEFT_TURN: 'Left Turn',
  RIGHT_TURN: 'Right Turn',
  U_TURN: 'U-Turn',
};

const laneDirection: Dict<LaneDirection> = {
  FORWARD: 'Forward',
  BACKWARD: 'Backward',
  BIDIRECTION: 'Bidirectional',
};

const boundaryType: Dict<BoundaryLineType> = {
  UNKNOWN: 'Unknown',
  DOTTED_YELLOW: 'Dotted Yellow',
  DOTTED_WHITE: 'Dotted White',
  SOLID_YELLOW: 'Solid Yellow',
  SOLID_WHITE: 'Solid White',
  DOUBLE_YELLOW: 'Double Yellow',
  CURB: 'Curb',
};

const junctionType: Dict<JunctionType> = {
  UNKNOWN: 'Unknown',
  IN_ROAD: 'In-Road',
  CROSS_ROAD: 'Crossroad',
  FORK_ROAD: 'Fork',
  MAIN_SIDE: 'Main / Side',
  DEAD_END: 'Dead End',
};

const signalType: Dict<SignalType> = {
  UNKNOWN_SIGNAL: 'Unknown',
  MIX_2_HORIZONTAL: '2-Light Horizontal',
  MIX_2_VERTICAL: '2-Light Vertical',
  MIX_3_HORIZONTAL: '3-Light Horizontal',
  MIX_3_VERTICAL: '3-Light Vertical',
  SINGLE: 'Single',
};

const signInfoType: Dict<SignInfoType> = {
  NO_RIGHT_TURN_ON_RED: 'No Right Turn on Red',
  None: 'None',
};

const subsignalType: Dict<SubsignalType> = {
  UNKNOWN_SUBSIGNAL: 'Unknown',
  CIRCLE: 'Circle',
  ARROW_LEFT: 'Arrow Left',
  ARROW_FORWARD: 'Arrow Forward',
  ARROW_RIGHT: 'Arrow Right',
  ARROW_LEFT_AND_FORWARD: 'Arrow Left+Forward',
  ARROW_RIGHT_AND_FORWARD: 'Arrow Right+Forward',
  ARROW_U_TURN: 'Arrow U-Turn',
};

const stopSignType: Dict<StopSignType> = {
  UNKNOWN_STOP_SIGN: 'Unknown',
  ONE_WAY: 'One-Way',
  TWO_WAY: 'Two-Way',
  THREE_WAY: 'Three-Way',
  FOUR_WAY: 'Four-Way',
  ALL_WAY: 'All-Way',
};

const roadType: Dict<RoadType> = {
  UNKNOWN_ROAD: 'Unknown',
  HIGHWAY: 'Highway',
  CITY_ROAD: 'City Road',
  PARK: 'Park',
};

const passageType: Dict<PassageType> = {
  UNKNOWN_PASSAGE: 'Unknown',
  ENTRANCE: 'Entrance',
  EXIT: 'Exit',
};

const areaType: Dict<AreaType> = {
  Driveable: 'Driveable',
  UnDriveable: 'Undriveable',
  Custom1: 'Custom 1',
  Custom2: 'Custom 2',
  Custom3: 'Custom 3',
};

const barrierGateType: Dict<BarrierGateType> = {
  ROD: 'Rod',
  FENCE: 'Fence',
  ADVERTISING: 'Advertising',
  TELESCOPIC: 'Telescopic',
  OTHER: 'Other',
};

const REGISTRY: Record<EnumCategory, Readonly<Record<string, string>>> = {
  laneType,
  laneTurn,
  laneDirection,
  boundaryType,
  junctionType,
  signalType,
  signInfoType,
  subsignalType,
  stopSignType,
  roadType,
  passageType,
  areaType,
  barrierGateType,
};

/**
 * Resolve a display label for an enum value. Falls back to the raw
 * value (so a missing entry never blanks out the UI). Future i18n
 * swaps only the dictionary — call sites do not change.
 */
export function getEnumLabel(category: EnumCategory, value: string): string {
  return REGISTRY[category][value] ?? value;
}

/** Build a Select-friendly `{ value, label }[]` from an option list. */
export function withLabels<T extends string>(
  category: EnumCategory,
  options: readonly T[],
): ReadonlyArray<{ value: T; label: string }> {
  return options.map((value) => ({ value, label: getEnumLabel(category, value) }));
}
