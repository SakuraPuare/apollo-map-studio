/**
 * Overlap pipeline — entity → 几何原语提取器.
 *
 * 把 14 种 Apollo 实体的几何表达统一抽象为四类原语：
 *   - centerline (lane.centralCurve)        → polyline
 *   - polygon   (junction/crosswalk/...)    → closed ring
 *   - stopLines (signal/stopSign/...)       → polyline[]（一个实体可挂多条）
 *   - polylines (speedBump.position)        → polyline[]
 *
 * 所有 getter 返回 `null` 表示该实体不参与 overlap 配对。
 */
import type { GeoPoint } from '@/types/entities';
import type {
  ApolloEntity,
  Curve,
  LaneEntity,
  SignalEntity,
  StopSignEntity,
  YieldSignEntity,
  BarrierGateEntity,
  SpeedBumpEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

/** Curve → polyline（拼接所有 segment 的 lineSegment.points） */
function curveToPolyline(curve: Curve): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const seg of curve.segments) {
    const pts = seg.lineSegment.points;
    if (pts.length === 0) continue;
    if (out.length > 0) {
      const last = out[out.length - 1]!;
      const first = pts[0]!;
      if (last.x === first.x && last.y === first.y) {
        for (let i = 1; i < pts.length; i++) out.push(pts[i]!);
        continue;
      }
    }
    for (const p of pts) out.push(p);
  }
  return out;
}

/** Lane centerline 折线（米空间投影前的原始 lng/lat 点） */
export function getCenterline(lane: LaneEntity): GeoPoint[] {
  return curveToPolyline(lane.centralCurve);
}

/** 多边形闭环（不闭合时返回原数组；caller 自己看 length>=3） */
export function getPolygon(entity: MapEntity): GeoPoint[] | null {
  const e = entity as ApolloEntity;
  switch (e.entityType) {
    case 'junction':
    case 'crosswalk':
    case 'clearArea':
    case 'parkingSpace':
    case 'parkingLot':
    case 'pncJunction':
    case 'area':
    case 'speedControl':
    case 'barrierGate':
      return e.polygon.points;
    case 'signal':
      return (e as SignalEntity).boundary.points;
    default:
      return null;
  }
}

/** 停止线集合（信号灯 / 停车牌 / 让行牌 / 道闸） */
export function getStopLines(entity: MapEntity): GeoPoint[][] {
  const e = entity as ApolloEntity;
  let curves: Curve[] | undefined;
  switch (e.entityType) {
    case 'signal':
      curves = (e as SignalEntity).stopLines;
      break;
    case 'stopSign':
      curves = (e as StopSignEntity).stopLines;
      break;
    case 'yieldSign':
      curves = (e as YieldSignEntity).stopLines;
      break;
    case 'barrierGate':
      curves = (e as BarrierGateEntity).stopLines;
      break;
    default:
      return [];
  }
  if (!curves) return [];
  const out: GeoPoint[][] = [];
  for (const c of curves) {
    const poly = curveToPolyline(c);
    if (poly.length >= 2) out.push(poly);
  }
  return out;
}

/** 折线集合（speedBump.position 是 Curve[]，每条作为一条折线） */
export function getPolylines(entity: MapEntity): GeoPoint[][] {
  const e = entity as ApolloEntity;
  if (e.entityType !== 'speedBump') return [];
  const sp = e as SpeedBumpEntity;
  const out: GeoPoint[][] = [];
  for (const c of sp.position) {
    const poly = curveToPolyline(c);
    if (poly.length >= 2) out.push(poly);
  }
  return out;
}

/** 该实体是否参与 overlap 计算（filter 用） */
export function isOverlapParticipant(entity: MapEntity): boolean {
  const e = entity as ApolloEntity;
  switch (e.entityType) {
    case 'lane':
    case 'junction':
    case 'crosswalk':
    case 'clearArea':
    case 'parkingSpace':
    case 'pncJunction':
    case 'area':
    case 'signal':
    case 'stopSign':
    case 'yieldSign':
    case 'barrierGate':
    case 'speedBump':
      return true;
    default:
      return false;
  }
}
