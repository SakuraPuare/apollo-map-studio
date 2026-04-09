/**
 * Apollo 实体工厂 + GeoJSON 编译器 + 编辑点访问器
 */
import { nanoid } from 'nanoid';
import type { LngLat, BezierAnchor } from '@/core/geometry/interpolate';
import { cubicBezier, threePointArc, catmullRom, rectCorners } from '@/core/geometry/interpolate';
import { coordsToPoints, pointsToCoords, toLngLat, toGeoPoint } from '@/core/geometry/coords';
import { elementColor } from '@/core/elements';
import type { MapElementType } from '@/core/elements';
import type {
  Curve, CurveSegment, LineSegment, ApolloPolygon, SourceDrawInfo,
  LaneEntity, RoadEntity, JunctionEntity, ParkingSpaceEntity,
  CrosswalkEntity, SignalEntity, StopSignEntity, SpeedBumpEntity,
  YieldSignEntity, ClearAreaEntity, BarrierGateEntity, AreaEntity,
  ApolloEntity,
} from '@/types/apollo';
import type { GeoPoint, BezierAnchorData } from '@/types/entities';
import { anchorToData } from '@/core/geometry/anchorConvert';

// ═══════════ 几何转换 ═══════════════════════════════════════

export function pointsToCurve(points: GeoPoint[]): Curve {
  const seg: CurveSegment = {
    lineSegment: { points } as LineSegment,
    s: 0, startPosition: points[0] ?? { x: 0, y: 0 }, heading: 0, length: 0,
  };
  return { segments: [seg] };
}

export function pointsToPolygon(points: GeoPoint[]): ApolloPolygon {
  return { points };
}

/** 将折线按指定宽度（米）向左或右偏移，返回偏移后的点 */
function offsetPolylineDeg(points: GeoPoint[], widthMeters: number, side: 'left' | 'right'): GeoPoint[] {
  if (points.length < 2 || widthMeters <= 0) return points;
  const sign = side === 'left' ? 1 : -1;
  const DEG_TO_M = 111320;
  const result: GeoPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const cosLat = Math.cos(p.y * Math.PI / 180);
    let dx: number, dy: number;
    if (i === 0) { dx = points[1].x - p.x; dy = points[1].y - p.y; }
    else if (i === points.length - 1) { dx = p.x - points[i - 1].x; dy = p.y - points[i - 1].y; }
    else { dx = points[i + 1].x - points[i - 1].x; dy = points[i + 1].y - points[i - 1].y; }

    const dxM = dx * cosLat * DEG_TO_M;
    const dyM = dy * DEG_TO_M;
    const len = Math.hypot(dxM, dyM);
    if (len === 0) { result.push(p); continue; }

    const perpXM = -dyM / len * widthMeters * sign;
    const perpYM = dxM / len * widthMeters * sign;

    result.push({
      x: p.x + perpXM / (cosLat * DEG_TO_M),
      y: p.y + perpYM / DEG_TO_M,
      ...(p.z !== undefined ? { z: p.z } : {}),
    });
  }
  return result;
}

// ═══════════ 编辑点访问器 ════════════════════════════════════

export function getApolloEditPoints(entity: ApolloEntity): GeoPoint[] {
  switch (entity.entityType) {
    case 'junction': case 'parkingSpace': case 'crosswalk':
    case 'clearArea': case 'area': case 'parkingLot':
      return entity.polygon.points;
    case 'barrierGate':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? entity.polygon.points;
    case 'signal':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? entity.boundary.points;
    case 'lane':
      return entity.centralCurve.segments[0]?.lineSegment.points ?? [];
    case 'stopSign':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
    case 'speedBump':
      return entity.position[0]?.segments[0]?.lineSegment.points ?? [];
    case 'yieldSign':
      return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
    default: return [];
  }
}

