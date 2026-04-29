/**
 * Unit tests for `inferLaneTurn` — start/end heading delta classifier.
 *
 * Coordinates are lng/lat; the function projects to local ENU meters
 * before taking atan2 headings, so the test fixtures use small lng/lat
 * deltas around Beijing (≈ 116.4°E, 39.9°N) that translate to a few
 * meters in plane. Each fixture is hand-checked to land squarely
 * inside a single classification bucket (no edge-of-threshold cases).
 */
import { describe, it, expect } from 'vitest';
import { inferLaneTurn } from '../apolloCompile';
import type { GeoPoint } from '@/types/entities';

const ORIGIN: GeoPoint = { x: 116.4, y: 39.9 };

/**
 * Build a 3-point polyline so the start tangent is +x (heading 0) and
 * the end tangent is rotated by `rotationDeg`. inferLaneTurn samples
 * exactly the first/last segments, so this gives an unambiguous Δ that
 * lands inside one classification bucket.
 */
function buildLine(rotationDeg: number, stepDeg = 0.00005): GeoPoint[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const p0 = ORIGIN;
  const p1 = { x: ORIGIN.x + stepDeg, y: ORIGIN.y };
  const p2 = {
    x: p1.x + Math.cos(rad) * stepDeg,
    y: p1.y + Math.sin(rad) * stepDeg,
  };
  return [p0, p1, p2];
}

describe('inferLaneTurn', () => {
  it('returns NO_TURN for nearly straight lines', () => {
    // Straight-east polyline: every segment heading is +x.
    const straight: GeoPoint[] = Array.from({ length: 5 }, (_, i) => ({
      x: ORIGIN.x + i * 0.0001,
      y: ORIGIN.y,
    }));
    expect(inferLaneTurn(straight)).toBe('NO_TURN');
  });

  it('returns LEFT_TURN for ~90° CCW arc', () => {
    expect(inferLaneTurn(buildLine(90))).toBe('LEFT_TURN');
  });

  it('returns RIGHT_TURN for ~90° CW arc', () => {
    expect(inferLaneTurn(buildLine(-90))).toBe('RIGHT_TURN');
  });

  it('returns U_TURN for ~180° rotation', () => {
    expect(inferLaneTurn(buildLine(170))).toBe('U_TURN');
  });

  it('returns U_TURN for ~-180° rotation (CW half loop)', () => {
    expect(inferLaneTurn(buildLine(-170))).toBe('U_TURN');
  });

  it('returns NO_TURN when given < 2 points', () => {
    expect(inferLaneTurn([])).toBe('NO_TURN');
    expect(inferLaneTurn([ORIGIN])).toBe('NO_TURN');
  });

  it('classifies just-above-threshold rotations as turning, not straight', () => {
    // 30° is comfortably above the 25° NO_TURN threshold.
    expect(inferLaneTurn(buildLine(30))).toBe('LEFT_TURN');
    expect(inferLaneTurn(buildLine(-30))).toBe('RIGHT_TURN');
  });
});
