/* eslint-disable max-lines */
import type {
  ApolloEntity,
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  LaneEntity,
  OverlapEntity,
  PNCJunctionEntity,
  ParkingSpaceEntity,
  RoadEntity,
  RSUEntity,
  SignalEntity,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import {
  entityToRawLane,
  entityToRawRoad,
  rawLaneToEntity,
  rawRoadToEntity,
  type RawLane,
  type RawRoad,
} from './laneRoad';
import { entityToRawOverlap, rawOverlapToEntity, type RawOverlap } from './overlap';
import {
  entityToRawArea,
  entityToRawBarrierGate,
  entityToRawClearArea,
  entityToRawCrosswalk,
  entityToRawJunction,
  entityToRawParkingSpace,
  entityToRawPNCJunction,
  entityToRawRSU,
  entityToRawSignal,
  entityToRawSpeedBump,
  entityToRawStopSign,
  entityToRawYieldSign,
  rawAreaToEntity,
  rawBarrierGateToEntity,
  rawClearAreaToEntity,
  rawCrosswalkToEntity,
  rawJunctionToEntity,
  rawParkingSpaceToEntity,
  rawPNCJunctionToEntity,
  rawRSUToEntity,
  rawSignalToEntity,
  rawSpeedBumpToEntity,
  rawStopSignToEntity,
  rawYieldSignToEntity,
  type RawArea,
  type RawBarrierGate,
  type RawClearArea,
  type RawCrosswalk,
  type RawJunction,
  type RawParkingSpace,
  type RawPNCJunction,
  type RawRSU,
  type RawSignal,
  type RawSpeedBump,
  type RawStopSign,
  type RawYieldSign,
} from './simpleEntities';

export interface RawApolloMap {
  crosswalk?: RawCrosswalk[];
  junction?: RawJunction[];
  lane?: RawLane[];
  stop_sign?: RawStopSign[];
  signal?: RawSignal[];
  yield?: RawYieldSign[];
  overlap?: RawOverlap[];
  clear_area?: RawClearArea[];
  speed_bump?: RawSpeedBump[];
  road?: RawRoad[];
  parking_space?: RawParkingSpace[];
  pnc_junction?: RawPNCJunction[];
  rsu?: RawRSU[];
  ad_area?: RawArea[];
  barrier_gate?: RawBarrierGate[];
}

type EntityType = MapEntity['entityType'];
export type ApolloMapEntityField = keyof RawApolloMap;
const LANE_CURVE_MODELED_FIELDS = new Set(['segment']);
const LANE_BOUNDARY_MODELED_FIELDS = new Set(['curve', 'length', 'virtual', 'boundary_type']);
const ROAD_SECTION_MODELED_FIELDS = new Set(['id', 'lane_id', 'boundary']);
const ROAD_BOUNDARY_MODELED_FIELDS = new Set(['outer_polygon', 'hole']);
const ROAD_BOUNDARY_POLYGON_MODELED_FIELDS = new Set(['edge']);
const ROAD_BOUNDARY_EDGE_MODELED_FIELDS = new Set(['curve', 'type']);

function rawEntityId(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const id = (raw as { id?: unknown }).id;
  if (id === null || typeof id !== 'object') return null;
  const value = (id as { id?: unknown }).id;
  return typeof value === 'string' ? value : null;
}

function hasUnmodeledFields(raw: unknown, modeledFieldSet: ReadonlySet<string>): boolean {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  for (const key in raw as Record<string, unknown>) {
    if (!modeledFieldSet.has(key)) return true;
  }
  return false;
}

function hasLaneNestedUnmodeledFields(raw: unknown): boolean {
  const lane = asMergeRecord(raw);
  if (!lane) return false;
  if (hasUnmodeledFields(lane.central_curve, LANE_CURVE_MODELED_FIELDS)) return true;
  return (
    hasLaneBoundaryNestedUnmodeledFields(lane.left_boundary) ||
    hasLaneBoundaryNestedUnmodeledFields(lane.right_boundary)
  );
}

function hasLaneBoundaryNestedUnmodeledFields(raw: unknown): boolean {
  const boundary = asMergeRecord(raw);
  if (!boundary) return false;
  const boundaryCurve = boundary.curve;
  return (
    hasUnmodeledFields(boundary, LANE_BOUNDARY_MODELED_FIELDS) ||
    hasUnmodeledFields(boundaryCurve, LANE_CURVE_MODELED_FIELDS)
  );
}

function hasRoadNestedUnmodeledFields(raw: unknown): boolean {
  const road = asMergeRecord(raw);
  if (!road || !Array.isArray(road.section)) return false;
  return road.section.some(hasRoadSectionNestedUnmodeledFields);
}

function hasRoadSectionNestedUnmodeledFields(raw: unknown): boolean {
  const section = asMergeRecord(raw);
  if (!section) return false;
  return (
    hasUnmodeledFields(section, ROAD_SECTION_MODELED_FIELDS) ||
    hasRoadBoundaryNestedUnmodeledFields(section.boundary)
  );
}

function hasRoadBoundaryNestedUnmodeledFields(raw: unknown): boolean {
  const boundary = asMergeRecord(raw);
  if (!boundary) return false;
  const holes = boundary.hole;
  return (
    hasUnmodeledFields(boundary, ROAD_BOUNDARY_MODELED_FIELDS) ||
    hasRoadBoundaryPolygonNestedUnmodeledFields(boundary.outer_polygon) ||
    (Array.isArray(holes) && holes.some(hasRoadBoundaryPolygonNestedUnmodeledFields))
  );
}

function hasRoadBoundaryPolygonNestedUnmodeledFields(raw: unknown): boolean {
  const polygon = asMergeRecord(raw);
  if (!polygon) return false;
  const edges = polygon.edge;
  return (
    hasUnmodeledFields(polygon, ROAD_BOUNDARY_POLYGON_MODELED_FIELDS) ||
    (Array.isArray(edges) && edges.some(hasRoadBoundaryEdgeNestedUnmodeledFields))
  );
}

function hasRoadBoundaryEdgeNestedUnmodeledFields(raw: unknown): boolean {
  const edge = asMergeRecord(raw);
  if (!edge) return false;
  return (
    hasUnmodeledFields(edge, ROAD_BOUNDARY_EDGE_MODELED_FIELDS) ||
    hasUnmodeledFields(edge.curve, LANE_CURVE_MODELED_FIELDS)
  );
}

/**
 * Bidirectional bridge between Apollo proto fields and MapEntity types.
 * Order here defines emit order in `apolloMapToEntities` — must stay stable
 * (downstream consumers rely on it for deterministic snapshots).
 *
 * Functions are typed against `unknown`/`MapEntity` here because TypeScript
 * cannot keep per-row Raw/Entity generics aligned across a heterogeneous
 * tuple; each row's `fromProto` / `toProto` are pre-narrowed by sibling
 * modules and the runtime dispatch in `entitiesToApolloMap` only feeds each
 * `toProto` entities of the matching `entityType`.
 */
interface BridgeRule {
  /** Proto field name on the raw Apollo map. */
  field: ApolloMapEntityField;
  /** MapEntity discriminator that routes back to this rule on serialize. */
  entityType: EntityType;
  /** Top-level raw proto fields controlled by the editor entity model. */
  modeledFields: readonly string[];
  modeledFieldSet: ReadonlySet<string>;
  fromProto: (raw: unknown) => MapEntity | null;
  toProto: (entity: MapEntity) => unknown;
}

type RawPreservationEntry = Record<string, unknown> | null;
type RawPreservationMap = Map<string, RawPreservationEntry[]> | null;

// Helper to register a typed pair without losing call-site type checking on
// the Raw/Entity functions; the cast happens once here, not at every row.
function rule<RawT, EntityT extends MapEntity>(
  field: ApolloMapEntityField,
  entityType: EntityT['entityType'],
  modeledFields: readonly string[],
  fromProto: (raw: RawT) => EntityT | null,
  toProto: (entity: EntityT) => unknown,
): BridgeRule {
  return {
    field,
    entityType,
    modeledFields,
    modeledFieldSet: new Set(modeledFields),
    fromProto: fromProto as (raw: unknown) => MapEntity | null,
    toProto: toProto as (entity: MapEntity) => unknown,
  };
}

const BRIDGES: readonly BridgeRule[] = [
  rule<RawCrosswalk, CrosswalkEntity>(
    'crosswalk',
    'crosswalk',
    ['id', 'polygon', 'overlap_id'],
    rawCrosswalkToEntity,
    entityToRawCrosswalk,
  ),
  rule<RawJunction, JunctionEntity>(
    'junction',
    'junction',
    ['id', 'polygon', 'overlap_id', 'type'],
    rawJunctionToEntity,
    entityToRawJunction,
  ),
  rule<RawLane, LaneEntity>(
    'lane',
    'lane',
    [
      'id',
      'central_curve',
      'left_boundary',
      'right_boundary',
      'length',
      'speed_limit',
      'overlap_id',
      'predecessor_id',
      'successor_id',
      'left_neighbor_forward_lane_id',
      'right_neighbor_forward_lane_id',
      'type',
      'turn',
      'left_neighbor_reverse_lane_id',
      'right_neighbor_reverse_lane_id',
      'junction_id',
      'left_sample',
      'right_sample',
      'direction',
      'left_road_sample',
      'right_road_sample',
      'self_reverse_lane_id',
    ],
    rawLaneToEntity,
    entityToRawLane,
  ),
  rule<RawStopSign, StopSignEntity>(
    'stop_sign',
    'stopSign',
    ['id', 'stop_line', 'overlap_id', 'type'],
    rawStopSignToEntity,
    entityToRawStopSign,
  ),
  rule<RawSignal, SignalEntity>(
    'signal',
    'signal',
    ['id', 'boundary', 'subsignal', 'overlap_id', 'type', 'stop_line', 'sign_info'],
    rawSignalToEntity,
    entityToRawSignal,
  ),
  rule<RawYieldSign, YieldSignEntity>(
    'yield',
    'yieldSign',
    ['id', 'stop_line', 'overlap_id'],
    rawYieldSignToEntity,
    entityToRawYieldSign,
  ),
  rule<RawOverlap, OverlapEntity>(
    'overlap',
    'overlap',
    ['id', 'object', 'region_overlap'],
    rawOverlapToEntity,
    entityToRawOverlap,
  ),
  rule<RawClearArea, ClearAreaEntity>(
    'clear_area',
    'clearArea',
    ['id', 'polygon', 'overlap_id'],
    rawClearAreaToEntity,
    entityToRawClearArea,
  ),
  rule<RawSpeedBump, SpeedBumpEntity>(
    'speed_bump',
    'speedBump',
    ['id', 'overlap_id', 'position'],
    rawSpeedBumpToEntity,
    entityToRawSpeedBump,
  ),
  rule<RawRoad, RoadEntity>(
    'road',
    'road',
    ['id', 'section', 'junction_id', 'type'],
    rawRoadToEntity,
    entityToRawRoad,
  ),
  rule<RawParkingSpace, ParkingSpaceEntity>(
    'parking_space',
    'parkingSpace',
    ['id', 'polygon', 'overlap_id', 'heading'],
    rawParkingSpaceToEntity,
    entityToRawParkingSpace,
  ),
  rule<RawPNCJunction, PNCJunctionEntity>(
    'pnc_junction',
    'pncJunction',
    ['id', 'polygon', 'overlap_id', 'passage_group'],
    rawPNCJunctionToEntity,
    entityToRawPNCJunction,
  ),
  rule<RawRSU, RSUEntity>(
    'rsu',
    'rsu',
    ['id', 'junction_id', 'overlap_id'],
    rawRSUToEntity,
    entityToRawRSU,
  ),
  rule<RawArea, AreaEntity>(
    'ad_area',
    'area',
    ['id', 'type', 'polygon', 'overlap_id', 'name'],
    rawAreaToEntity,
    entityToRawArea,
  ),
  rule<RawBarrierGate, BarrierGateEntity>(
    'barrier_gate',
    'barrierGate',
    ['id', 'type', 'polygon', 'stop_line', 'overlap_id'],
    rawBarrierGateToEntity,
    entityToRawBarrierGate,
  ),
];

const BRIDGE_BY_FIELD = new Map<ApolloMapEntityField, BridgeRule>(
  BRIDGES.map((bridge) => [bridge.field, bridge]),
);
const BRIDGE_BY_ENTITY_TYPE = new Map<EntityType, BridgeRule>(
  BRIDGES.map((bridge) => [bridge.entityType, bridge]),
);
const BRIDGE_INDEX_BY_ENTITY_TYPE = new Map<EntityType, number>(
  BRIDGES.map((bridge, index) => [bridge.entityType, index]),
);

export const APOLLO_MAP_ENTITY_FIELDS: readonly ApolloMapEntityField[] = BRIDGES.map(
  (bridge) => bridge.field,
);

export function rawApolloElementToEntity(
  field: ApolloMapEntityField,
  raw: unknown,
): MapEntity | null {
  return BRIDGE_BY_FIELD.get(field)?.fromProto(raw) ?? null;
}

export function entityToRawApolloElement(entity: MapEntity): unknown | null {
  return BRIDGE_BY_ENTITY_TYPE.get(entity.entityType)?.toProto(entity) ?? null;
}

export function isApolloMapEntity(entity: MapEntity): entity is ApolloEntity {
  return BRIDGE_BY_ENTITY_TYPE.has(entity.entityType as EntityType);
}

function rawPreservationMap(rawItems: readonly unknown[], bridge: BridgeRule): RawPreservationMap {
  let rawById: RawPreservationMap = null;
  let hasAnyPreservedRaw = false;
  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    const id = rawEntityId(raw);
    const record = asMergeRecord(raw);
    if (!id || !record) continue;

    const needsPreservation =
      hasUnmodeledFields(record, bridge.modeledFieldSet) ||
      (bridge.entityType === 'lane' && hasLaneNestedUnmodeledFields(record)) ||
      (bridge.entityType === 'road' && hasRoadNestedUnmodeledFields(record));
    hasAnyPreservedRaw ||= needsPreservation;

    rawById ??= new Map<string, RawPreservationEntry[]>();
    const existing = rawById.get(id);
    const entry = needsPreservation ? record : null;
    if (existing) existing.push(entry);
    else rawById.set(id, [entry]);
  }
  return hasAnyPreservedRaw ? rawById : null;
}