export function setAllApolloEditPoints(entity: ApolloEntity, points: GeoPoint[]): ApolloEntity {
  switch (entity.entityType) {
    case 'junction': case 'parkingSpace': case 'crosswalk':
    case 'clearArea': case 'area': case 'parkingLot':
      return { ...entity, polygon: { points } } as typeof entity;
    case 'barrierGate': {
      if (entity.stopLines.length > 0) {
        const l = [...entity.stopLines]; const s = [...l[0].segments];
        s[0] = { ...s[0], lineSegment: { points } }; l[0] = { ...l[0], segments: s };
        return { ...entity, stopLines: l };
      }
      return { ...entity, polygon: { points } } as typeof entity;
    }
    case 'signal': {
      if (entity.stopLines.length > 0) {
        const l = [...entity.stopLines]; const s = [...l[0].segments];
        s[0] = { ...s[0], lineSegment: { points } }; l[0] = { ...l[0], segments: s };
        return { ...entity, stopLines: l };
      }
      return { ...entity, boundary: { points } } as typeof entity;
    }
    case 'lane': {
      const segs = [...entity.centralCurve.segments];
      segs[0] = { ...segs[0], lineSegment: { points } };
      return { ...entity, centralCurve: { segments: segs } };
    }
    case 'stopSign': {
      const l = [...entity.stopLines]; const s = [...l[0].segments];
      s[0] = { ...s[0], lineSegment: { points } }; l[0] = { ...l[0], segments: s };
      return { ...entity, stopLines: l };
    }
    case 'speedBump': {
      const p = [...entity.position]; const s = [...p[0].segments];
      s[0] = { ...s[0], lineSegment: { points } }; p[0] = { ...p[0], segments: s };
      return { ...entity, position: p };
    }
    case 'yieldSign': {
      const l = [...entity.stopLines]; const s = [...l[0].segments];
      s[0] = { ...s[0], lineSegment: { points } }; l[0] = { ...l[0], segments: s };
      return { ...entity, stopLines: l };
    }
    default: return entity;
  }
}

export function setApolloEditPoint(entity: ApolloEntity, index: number, point: GeoPoint): ApolloEntity {
  const pts = [...getApolloEditPoints(entity)];
  if (index < 0 || index >= pts.length) return entity;
  pts[index] = point;
  return setAllApolloEditPoints(entity, pts);
}

export function moveApolloEntity(entity: ApolloEntity, dx: number, dy: number): ApolloEntity {
  const pts = getApolloEditPoints(entity);
  if (pts.length === 0) return entity;
  return setAllApolloEditPoints(entity, pts.map((p) => ({
    x: p.x + dx, y: p.y + dy, ...(p.z !== undefined ? { z: p.z } : {}),
  })));
}

export function deleteApolloVertex(entity: ApolloEntity, index: number): ApolloEntity | null {
  const pts = getApolloEditPoints(entity);
  const min = isApolloAreaEntity(entity) ? 3 : 2;
  if (pts.length <= min) return null;
  return setAllApolloEditPoints(entity, pts.filter((_, i) => i !== index));
}

// ═══════════ 工厂函数 ════════════════════════════════════════

interface DrawResult { drawTool: string; points: LngLat[]; anchors: BezierAnchor[]; }

function extractLinePoints(draw: DrawResult): GeoPoint[] {
  if (draw.drawTool === 'drawBezier' && draw.anchors.length >= 2) return coordsToPoints(cubicBezier(draw.anchors));
  if (draw.drawTool === 'drawArc' && draw.points.length >= 3) return coordsToPoints(threePointArc(draw.points[0], draw.points[1], draw.points[2]));
  if (draw.drawTool === 'drawCatmullRom' && draw.points.length >= 2) return coordsToPoints(catmullRom(draw.points));
  return coordsToPoints(draw.points);
}

function extractPolygonPoints(draw: DrawResult): GeoPoint[] {
  if (draw.drawTool === 'drawRect' && draw.points.length >= 2) return coordsToPoints(rectCorners(draw.points[0], draw.points[1], 0));
  return coordsToPoints(draw.points);
}

/** 默认车道宽度（米），中心线到左/右边界的距离 */
const DEFAULT_LANE_HALF_WIDTH = 1.75;

