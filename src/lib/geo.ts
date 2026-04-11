/**
 * 地理测量工具（纯函数，无依赖）
 *
 * Apollo 的 GeoPoint 使用经纬度表示（x=lng, y=lat，单位：度）。
 * 本模块提供经纬度 → 米的距离测量工具，给 Lane.length 等字段用。
 *
 * 设计原则：
 *   - 零外部依赖（不引入 turf）
 *   - haversine 公式，球面近似足够（车道尺度误差 < 0.5%）
 *   - 只在本文件内暴露 API，不污染 geometry/coords 层
 */
import type { GeoPoint } from '@/types/entities';

/** 地球平均半径（米），WGS84 近似 */
const EARTH_RADIUS_M = 6_371_008.8;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Haversine 公式：两经纬点（度）之间的大圆距离（米）
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = a.y * DEG_TO_RAD;
  const lat2 = b.y * DEG_TO_RAD;
  const dLat = (b.y - a.y) * DEG_TO_RAD;
  const dLng = (b.x - a.x) * DEG_TO_RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 折线总长度（米）。少于 2 个点时返回 0。
 * 用于 LaneEntity.length 的计算。
 */
export function polylineLengthMeters(points: readonly GeoPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!, points[i]!);
  }
  return total;
}