function takeRawPreservation(
  rawById: RawPreservationMap,
  id: string,
): Record<string, unknown> | null {
  const matches = rawById?.get(id);
  if (!matches || matches.length === 0) return null;
  const raw = matches.shift() ?? null;
  if (matches.length === 0) rawById?.delete(id);
  return raw;
}

export function apolloMapToEntities(map: RawApolloMap): MapEntity[] {
  const out: MapEntity[] = [];
  for (const bridge of BRIDGES) {
    const items = map[bridge.field];
    if (!Array.isArray(items) || items.length === 0) continue;
    const fromProto = bridge.fromProto;
    for (let i = 0; i < items.length; i++) {
      const entity = fromProto(items[i]);
      if (entity !== null) out.push(entity);
    }
  }
  return out;
}

export function entitiesToApolloMap(
  baseMap: Record<string, unknown>,
  entities: MapEntity[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...baseMap };

  // Pre-seed one bucket per bridge so empty entity types still emit `[]`
  // (matches the prior explicit-assignment behaviour).
  const buckets = Array.from({ length: BRIDGES.length }, () => [] as MapEntity[]);

  for (const e of entities) {
    const bridgeIndex = BRIDGE_INDEX_BY_ENTITY_TYPE.get(e.entityType);
    if (bridgeIndex !== undefined) buckets[bridgeIndex]!.push(e);
  }

  for (let bridgeIndex = 0; bridgeIndex < BRIDGES.length; bridgeIndex++) {
    const bridge = BRIDGES[bridgeIndex]!;
    const bucket = buckets[bridgeIndex]!;
    const rawItems = Array.isArray(baseMap[bridge.field])
      ? (baseMap[bridge.field] as unknown[])
      : [];
    const rawById = rawPreservationMap(rawItems, bridge);

    const rawOut = new Array<unknown>(bucket.length);
    for (let i = 0; i < bucket.length; i++) {
      const entity = bucket[i]!;
      const next = bridge.toProto(entity);
      const previous = takeRawPreservation(rawById, entity.id);
      rawOut[i] =
        previous && next !== null && typeof next === 'object' && !Array.isArray(next)
          ? mergeRawElement(previous, next as Record<string, unknown>, bridge)
          : next;
    }
    out[bridge.field] = rawOut;
  }

  return out;
}

