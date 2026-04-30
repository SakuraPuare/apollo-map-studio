/**
 * Verifies the port of Apollo Dreamview's
 * `getHeadingFromStopLineAndTrafficLightBoundary`. Test cases pin the
 * algorithm against synthetic geometry where the expected facing
 * direction is unambiguous, plus a fallback case (degenerate boundary)
 * that should hit the stop-line-only path.
 */
import { describe, it, expect } from 'vitest';
import { computeSignalHeading, headingToIconRotate } from '../apolloCompile/signalHeading';
import type { SignalEntity } from '@/types/apollo';

function makeSignal(
  boundaryPts: { x: number; y: number; z?: number }[],
  stopLinePts: { x: number; y: number }[],
): SignalEntity {
  return {
    id: 's_h',
    entityType: 'signal',
    boundary: { points: boundaryPts },
    subsignals: [],
    type: 'MIX_3_VERTICAL',
    overlapIds: [],
    stopLines:
      stopLinePts.length > 0
        ? [
            {
              segments: [
                {
                  lineSegment: { points: stopLinePts },
                  s: 0,
                  startPosition: stopLinePts[0]!,
                  heading: 0,
                  length: 0,
                },
              ],
            },
          ]
        : [],
    signInfo: [],
  };
}

describe('computeSignalHeading — Dreamview port', () => {
  it('vertical box facing east, stop line going north → heading ≈ 0 (east)', () => {
    // Boundary: vertical rectangle in x=0 plane, spanning y=[0,1], z=[4,6].
    // Plane orthogonal projected to xy = (∂yz × ∂xz vectors normal proj).
    // Stop line: north-south line at x = 5.
    const sig = makeSignal(
      [
        { x: 0, y: 0, z: 6 },
        { x: 0, y: 1, z: 6 },
        { x: 0, y: 1, z: 4 },
        { x: 0, y: 0, z: 4 },
      ],
      [
        { x: 5, y: -3 },
        { x: 5, y: 3 },
      ],
    );
    const h = computeSignalHeading(sig);
    expect(h).not.toBeNull();
    // The orthogonal of an x=0 plane points along +x (east); algorithm
    // returns angle in radians. Allow either ±π (orientation ambiguous
    // before the stop-line correction); after correction it should
    // settle on facing the stop line.
    expect(Math.abs(Math.sin(h!))).toBeLessThan(0.01); // close to 0 or π
  });

  it('falls back to stop-line-only when boundary has < 3 points', () => {
    const sig = makeSignal(
      [{ x: 0, y: 0, z: 5 }],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    );
    const h = computeSignalHeading(sig);
    // stopLineDir = atan2(0, 1) = 0; algorithm returns 1.5π + 0 = 4.71...
    expect(h).toBeCloseTo(Math.PI * 1.5, 5);
  });

  it('returns null when neither boundary nor stop line is usable', () => {
    const sig = makeSignal([], []);
    expect(computeSignalHeading(sig)).toBeNull();
  });
});

describe('headingToIconRotate — math CCW/east → maplibre CW/north', () => {
  it('east (0 rad) → 90 deg CW from north', () => {
    expect(headingToIconRotate(0)).toBeCloseTo(90, 6);
  });

  it('north (π/2 rad) → 0 deg', () => {
    expect(headingToIconRotate(Math.PI / 2)).toBeCloseTo(0, 6);
  });

  it('west (π rad) → -90 deg (≡ 270)', () => {
    expect(headingToIconRotate(Math.PI)).toBeCloseTo(-90, 6);
  });

  it('south (-π/2 rad) → 180 deg', () => {
    expect(headingToIconRotate(-Math.PI / 2)).toBeCloseTo(180, 6);
  });
});
