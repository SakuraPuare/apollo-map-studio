/**
 * Typed accessors for `Map.editor_meta` - the Apollo Map Studio
 * editor-only metadata that lives inside the Apollo `.bin` (proto field
 * number 1000 on `Map`). See `src/proto/editor/editor_meta.proto`.
 *
 * Apollo runtime tooling treats `editor_meta` as an unknown field and,
 * per proto2 default, preserves it on round-trip - so the same `.bin`
 * is consumed by both the editor and production Apollo without a
 * sidecar file.
 */

import type {
  SourceArcInfo,
  SourceBezierInfo,
  SourceCatmullRomInfo,
  SourceDrawInfo,
  SourceRectInfo,
} from '@/types/apollo';
import { getSource, getSourceRect } from '@/types/apollo';
import type { BezierAnchorData, GeoPoint, MapEntity } from '@/types/entities';

export type EditorGeometryKind = 'LINESTRING' | 'POLYGON';

export type EditorGeometrySource =
  | SourceDrawInfo
  | {
      drawTool: 'drawRotatedRect';
      rect: SourceRectInfo;
    };

export interface EditorEntityMeta {
  /** Forces editor to render points as polyline vs closed polygon. */
  geometryKind?: EditorGeometryKind;
  /** Restores editor-only geometry source semantics for Apollo entities. */
  geometrySource?: EditorGeometrySource;
}

export interface EditorMeta {
  /** Schema revision; bump on non-additive changes. */
  version: number;
  /** Per-entity overrides keyed by `<entityType>:<id>`. */
  entity: Record<string, EditorEntityMeta>;
}

export const EDITOR_META_VERSION = 1;

/** Wire format on `Map.editor_meta` - uses snake_case + numeric enums to
 *  match `keepCase: true` and the protobufjs encoder's expectations. */
interface EditorMetaWire {
  version?: number;
  entity?: Record<string, EditorEntityMetaWire>;
}

interface EditorEntityMetaWire {
  geometry_kind?: number;
  geometry_source?: GeometrySourceWire;
}

interface GeometrySourceWire {
  draw_tool?: number;
  rect?: SourceRectWire;
  bezier?: SourceBezierWire;
  arc?: SourceArcWire;
  catmull_rom?: SourceCatmullRomWire;
}

interface SourceRectWire {
  p1?: PointWire;
  p2?: PointWire;
  rotation?: number;
}

interface SourceBezierWire {
  anchor?: SourceBezierAnchorWire[];
}

interface SourceBezierAnchorWire {
  point?: PointWire;
  handle_in?: PointWire;
  handle_out?: PointWire;
}

interface SourceArcWire {
  p1?: PointWire;
  p2?: PointWire;
  p3?: PointWire;
}

interface SourceCatmullRomWire {
  point?: PointWire[];
}

interface PointWire {
  x?: number;
  y?: number;
  z?: number;
}

const KIND_TO_NUM: Record<EditorGeometryKind, number> = {
  LINESTRING: 1,
  POLYGON: 2,
};

const NUM_TO_KIND: Record<number, EditorGeometryKind> = {
  1: 'LINESTRING',
  2: 'POLYGON',
};

const DRAW_TOOL_TO_NUM: Record<EditorGeometrySource['drawTool'], number> = {
  drawBezier: 1,
  drawArc: 2,
  drawCatmullRom: 3,
  drawRotatedRect: 4,
};

const NUM_TO_DRAW_TOOL: Record<number, EditorGeometrySource['drawTool']> = {
  1: 'drawBezier',
  2: 'drawArc',
  3: 'drawCatmullRom',
  4: 'drawRotatedRect',
};

const SOURCE_RECT_ENTITY_TYPES = new Set([
  'area',
  'clearArea',
  'crosswalk',
  'junction',
  'parkingSpace',
  'pncJunction',
]);

const SOURCE_DRAW_ENTITY_TYPES = new Set([
  'barrierGate',
  'lane',
  'signal',
  'speedBump',
  'stopSign',
  'yieldSign',
]);

export function readEditorMeta(rawMap: Record<string, unknown>): EditorMeta {
  const wire = rawMap.editor_meta as EditorMetaWire | undefined;
  const entity: Record<string, EditorEntityMeta> = {};
  if (wire?.entity) {
    for (const [key, raw] of Object.entries(wire.entity)) {
      entity[key] = decodeEntity(raw);
    }
  }
  return { version: wire?.version ?? EDITOR_META_VERSION, entity };
}

export function writeEditorMeta(rawMap: Record<string, unknown>, meta: EditorMeta): void {
  const wire: EditorMetaWire = {
    version: meta.version,
    entity: Object.fromEntries(
      Object.entries(meta.entity)
        .filter(([, v]) => !isEmptyEntityMeta(v))
        .map(([k, v]) => [k, encodeEntity(v)]),
    ),
  };
  rawMap.editor_meta = wire;
}