function mergeRawElement(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  bridge: BridgeRule,
): Record<string, unknown> {
  const merged = { ...previous };
  for (const field of bridge.modeledFields) delete merged[field];
  const out = { ...merged, ...next };
  if (bridge.entityType === 'lane') return mergeLaneNestedRawFields(previous, out);
  if (bridge.entityType === 'road') return mergeRoadNestedRawFields(previous, out);
  return out;
}

function asMergeRecord(value: unknown): Record<string, unknown> | null {
  return isMergeRecord(value) ? value : null;
}

function isMergeRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjectPreservingUnknown(
  previous: unknown,
  next: unknown,
  modeledFields: readonly string[],
): unknown {
  const previousRecord = asMergeRecord(previous);
  const nextRecord = asMergeRecord(next);
  if (!previousRecord || !nextRecord) return next;
  const merged = { ...previousRecord };
  for (const field of modeledFields) delete merged[field];
  return { ...merged, ...nextRecord };
}

function mergeLaneNestedRawFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...next,
    central_curve: mergeObjectPreservingUnknown(previous.central_curve, next.central_curve, [
      'segment',
    ]),
    left_boundary: mergeLaneBoundaryRaw(previous.left_boundary, next.left_boundary),
    right_boundary: mergeLaneBoundaryRaw(previous.right_boundary, next.right_boundary),
  };
}

