/**
 * apolloEntityCoords — 车道 hitTest 多边形必须为不自交闭环
 *
 * 回归：zoom ≥ 19 时点击车道内部 miss
 * 根因：旧实现 `[...left, ...right]` 直接拼接左右边线，形成 figure-8 自交多边形。
 *   pointInPolygon 对车道内部多数点返回 false，hitTest 退化为点到边线最短距离 ≈
 *   车道半宽 (≈1.75m)。zoom 19 像素半径 ≈1.49m < 半宽 → 点击 miss。
 * 修复：`[...left, ...right.reverse()]` 与 compileApolloFeatures 中渲染多边形构造一致。
 */
import { describe, it, expect } from 'vitest';
import { createApolloEntity, pointsToCurve } from '../apolloCompile';
import { entityCoords } from '../compile';
import { pointInPolygon } from '../hitTest';
import type { LaneEntity } from '@/types/apollo';
import type { LngLat } from '../interpolate';

const pt = (x: number, y: number) => ({ x, y });

describe('apolloEntityCoords — lane 多边形不自交', () => {
  it('车道中心线上的点（应在车道内部）pointInPolygon = true', () => {
    const start: LngLat = [116.4, 39.9];
    const end: LngLat = [116.4005, 39.9];
    const lane = createApolloEntity('lane', 'drawPolyline', [start, end], []) as LaneEntity;

    const coords = entityCoords(lane);
    expect(coords.length).toBeGreaterThanOrEqual(4);

    // 中心线上若干采样点 — 全部应判为多边形内
    for (let t = 0.1; t <= 0.9; t += 0.2) {
      const mid: LngLat = [start[0] + t * (end[0] - start[0]), start[1]];
      expect(pointInPolygon(mid, coords)).toBe(true);
    }
  });

  it('远离车道的点 pointInPolygon = false', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [116.4, 39.9],
        [116.4005, 39.9],
      ],
      [],
    ) as LaneEntity;

    const coords = entityCoords(lane);
    // 几公里以外
    expect(pointInPolygon([117.0, 40.0], coords)).toBe(false);
  });

  it('导入 lane 有显式边界时，hitTest 多边形使用原始边界多段线', () => {
    const lane = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [116, 39.9],
        [116.0005, 39.9002],
        [116.001, 39.9],
      ],
      [],
    ) as LaneEntity;
    const leftBoundary = [pt(116, 39.901), pt(116.001, 39.901)];
    const rightBoundary = [pt(116, 39.899), pt(116.0005, 39.8988), pt(116.001, 39.899)];
    lane.leftBoundary.curve = pointsToCurve(leftBoundary);
    lane.rightBoundary.curve = pointsToCurve(rightBoundary);

    expect(entityCoords(lane)).toEqual([
      [116, 39.901],
      [116.001, 39.901],
      [116.001, 39.899],
      [116.0005, 39.8988],
      [116, 39.899],
    ]);
  });
});
