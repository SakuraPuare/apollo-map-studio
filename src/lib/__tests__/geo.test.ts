import { describe, it, expect } from 'vitest';
import { haversineMeters, polylineLengthMeters } from '../geo';
import type { GeoPoint } from '@/types/entities';

const gp = (x: number, y: number): GeoPoint => ({ x, y });

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(gp(116, 39), gp(116, 39))).toBe(0);
  });

  // 1 度纬度 ≈ 111.195 km（球面近似）
  it('one degree of latitude ≈ 111.2 km', () => {
    const d = haversineMeters(gp(116, 39), gp(116, 40));
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  // 北京纬度 39° 上，1 度经度 ≈ cos(39°) × 111.32 km ≈ 86.5 km
  it('one degree of longitude at 39°N ≈ 86.5 km', () => {
    const d = haversineMeters(gp(116, 39), gp(117, 39));
    expect(d).toBeGreaterThan(86_000);
    expect(d).toBeLessThan(87_000);
  });

  it('is symmetric', () => {
    const a = gp(116.4, 39.9);
    const b = gp(116.5, 40.0);
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe('polylineLengthMeters', () => {
  it('returns 0 for empty array', () => {
    expect(polylineLengthMeters([])).toBe(0);
  });

  it('returns 0 for single point', () => {
    expect(polylineLengthMeters([gp(116, 39)])).toBe(0);
  });

  it('matches haversineMeters for a 2-point line', () => {
    const pts = [gp(116, 39), gp(116, 40)];
    expect(polylineLengthMeters(pts)).toBeCloseTo(haversineMeters(pts[0], pts[1]), 6);
  });

  // 一条折线：沿 116 经线 39°→39.001°→39.002°。约 2 × 111 m ≈ 222 m
  it('sums segment lengths along a polyline', () => {
    const pts = [gp(116, 39), gp(116, 39.001), gp(116, 39.002)];
    const len = polylineLengthMeters(pts);
    expect(len).toBeGreaterThan(220);
    expect(len).toBeLessThan(224);
  });

  // 纯东西向 10 米级测试，用于验证 createLane 场景（小尺度）
  it('computes small lane-scale distance accurately', () => {
    // 116°, 39°N 处，Δlng = 0.0001° → 约 8.65 m
    const pts = [gp(116, 39), gp(116.0001, 39)];
    const len = polylineLengthMeters(pts);
    expect(len).toBeGreaterThan(8);
    expect(len).toBeLessThan(9.5);
  });
});
