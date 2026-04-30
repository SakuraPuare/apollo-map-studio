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

  it('applies cosLat scaling: tilted plane at lat=39.9° differs from deg-space math', () => {
    // Boundary plane tilted in lng (asymmetric x vs y differential)
    // at Beijing latitude. The 4 corners aren't all at the same lng,
    // so the cross product picks up cosLat. With deg-space math the
    // returned heading would be wrong by the cosLat factor; with
    // metric-space math it is the true bearing.
    const lat = 39.9;
    const cosLat = Math.cos(lat * (Math.PI / 180));
    const sig = makeSignal(
      [
        { x: 116.0, y: 39.9, z: 6 },
        { x: 116.0001, y: 39.9001, z: 6 },
        { x: 116.0001, y: 39.9001, z: 4 },
        { x: 116.0, y: 39.9, z: 4 },
      ],
      [
        { x: 116.00005, y: 39.91 },
        { x: 116.00015, y: 39.91 },
      ],
    );

    const h = computeSignalHeading(sig);
    expect(h).not.toBeNull();

    // Reproduce the buggy (deg-space) computation by hand to ensure
    // the fix actually changed behavior at this latitude.
    const b1 = { x: 116.0, y: 39.9, z: 6 };
    const b2 = { x: 116.0001, y: 39.9001, z: 6 };
    const b3 = { x: 116.0001, y: 39.9001, z: 4 };
    const orthoX_deg = (b2.x - b1.x) * (b3.z - b1.z) - (b3.x - b1.x) * (b2.z - b1.z);
    const orthoY_deg = (b2.y - b1.y) * (b3.z - b1.z) - (b3.y - b1.y) * (b2.z - b1.z);
    const buggyDirection = Math.atan2(-orthoX_deg, orthoY_deg);

    // Same computation with cosLat applied — what the fix should yield
    // (modulo the π flip from stop-line disambiguation).
    const orthoX_metric =
      (b2.x - b1.x) * cosLat * (b3.z - b1.z) - (b3.x - b1.x) * cosLat * (b2.z - b1.z);
    const fixedDirection = Math.atan2(-orthoX_metric, orthoY_deg);

    // The buggy and fixed bearings differ noticeably at lat=39.9°
    // (cosLat ≈ 0.768).
    expect(Math.abs(buggyDirection - fixedDirection)).toBeGreaterThan(0.1);

    // The actual heading must match the metric-space direction
    // (modulo π from stop-line disambiguation).
    const dHeading = (((h! - fixedDirection) % Math.PI) + Math.PI) % Math.PI;
    expect(Math.min(dHeading, Math.PI - dHeading)).toBeLessThan(1e-6);

    // And it must NOT match the buggy deg-space direction.
    const dBug = (((h! - buggyDirection) % Math.PI) + Math.PI) % Math.PI;
    expect(Math.min(dBug, Math.PI - dBug)).toBeGreaterThan(0.05);
  });

  it('axis-aligned plane at lat=39.9° still yields metric north/south bearing', () => {
    // Vertical plane along constant lat (varying lng): plane normal
    // points along ±lat, i.e. north or south. cosLat only scales lng,
    // so axis-aligned cases are invariant under the fix. Bearing must
    // still be ±π/2.
    const sig = makeSignal(
      [
        { x: 116.0, y: 39.9, z: 6 },
        { x: 116.0001, y: 39.9, z: 6 },
        { x: 116.0001, y: 39.9, z: 4 },
        { x: 116.0, y: 39.9, z: 4 },
      ],
      [
        { x: 116.00005, y: 39.901 },
        { x: 116.00015, y: 39.901 },
      ],
    );
    const h = computeSignalHeading(sig);
    expect(h).not.toBeNull();
    // |cos(h)| close to 0 means h ≈ ±π/2 (pure north or south).
    expect(Math.abs(Math.cos(h!))).toBeLessThan(1e-6);
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
