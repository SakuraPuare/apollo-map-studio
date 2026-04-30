/**
 * Overlap pipeline — lane 累计弧长缓存与投影.
 *
 * 输入是 lane.centralCurve 拼接出的 GeoPoint[] 折线；输出是
 * (segmentIndex, t∈[0,1]) → s（米，从折线起点起的累计弧长）。
 *
 * 缓存：
 *   `Map<laneId, { revision: object, prefix: number[] }>`，prefix[i] = 第 i 段
 *   起点的累计弧长。`revision` 是 lane.centralCurve 的引用 —— centerline 折线
 *   重新生成（reference 变化）时缓存自动失效。
 */
import type { GeoPoint } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';
import { haversineMeters } from '@/lib/geo';
import { getCenterline } from './geometryAdapters';

interface CacheEntry {
  /** 用于 invalidation：centerline 折线 reference 变了就重算 */
  centerline: GeoPoint[];
  /** 累计弧长，prefix[i] = 从 points[0] 到 points[i] 的累计米数；prefix[0]=0 */
  prefix: number[];
  totalLength: number;
}

const cache = new Map<string, CacheEntry>();

function buildPrefix(points: GeoPoint[]): { prefix: number[]; total: number } {
  const prefix = new Array<number>(points.length);
  prefix[0] = 0;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += haversineMeters(points[i - 1]!, points[i]!);
    prefix[i] = acc;
  }
  return { prefix, total: acc };
}

function getEntry(lane: LaneEntity): CacheEntry | null {
  const points = getCenterline(lane);
  if (points.length < 2) return null;
  const cached = cache.get(lane.id);
  if (cached && cached.centerline === points) return cached;
  const { prefix, total } = buildPrefix(points);
  const entry: CacheEntry = { centerline: points, prefix, totalLength: total };
  cache.set(lane.id, entry);
  return entry;
}

/** lane 总长（米） */
export function laneArcLength(lane: LaneEntity): number {
  return getEntry(lane)?.totalLength ?? 0;
}

/** 把 (segIdx, t) 投影到累计弧长 s（米）。越界自动钳到 [0, total]。 */
export function projectSegmentParam(lane: LaneEntity, segmentIndex: number, t: number): number {
  const entry = getEntry(lane);
  if (!entry) return 0;
  const { centerline, prefix, totalLength } = entry;
  if (segmentIndex < 0) return 0;
  if (segmentIndex >= centerline.length - 1) return totalLength;
  const a = centerline[segmentIndex]!;
  const b = centerline[segmentIndex + 1]!;
  const segLen = haversineMeters(a, b);
  const clampedT = Math.max(0, Math.min(1, t));
  return prefix[segmentIndex]! + clampedT * segLen;
}

/** 缓存失效（lane 删除时调用） */
export function invalidateLaneArcLength(laneId: string): void {
  cache.delete(laneId);
}

/** 全量清空（测试用） */
export function clearLaneArcLengthCache(): void {
  cache.clear();
}
