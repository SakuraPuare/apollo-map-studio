import { describe, expect, it } from 'vitest';
import { DEG_TO_M, projectPoint, unprojectPoint } from '../projection';

describe('apolloCompile projection helpers', () => {
  it('projects and unprojects xy while preserving z when present', () => {
    const cosLat = 0.5;
    const projected = projectPoint({ x: 2, y: -3, z: 7 }, cosLat);

    expect(projected).toEqual({
      x: 2 * cosLat * DEG_TO_M,
      y: -3 * DEG_TO_M,
      z: 7,
    });
    expect(unprojectPoint(projected, cosLat)).toEqual({ x: 2, y: -3, z: 7 });
  });

  it('does not synthesize z for 2D points', () => {
    const cosLat = 0.75;
    const projected = projectPoint({ x: 1, y: 2 }, cosLat);
    const unprojected = unprojectPoint(projected, cosLat);

    expect(projected).not.toHaveProperty('z');
    expect(unprojected).toEqual({ x: 1, y: 2 });
    expect(unprojected).not.toHaveProperty('z');
  });
});