/** 构建原始绘制信息（贝塞尔/圆弧），用于保留曲线可编辑性 */
function buildSourceInfo(d: DrawResult): SourceDrawInfo | undefined {
  if (d.drawTool === 'drawBezier' && d.anchors.length >= 2) {
    return { drawTool: d.drawTool, anchors: d.anchors.map(anchorToData) };
  }
  if (d.drawTool === 'drawArc' && d.points.length >= 3) {
    return { drawTool: d.drawTool, arcPoints: [toGeoPoint(d.points[0]), toGeoPoint(d.points[1]), toGeoPoint(d.points[2])] };
  }
  return undefined;
}

/** 构建矩形源信息（用于保留旋转能力） */
function buildRectInfo(d: DrawResult): import('@/types/apollo').SourceRectInfo | undefined {
  if (d.drawTool === 'drawRect' && d.points.length >= 2) {
    return { p1: toGeoPoint(d.points[0]), p2: toGeoPoint(d.points[1]), rotation: 0 };
  }
  return undefined;
}

function createLane(d: DrawResult): LaneEntity {
  const source = buildSourceInfo(d);
  return {
    id: `lane_${nanoid(12)}`, entityType: 'lane',
    centralCurve: pointsToCurve(extractLinePoints(d)),
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0, type: 'CITY_DRIVING', turn: 'NO_TURN', direction: 'FORWARD', speedLimit: 0,
    predecessorIds: [], successorIds: [],
    leftNeighborForwardIds: [], rightNeighborForwardIds: [],
    leftNeighborReverseIds: [], rightNeighborReverseIds: [],
    selfReverseLaneIds: [], junctionId: null, overlapIds: [],
    leftSamples: [{ s: 0, width: DEFAULT_LANE_HALF_WIDTH }],
    rightSamples: [{ s: 0, width: DEFAULT_LANE_HALF_WIDTH }],
    leftRoadSamples: [], rightRoadSamples: [],
    ...(source ? { _source: source } : {}),
  };
}

function createJunction(d: DrawResult): JunctionEntity {
  return { id: `junction_${nanoid(12)}`, entityType: 'junction', polygon: pointsToPolygon(extractPolygonPoints(d)), type: 'CROSS_ROAD', overlapIds: [] };
}
function createParkingSpace(d: DrawResult): ParkingSpaceEntity {
  const rect = buildRectInfo(d);
  return { id: `parkingSpace_${nanoid(12)}`, entityType: 'parkingSpace', polygon: pointsToPolygon(extractPolygonPoints(d)), heading: 0, overlapIds: [], ...(rect ? { _sourceRect: rect } : {}) };
}
function createCrosswalk(d: DrawResult): CrosswalkEntity {
  const rect = buildRectInfo(d);
  return { id: `crosswalk_${nanoid(12)}`, entityType: 'crosswalk', polygon: pointsToPolygon(extractPolygonPoints(d)), overlapIds: [], ...(rect ? { _sourceRect: rect } : {}) };
}
function createSignal(d: DrawResult): SignalEntity {
  const source = buildSourceInfo(d);
  return { id: `signal_${nanoid(12)}`, entityType: 'signal', boundary: pointsToPolygon([]), subsignals: [], type: 'MIX_3_VERTICAL', overlapIds: [], stopLines: [pointsToCurve(extractLinePoints(d))], signInfo: [], ...(source ? { _source: source } : {}) };
}
function createStopSign(d: DrawResult): StopSignEntity {
  const source = buildSourceInfo(d);
  return { id: `stopSign_${nanoid(12)}`, entityType: 'stopSign', stopLines: [pointsToCurve(extractLinePoints(d))], type: 'ONE_WAY', overlapIds: [], ...(source ? { _source: source } : {}) };
}
function createSpeedBump(d: DrawResult): SpeedBumpEntity {
  const source = buildSourceInfo(d);
  return { id: `speedBump_${nanoid(12)}`, entityType: 'speedBump', position: [pointsToCurve(extractLinePoints(d))], overlapIds: [], ...(source ? { _source: source } : {}) };
}
function createYieldSign(d: DrawResult): YieldSignEntity {
  const source = buildSourceInfo(d);
  return { id: `yieldSign_${nanoid(12)}`, entityType: 'yieldSign', stopLines: [pointsToCurve(extractLinePoints(d))], overlapIds: [], ...(source ? { _source: source } : {}) };
}
function createClearArea(d: DrawResult): ClearAreaEntity {
  const rect = buildRectInfo(d);
  return { id: `clearArea_${nanoid(12)}`, entityType: 'clearArea', polygon: pointsToPolygon(extractPolygonPoints(d)), overlapIds: [], ...(rect ? { _sourceRect: rect } : {}) };
}
function createBarrierGate(d: DrawResult): BarrierGateEntity {
  const source = buildSourceInfo(d);
  return { id: `barrierGate_${nanoid(12)}`, entityType: 'barrierGate', type: 'ROD', polygon: pointsToPolygon([]), stopLines: [pointsToCurve(extractLinePoints(d))], overlapIds: [], ...(source ? { _source: source } : {}) };
}
function createArea(d: DrawResult): AreaEntity {
  return { id: `area_${nanoid(12)}`, entityType: 'area', type: 'Driveable', polygon: pointsToPolygon(extractPolygonPoints(d)), overlapIds: [] };
}

