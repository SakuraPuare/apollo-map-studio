/**
 * coords — `GeoPoint ↔ LngLat` 转换层单测。
 *
 * 这层是项目内最薄的一段反腐——业务里散落的 `.map(p => [p.x, p.y])`
 * 全部经此模块统一。一旦 GeoPoint 的字段命名变了，这里第一个红。
 */
import { describe, it, expect } from 'vitest';
import { toLngLat, toGeoPoint, pointsToCoords, coordsToPoints } from '../coords';
import type { GeoPoint } from '@/types/entities';
import type { LngLat } from '../interpolate';

describe('toLngLat / toGeoPoint', () => {
  it('toLngLat 抽出 [x, y] 顺序', () => {
    const p: GeoPoint = { x: 116.4, y: 39.9 };
    expect(toLngLat(p)).toEqual([116.4, 39.9]);
  });

  it('toGeoPoint 把 [lng, lat] 还原为对象 (无 z)', () => {
    const result = toGeoPoint([116.4, 39.9]);
    expect(result).toEqual({ x: 116.4, y: 39.9 });
    expect('z' in result).toBe(false);
  });

  it('双向 round-trip 数值不丢失', () => {
    const p: GeoPoint = { x: 116.123456789, y: 39.987654321 };
    const lnglat = toLngLat(p);
    const back = toGeoPoint(lnglat);
    expect(back.x).toBe(p.x);
    expect(back.y).toBe(p.y);
  });

  it('toLngLat 忽略 z 字段（仅取 x/y）', () => {
    const p: GeoPoint = { x: 1, y: 2, z: 99 };
    expect(toLngLat(p)).toEqual([1, 2]);
  });
});

describe('pointsToCoords / coordsToPoints', () => {
  it('空数组 → 空数组', () => {
    expect(pointsToCoords([])).toEqual([]);
    expect(coordsToPoints([])).toEqual([]);
  });

  it('多点保持顺序与对应关系', () => {
    const pts: GeoPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: -3.5, y: 4.5 },
    ];
    const coords = pointsToCoords(pts);
    expect(coords).toEqual<LngLat[]>([
      [0, 0],
      [1, 2],
      [-3.5, 4.5],
    ]);
  });

  it('双向 round-trip：N 点不丢失', () => {
    const pts: GeoPoint[] = Array.from({ length: 7 }, (_, i) => ({ x: i * 0.3, y: i * -0.7 }));
    const back = coordsToPoints(pointsToCoords(pts));
    expect(back).toEqual(pts);
  });

  it('pointsToCoords 不修改输入数组', () => {
    const pts: GeoPoint[] = [{ x: 1, y: 2 }];
    const snapshot = JSON.parse(JSON.stringify(pts));
    pointsToCoords(pts);
    expect(pts).toEqual(snapshot);
  });
});