export function entityKey(entityType: string, id: string): string {
  return `${entityType}:${id}`;
}

export function writeEntitySourcesToEditorMeta(
  rawMap: Record<string, unknown>,
  entities: readonly MapEntity[],
): void {
  const meta = readEditorMeta(rawMap);
  for (const entityMeta of Object.values(meta.entity)) {
    delete entityMeta.geometrySource;
  }

  for (const entity of entities) {
    const geometrySource = collectGeometrySource(entity);
    if (!geometrySource) continue;
    const key = entityKey(entity.entityType, entity.id);
    meta.entity[key] = {
      ...meta.entity[key],
      geometrySource,
    };
  }

  writeEditorMeta(rawMap, meta);
}

export function hydrateEntitySourcesFromEditorMeta(
  rawMap: Record<string, unknown>,
  entities: readonly MapEntity[],
): MapEntity[] {
  const meta = readEditorMeta(rawMap);
  return entities.map((entity) => {
    const geometrySource = meta.entity[entityKey(entity.entityType, entity.id)]?.geometrySource;
    if (!geometrySource) return entity;
    if (geometrySource.drawTool === 'drawRotatedRect') {
      if (!canHydrateSourceRect(entity)) return entity;
      return { ...entity, _sourceRect: cloneSourceRect(geometrySource.rect) } as MapEntity;
    }
    if (!canHydrateSourceDraw(entity)) return entity;
    return { ...entity, _source: cloneSourceDraw(geometrySource) } as MapEntity;
  });
}

export const writeSourceRectsToEditorMeta = writeEntitySourcesToEditorMeta;
export const hydrateSourceRectsFromEditorMeta = hydrateEntitySourcesFromEditorMeta;

function collectGeometrySource(entity: MapEntity): EditorGeometrySource | undefined {
  const sourceRect = getSourceRect(entity);
  if (sourceRect) return { drawTool: 'drawRotatedRect', rect: cloneSourceRect(sourceRect) };

  const source = getSource(entity);
  if (!source) return undefined;
  return cloneSourceDraw(source);
}

function decodeEntity(raw: EditorEntityMetaWire): EditorEntityMeta {
  const out: EditorEntityMeta = {};
  if (raw.geometry_kind !== undefined && raw.geometry_kind in NUM_TO_KIND) {
    out.geometryKind = NUM_TO_KIND[raw.geometry_kind];
  }
  const geometrySource = decodeGeometrySource(raw.geometry_source);
  if (geometrySource) out.geometrySource = geometrySource;
  return out;
}

function encodeEntity(meta: EditorEntityMeta): EditorEntityMetaWire {
  const out: EditorEntityMetaWire = {};
  if (meta.geometryKind) out.geometry_kind = KIND_TO_NUM[meta.geometryKind];
  if (meta.geometrySource) out.geometry_source = encodeGeometrySource(meta.geometrySource);
  return out;
}

function canHydrateSourceRect(entity: MapEntity): boolean {
  return SOURCE_RECT_ENTITY_TYPES.has(entity.entityType) && 'polygon' in entity;
}

function canHydrateSourceDraw(entity: MapEntity): boolean {
  return SOURCE_DRAW_ENTITY_TYPES.has(entity.entityType);
}

function isEmptyEntityMeta(meta: EditorEntityMeta): boolean {
  return meta.geometryKind === undefined && meta.geometrySource === undefined;
}

function decodeGeometrySource(
  raw: GeometrySourceWire | undefined,
): EditorGeometrySource | undefined {
  if (!raw || raw.draw_tool === undefined) return undefined;
  const drawTool = NUM_TO_DRAW_TOOL[raw.draw_tool];
  if (!drawTool) return undefined;

  if (drawTool === 'drawRotatedRect') {
    const rect = decodeSourceRect(raw.rect);
    return rect ? { drawTool, rect } : undefined;
  }
  if (drawTool === 'drawBezier') return decodeSourceBezier(raw.bezier);
  if (drawTool === 'drawArc') return decodeSourceArc(raw.arc);
  return decodeSourceCatmullRom(raw.catmull_rom);
}

function encodeGeometrySource(source: EditorGeometrySource): GeometrySourceWire {
  const out: GeometrySourceWire = { draw_tool: DRAW_TOOL_TO_NUM[source.drawTool] };
  if (source.drawTool === 'drawRotatedRect') out.rect = encodeSourceRect(source.rect);
  else if (source.drawTool === 'drawBezier') out.bezier = encodeSourceBezier(source);
  else if (source.drawTool === 'drawArc') out.arc = encodeSourceArc(source);
  else out.catmull_rom = encodeSourceCatmullRom(source);
  return out;
}