function mergeLaneBoundaryRaw(previous: unknown, next: unknown): unknown {
  const merged = mergeObjectPreservingUnknown(previous, next, [
    'curve',
    'length',
    'virtual',
    'boundary_type',
  ]);
  const mergedRecord = asMergeRecord(merged);
  const previousRecord = asMergeRecord(previous);
  if (!mergedRecord || !previousRecord) return merged;
  return {
    ...mergedRecord,
    curve: mergeObjectPreservingUnknown(previousRecord.curve, mergedRecord.curve, ['segment']),
  };
}

function mergeRoadNestedRawFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...next,
    section: mergeIndexedArrayPreservingUnknown(
      previous.section,
      next.section,
      mergeRoadSectionRaw,
    ),
  };
}

function mergeRoadSectionRaw(previous: unknown, next: unknown): unknown {
  const merged = mergeObjectPreservingUnknown(previous, next, ['id', 'lane_id', 'boundary']);
  const mergedRecord = asMergeRecord(merged);
  const previousRecord = asMergeRecord(previous);
  if (!mergedRecord || !previousRecord) return merged;
  return {
    ...mergedRecord,
    boundary: mergeRoadBoundaryRaw(previousRecord.boundary, mergedRecord.boundary),
  };
}

function mergeRoadBoundaryRaw(previous: unknown, next: unknown): unknown {
  const merged = mergeObjectPreservingUnknown(previous, next, ['outer_polygon', 'hole']);
  const mergedRecord = asMergeRecord(merged);
  const previousRecord = asMergeRecord(previous);
  if (!mergedRecord || !previousRecord) return merged;
  return {
    ...mergedRecord,
    outer_polygon: mergeRoadBoundaryPolygonRaw(
      previousRecord.outer_polygon,
      mergedRecord.outer_polygon,
    ),
    hole: mergeIndexedArrayPreservingUnknown(
      previousRecord.hole,
      mergedRecord.hole,
      mergeRoadBoundaryPolygonRaw,
    ),
  };
}

