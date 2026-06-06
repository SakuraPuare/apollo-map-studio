import type { Projection } from '@/io/proto/projection';
import type { ScenarioDoc, WorldPoint } from '@/types/scenario';

/** [lng, lat] tuple（MapLibre 坐标）。 */
export type LngLat = [number, number];

/**
 * 场景坐标桥：世界米（UTM-like）↔ lngLat。
 *
 * 模型内部一律存世界米；仅在渲染 / 交互边界经此模块投影，避免反复 round-trip
 * 带来的浮点漂移污染 round-trip 保真度（见 [[apollo-scenario-format]]）。
 */

/** 世界点 → [lng, lat]。 */
export function worldToLngLat(proj: Projection, p: { x: number; y: number }): LngLat {
  const { x, y } = proj.toLonLat({ x: p.x, y: p.y });
  return [x, y];
}

/** [lng, lat] → 世界点 {x, y}。 */
export function lngLatToWorld(
  proj: Projection,
  lng: number,
  lat: number,
): { x: number; y: number } {
  const { x, y } = proj.fromLonLat({ x: lng, y: lat });
  return { x, y };
}

/** 批量世界点 → lngLat 折线坐标。 */
export function worldPathToLngLat(
  proj: Projection,
  pts: Array<{ x: number; y: number }>,
): LngLat[] {
  return pts.map((p) => worldToLngLat(proj, p));
}

/**
 * 计算整份场景在 WGS84 下的包围盒，用于 `map.fitBounds`。
 * 收集 ego start/end/waypoints、所有障碍物位置+轨迹、红绿灯位置。
 * 返回 `[[west, south], [east, north]]`，无点时返回 null。
 */
export function scenarioBoundsLngLat(
  proj: Projection,
  doc: ScenarioDoc,
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let count = 0;

  const add = (p: { x: number; y: number }) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const [lng, lat] = worldToLngLat(proj, p);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
    count++;
  };

  add(doc.ego.start);
  add(doc.ego.end);
  doc.ego.waypoints.forEach(add);
  for (const ob of doc.obstacles) {
    add(ob.position);
    ob.trajectory.forEach(add);
  }
  for (const tl of doc.trafficLights) add(tl.location);

  if (count === 0) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

// ─── pure geometry in world meters (no projection) ──────────────────────────

/**
 * 障碍物有向包围盒的 4 个角点（世界米，闭合时需自行回到首点）。
 * 局部系：x 沿 heading（车长方向），y 垂直（车宽方向）。heading 缺省 0。
 * 顺序：右前、左前、左后、右后（CCW 视投影定义，渲染用 polygon 即可）。
 */
export function obstacleBoxCorners(
  position: WorldPoint,
  length: number,
  width: number,
): WorldPoint[] {
  const h = typeof position.h === 'number' ? position.h : 0;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  const hl = length / 2;
  const hw = width / 2;
  // 局部角点 (forward, left)
  const local: Array<[number, number]> = [
    [hl, hw],
    [hl, -hw],
    [-hl, -hw],
    [-hl, hw],
  ];
  return local.map(([fx, fy]) => ({
    x: position.x + fx * cos - fy * sin,
    y: position.y + fx * sin + fy * cos,
  }));
}

/** heading 方向的箭头尖端点（世界米），用于画朝向。length 为箭杆长度（米）。 */
export function headingArrowTip(position: WorldPoint, length: number): WorldPoint {
  const h = typeof position.h === 'number' ? position.h : 0;
  return { x: position.x + Math.cos(h) * length, y: position.y + Math.sin(h) * length };
}