function decodeSourceRect(raw: SourceRectWire | undefined): SourceRectInfo | undefined {
  if (!raw || typeof raw.rotation !== 'number') return undefined;
  const p1 = decodePoint(raw.p1);
  const p2 = decodePoint(raw.p2);
  if (!p1 || !p2) return undefined;
  return { p1, p2, rotation: raw.rotation };
}

function encodeSourceRect(sourceRect: SourceRectInfo): SourceRectWire {
  return {
    p1: encodePoint(sourceRect.p1),
    p2: encodePoint(sourceRect.p2),
    rotation: sourceRect.rotation,
  };
}

function decodeSourceBezier(raw: SourceBezierWire | undefined): SourceBezierInfo | undefined {
  const anchors = raw?.anchor;
  if (!anchors || anchors.length < 2) return undefined;
  const decoded = anchors.map(decodeBezierAnchor);
  if (decoded.some((anchor) => anchor === undefined)) return undefined;
  return { drawTool: 'drawBezier', anchors: decoded as BezierAnchorData[] };
}

function encodeSourceBezier(source: SourceBezierInfo): SourceBezierWire {
  return { anchor: source.anchors.map(encodeBezierAnchor) };
}

function decodeBezierAnchor(raw: SourceBezierAnchorWire): BezierAnchorData | undefined {
  const point = decodePoint(raw.point);
  if (!point) return undefined;
  return {
    point,
    handleIn: decodePoint(raw.handle_in) ?? null,
    handleOut: decodePoint(raw.handle_out) ?? null,
  };
}

function encodeBezierAnchor(anchor: BezierAnchorData): SourceBezierAnchorWire {
  const out: SourceBezierAnchorWire = { point: encodePoint(anchor.point) };
  if (anchor.handleIn) out.handle_in = encodePoint(anchor.handleIn);
  if (anchor.handleOut) out.handle_out = encodePoint(anchor.handleOut);
  return out;
}

function decodeSourceArc(raw: SourceArcWire | undefined): SourceArcInfo | undefined {
  const p1 = decodePoint(raw?.p1);
  const p2 = decodePoint(raw?.p2);
  const p3 = decodePoint(raw?.p3);
  if (!p1 || !p2 || !p3) return undefined;
  return { drawTool: 'drawArc', arcPoints: [p1, p2, p3] };
}

function encodeSourceArc(source: SourceArcInfo): SourceArcWire {
  return {
    p1: encodePoint(source.arcPoints[0]),
    p2: encodePoint(source.arcPoints[1]),
    p3: encodePoint(source.arcPoints[2]),
  };
}

function decodeSourceCatmullRom(
  raw: SourceCatmullRomWire | undefined,
): SourceCatmullRomInfo | undefined {
  const points = raw?.point?.map(decodePoint);
  if (!points || points.length < 2 || points.some((point) => point === undefined)) {
    return undefined;
  }
  return { drawTool: 'drawCatmullRom', points: points as GeoPoint[] };
}

function encodeSourceCatmullRom(source: SourceCatmullRomInfo): SourceCatmullRomWire {
  return { point: source.points.map(encodePoint) };
}

function decodePoint(raw: PointWire | undefined): GeoPoint | undefined {
  if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return undefined;
  return typeof raw.z === 'number' ? { x: raw.x, y: raw.y, z: raw.z } : { x: raw.x, y: raw.y };
}

function encodePoint(point: GeoPoint): PointWire {
  return point.z === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, z: point.z };
}

function cloneSourceDraw(source: SourceDrawInfo): SourceDrawInfo {
  if (source.drawTool === 'drawBezier') {
    return { drawTool: source.drawTool, anchors: source.anchors.map(cloneBezierAnchor) };
  }
  if (source.drawTool === 'drawArc') {
    return {
      drawTool: source.drawTool,
      arcPoints: [
        clonePoint(source.arcPoints[0]),
        clonePoint(source.arcPoints[1]),
        clonePoint(source.arcPoints[2]),
      ],
    };
  }
  return { drawTool: source.drawTool, points: source.points.map(clonePoint) };
}

function cloneSourceRect(sourceRect: SourceRectInfo): SourceRectInfo {
  return {
    p1: clonePoint(sourceRect.p1),
    p2: clonePoint(sourceRect.p2),
    rotation: sourceRect.rotation,
  };
}

function cloneBezierAnchor(anchor: BezierAnchorData): BezierAnchorData {
  return {
    point: clonePoint(anchor.point),
    handleIn: anchor.handleIn ? clonePoint(anchor.handleIn) : null,
    handleOut: anchor.handleOut ? clonePoint(anchor.handleOut) : null,
  };
}

function clonePoint(point: GeoPoint): GeoPoint {
  return point.z === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, z: point.z };
}