function mergeRoadBoundaryPolygonRaw(previous: unknown, next: unknown): unknown {
  const merged = mergeObjectPreservingUnknown(previous, next, ['edge']);
  const mergedRecord = asMergeRecord(merged);
  const previousRecord = asMergeRecord(previous);
  if (!mergedRecord || !previousRecord) return merged;
  return {
    ...mergedRecord,
    edge: mergeIndexedArrayPreservingUnknown(
      previousRecord.edge,
      mergedRecord.edge,
      mergeRoadBoundaryEdgeRaw,
    ),
  };
}

function mergeRoadBoundaryEdgeRaw(previous: unknown, next: unknown): unknown {
  const merged = mergeObjectPreservingUnknown(previous, next, ['curve', 'type']);
  const mergedRecord = asMergeRecord(merged);
  const previousRecord = asMergeRecord(previous);
  if (!mergedRecord || !previousRecord) return merged;
  return {
    ...mergedRecord,
    curve: mergeObjectPreservingUnknown(previousRecord.curve, mergedRecord.curve, ['segment']),
  };
}

function mergeIndexedArrayPreservingUnknown(
  previous: unknown,
  next: unknown,
  mergeItem: (previous: unknown, next: unknown) => unknown,
): unknown {
  if (!Array.isArray(previous) || !Array.isArray(next)) return next;
  const merged = new Array<unknown>(next.length);
  for (let i = 0; i < next.length; i++) merged[i] = mergeItem(previous[i], next[i]);
  return merged;
}