const FACTORY_MAP: Record<MapElementType, (d: DrawResult) => ApolloEntity> = {
  lane: createLane, junction: createJunction,
  parkingSpace: createParkingSpace, crosswalk: createCrosswalk, signal: createSignal,
  stopSign: createStopSign, speedBump: createSpeedBump, yieldSign: createYieldSign,
  clearArea: createClearArea, barrierGate: createBarrierGate, area: createArea,
};

export function createApolloEntity(
  elementType: MapElementType, drawTool: string, points: LngLat[], anchors: BezierAnchor[],
): ApolloEntity {
  return FACTORY_MAP[elementType]({ drawTool, points, anchors });
}

// ═══════════ 冷层 GeoJSON 编译 ══════════════════════════════

function curveToCoords(curve: Curve): LngLat[] {
  const coords: LngLat[] = [];
  for (const seg of curve.segments) for (const pt of seg.lineSegment.points) coords.push(toLngLat(pt));
  return coords;
}

function polygonToCoords(polygon: ApolloPolygon): LngLat[] {
  return pointsToCoords(polygon.points);
}

function centroid(coords: LngLat[]): LngLat {
  if (coords.length === 0) return [0, 0];
  return [coords.reduce((s, c) => s + c[0], 0) / coords.length, coords.reduce((s, c) => s + c[1], 0) / coords.length];
}

/** 线段几何中点（所有点的平均坐标） */
function lineMid(coords: LngLat[]): LngLat {
  if (coords.length === 0) return [0, 0];
  if (coords.length <= 2) {
    return [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
  }
  return coords[Math.floor(coords.length / 2)];
}

function mkLine(coords: LngLat[], props: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } };
}

function mkPolygon(coords: LngLat[], props: Record<string, unknown>): GeoJSON.Feature {
  const ring = coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])
    ? [...coords, coords[0]] : coords;
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function mkPoint(coord: LngLat, props: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coord } };
}

function laneDirectionLabel(entity: LaneEntity): string {
  switch (entity.direction) { case 'FORWARD': return '→'; case 'BACKWARD': return '←'; case 'BIDIRECTION': return '↔'; default: return '→'; }
}

