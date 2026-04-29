/**
 * 回归测试：parkingSpace 🅿️ 标签必须显示在矩形几何中心。
 *
 * 历史 bug：`rectCorners` 会把首个角点重复一遍做闭合，centroid()
 * 用顶点算术平均，第 0 个角被算了两次，结果偏向那一角。
 *
 * 修复：centroid() 改为 Shoelace 面积加权重心，自然处理闭合点。
 */
import { describe, it, expect } from 'vitest';
import { createApolloEntity, compileApolloFeatures } from '../apolloCompile';
import { rectCorners, rotatedRectFromPoints } from '../interpolate';
import type { LngLat } from '../interpolate';

function findLabel(features: GeoJSON.Feature[]): GeoJSON.Feature | undefined {
  return features.find((f) => f.properties?.role === 'label');
}

describe('parkingSpace label centering', () => {
  it('drawRotatedRect: 🅿️ at rectangle geometric center despite closure point', () => {
    // 一个 axis-aligned 矩形，3 点定义：起点、轴端、宽度点
    const a: LngLat = [116.0, 39.0];
    const b: LngLat = [116.001, 39.0]; // 主轴向 +x
    const c: LngLat = [116.001, 39.0005]; // 宽度点

    // 真实的中心：rectCorners 返回 5 点（含闭合点），取前 4 个唯一角的平均
    const r = rotatedRectFromPoints(a, b, c);
    const corners = rectCorners(r.p1, r.p2, r.rotation);
    const unique = corners.slice(0, 4);
    const expectedCenter: LngLat = [
      unique.reduce((s, p) => s + p[0], 0) / 4,
      unique.reduce((s, p) => s + p[1], 0) / 4,
    ];

    const entity = createApolloEntity('parkingSpace', 'drawRotatedRect', [a, b, c], []);
    const features = compileApolloFeatures(entity);
    const label = findLabel(features);
    expect(label).toBeDefined();
    expect(label!.geometry.type).toBe('Point');
    const [lng, lat] = (label!.geometry as GeoJSON.Point).coordinates;

    // 旧 bug 偏移约 8.6m（首角重复导致重心偏向 corner[0]）；
    // 修复后应当与 4 角平均完全一致（浮点精度内）。
    expect(lng).toBeCloseTo(expectedCenter[0], 9);
    expect(lat).toBeCloseTo(expectedCenter[1], 9);
  });

  it('drawPolygon: 🅿️ at true area-weighted centroid for irregular polygon', () => {
    // 不规则三角形：(0,0), (6,0), (0,3)
    // 顶点算术平均 = (2, 1)；真重心（面积加权）= (2, 1) — 三角形恰好两者一致
    // 改用 5 边形顶点稀密不均 + 凸多边形：顶点平均 ≠ 真重心
    const pts: LngLat[] = [
      [0, 0],
      [1, 0],
      [2, 0], // 底边稠密 3 顶点
      [2, 6],
      [0, 6],
    ];
    // 顶点算术平均 = (5/5, 12/5) = (1.0, 2.4)
    // 真面积加权重心：把它分成两个矩形 / 直接算 Shoelace：
    //   2A = 0*0-1*0 + 1*0-2*0 + 2*6-2*0 + 2*6-0*6 + 0*0-0*6
    //      = 0 + 0 + 12 + 12 + 0 = 24, A = 12
    //   6Cx*A = (0+1)*0 + (1+2)*0 + (2+2)*12 + (2+0)*12 + (0+0)*0 = 48 + 24 = 72
    //   Cx = 72 / (6*12) = 1.0
    //   6Cy*A = (0+0)*0 + (0+0)*0 + (0+6)*12 + (6+6)*12 + (6+0)*0 = 72 + 144 = 216
    //   Cy = 216 / 72 = 3.0
    // 真重心 (1.0, 3.0) ≠ 顶点平均 (1.0, 2.4)
    const entity = createApolloEntity('parkingSpace', 'drawPolygon', pts, []);
    const features = compileApolloFeatures(entity);
    const label = findLabel(features);
    expect(label).toBeDefined();
    const [lng, lat] = (label!.geometry as GeoJSON.Point).coordinates;
    expect(lng).toBeCloseTo(1.0, 9);
    expect(lat).toBeCloseTo(3.0, 9); // 旧实现会得 2.4
  });
});
