import type { GeoPoint } from '@/types/entities';

export const DEG_TO_M = 111320;

export type ProjectedPoint = { x: number; y: number; z?: number };
export type Vec2 = [number, number];

export function projectPoint(p: GeoPoint, cosLat: number): ProjectedPoint {
  return {
    x: p.x * cosLat * DEG_TO_M,
    y: p.y * DEG_TO_M,
    ...(p.z !== undefined ? { z: p.z } : {}),
  };
}

export function unprojectPoint(p: ProjectedPoint, cosLat: number): GeoPoint {
  return {
    x: p.x / (cosLat * DEG_TO_M),
    y: p.y / DEG_TO_M,
    ...(p.z !== undefined ? { z: p.z } : {}),
  };
}