/** 编译 Apollo 实体为冷层 GeoJSON features */
export function compileApolloFeatures(entity: ApolloEntity): GeoJSON.Feature[] {
  const color = elementColor(entity.entityType) ?? '#ffffff';
  const base: Record<string, unknown> = { color, id: entity.id, entityType: entity.entityType };
  const features: GeoJSON.Feature[] = [];

  switch (entity.entityType) {
    // ─── 车道：多边形（宽度） + 中心线（虚线） + 方向标注 ───
    case 'lane': {
      const centerPts = entity.centralCurve.segments[0]?.lineSegment.points ?? [];
      if (centerPts.length < 2) break;
      const leftW = entity.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
      const rightW = entity.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
      const leftEdge = offsetPolylineDeg(centerPts, leftW, 'left');
      const rightEdge = offsetPolylineDeg(centerPts, rightW, 'right');
      const polyCoords = [...leftEdge, ...rightEdge.reverse()].map(toLngLat);
      if (polyCoords.length >= 4) {
        features.push(mkPolygon(polyCoords, {
          ...base, fillOpacity: 0.35,
          laneType: entity.type, laneDirection: entity.direction,
        }));
      }
      // 中心虚线
      const centerCoords = pointsToCoords(centerPts);
      features.push(mkLine(centerCoords, { ...base, lineWidth: 1.5, lineOpacity: 0.5, lineDash: [4, 4], color: '#ffffff' }));
      // 方向标注
      features.push(mkPoint(lineMid(centerCoords), { ...base, role: 'label', label: laneDirectionLabel(entity), labelSize: 16 }));
      break;
    }

    // ─── 路口：多边形填充 ───
    case 'junction': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.35, lineWidth: 2 }));
      break;
    }

    // ─── 车位：多边形填充 + 🅿️ ───
    case 'parkingSpace': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.4, lineWidth: 1.5 }));
      features.push(mkPoint(centroid(coords), { ...base, role: 'label', label: '🅿️', labelSize: 18 }));
      break;
    }

    // ─── 人行横道：多边形（条纹由 fill-pattern 层） + 白色边框 ───
    case 'crosswalk': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 2.5 }));
      break;
    }

    // ─── 信号灯：线（停止线）+ 🚥 标注 ───
    case 'signal': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 4 }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0) features.push(mkPoint(lineMid(all), { ...base, role: 'label', label: '🚥', labelSize: 18 }));
      break;
    }

    // ─── 禁停区：多边形填充 + 条纹（fill-pattern 层） ───
    case 'clearArea': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 2 }));
      break;
    }

    // ─── 道闸：线 + ⛨ 标注 ───
    case 'barrierGate': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 5, dashed: true }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0) features.push(mkPoint(lineMid(all), { ...base, role: 'label', label: '⛨', labelSize: 16 }));
      break;
    }

    // ─── 区域：多边形填充 ───
    case 'area': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 1.5 }));
      break;
    }

    // ─── 停车标志：粗红线 + 🛑 标注 ───
    case 'stopSign': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 4 }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0) features.push(mkPoint(lineMid(all), { ...base, role: 'label', label: '🛑', labelSize: 16 }));
      break;
    }

    // ─── 减速带：黄色粗线 + 条纹虚线 ───
    case 'speedBump': {
      for (const curve of entity.position) {
        const c = curveToCoords(curve);
        if (c.length < 2) continue;
        // 底层实线（深色背景）
        features.push(mkLine(c, { ...base, lineWidth: 10, lineOpacity: 0.4, color: '#443300' }));
        // 顶层虚线（黄色条纹）
        features.push(mkLine(c, { ...base, lineWidth: 10, lineOpacity: 0.8, dashed: true }));
      }
      break;
    }

    // ─── 让行标志：橙线 + ⚠️ 标注 ───
    case 'yieldSign': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 3, dashed: true }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0) features.push(mkPoint(lineMid(all), { ...base, role: 'label', label: '⚠️', labelSize: 16 }));
      break;
    }

    case 'road': break;
  }

  return features;
}

export function apolloEntityCoords(entity: ApolloEntity): LngLat[] {
  const pts = getApolloEditPoints(entity);
  if (pts.length === 0) return [];
  // 对车道返回包含宽度的多边形坐标（用于更精确的 AABB）
  if (entity.entityType === 'lane') {
    const leftW = entity.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
    const rightW = entity.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
    const left = offsetPolylineDeg(pts, leftW, 'left');
    const right = offsetPolylineDeg(pts, rightW, 'right');
    return [...left, ...right].map(toLngLat);
  }
  return pointsToCoords(pts);
}

export function isApolloAreaEntity(entity: ApolloEntity): boolean {
  switch (entity.entityType) {
    case 'junction': case 'parkingSpace': case 'crosswalk':
    case 'clearArea': case 'area': case 'parkingLot': case 'pncJunction':
    case 'lane': // 车道渲染为多边形，hitTest 也用面检测
      return true;
    default: return false;
  }
}
