import { describe, it, expect } from 'vitest';
import { buildSignalTemplate, regenerateSignalGeometry } from '../apolloCompile/signalTemplate';
import { haversineMeters } from '@/lib/geo';
import type { SignalEntity } from '@/types/apollo';

const ANCHOR = { x: 116.4074, y: 39.9042 }; // Beijing, picked for non-equator latitude

describe('buildSignalTemplate', () => {
  it('MIX_3_VERTICAL produces a 4-point boundary ≈ 0.63m × 1.46m', () => {
    const { boundary } = buildSignalTemplate({
      type: 'MIX_3_VERTICAL',
      anchor: ANCHOR,
      heading: 0,
    });
    expect(boundary.points).toHaveLength(4);
    // top-left vs top-right horizontal extent (perpendicular to heading=0
    // → along y). Compare in meters.
    const tl = boundary.points[0]!;
    const tr = boundary.points[1]!;
    const horizM = haversineMeters({ x: tl.x, y: tl.y }, { x: tr.x, y: tr.y });
    expect(horizM).toBeCloseTo(0.66, 1); // 1 col × 0.4 + 0.13 × 2 = 0.66m

    const bl = boundary.points[3]!;
    const vertM = (tl.z ?? 0) - (bl.z ?? 0);
    expect(vertM).toBeCloseTo(1.46, 2); // 3 rows × 0.4 + 0.13 × 2
    expect(tl.z).toBeGreaterThan(bl.z!);
  });

  it('MIX_3_VERTICAL produces 3 subsignals stacked vertically at xy = anchor', () => {
    const { subsignals } = buildSignalTemplate({
      type: 'MIX_3_VERTICAL',
      anchor: ANCHOR,
      heading: Math.PI / 2,
    });
    expect(subsignals).toHaveLength(3);
    // Synthesis path always writes a real location (vs imported subsignals
    // which may legitimately omit it — see subsignalFidelity.test.ts).
    for (const s of subsignals) expect(s.location).toBeDefined();
    const zs = subsignals.map((s) => s.location!.z!).sort((a, b) => a - b);
    // 0.40m spacing → adjacent diffs ≈ 0.4
    expect(zs[1]! - zs[0]!).toBeCloseTo(0.4, 6);
    expect(zs[2]! - zs[1]!).toBeCloseTo(0.4, 6);
    // xy of each subsignal = anchor (single column ⇒ no horizontal offset)
    for (const s of subsignals) {
      expect(s.location!.x).toBeCloseTo(ANCHOR.x, 9);
      expect(s.location!.y).toBeCloseTo(ANCHOR.y, 9);
    }
  });

  it('MIX_3_HORIZONTAL produces 3 bulbs spread perpendicular to heading', () => {
    const { subsignals, boundary } = buildSignalTemplate({
      type: 'MIX_3_HORIZONTAL',
      anchor: ANCHOR,
      heading: 0,
    });
    expect(subsignals).toHaveLength(3);
    for (const s of subsignals) expect(s.location).toBeDefined();
    // Same z (single row)
    const zs = subsignals.map((s) => s.location!.z!);
    expect(zs[0]).toBeCloseTo(zs[1]!, 6);
    expect(zs[1]).toBeCloseTo(zs[2]!, 6);
    // Spread perpendicular to heading=0 → along y
    const ys = subsignals.map((s) => s.location!.y).sort();
    const spread = haversineMeters({ x: ANCHOR.x, y: ys[0]! }, { x: ANCHOR.x, y: ys[2]! });
    expect(spread).toBeCloseTo(0.8, 1); // (3-1) × 0.4
    // Boundary horizontal extent = 3 × 0.4 + 0.13 × 2 = 1.46m
    const tl = boundary.points[0]!;
    const tr = boundary.points[1]!;
    const horizM = haversineMeters({ x: tl.x, y: tl.y }, { x: tr.x, y: tr.y });
    expect(horizM).toBeCloseTo(1.46, 2);
  });

  it('SINGLE produces 1 subsignal of CIRCLE type', () => {
    const { subsignals } = buildSignalTemplate({
      type: 'SINGLE',
      anchor: ANCHOR,
      heading: 0,
    });
    expect(subsignals).toHaveLength(1);
    expect(subsignals[0]!.type).toBe('CIRCLE');
  });
});

describe('regenerateSignalGeometry', () => {
  function emptySignal(): SignalEntity {
    return {
      id: 'sig_t',
      entityType: 'signal',
      boundary: { points: [] },
      subsignals: [],
      type: 'MIX_3_VERTICAL',
      overlapIds: [],
      stopLines: [],
      signInfo: [],
    };
  }

  it('uses stop-line midpoint as anchor and its heading for box face', () => {
    const sig: SignalEntity = {
      ...emptySignal(),
      stopLines: [
        {
          segments: [
            {
              lineSegment: {
                points: [
                  { x: 116.407, y: 39.904 },
                  { x: 116.4078, y: 39.9044 },
                ],
              },
              s: 0,
              startPosition: { x: 116.407, y: 39.904 },
              heading: 0,
              length: 0,
            },
          ],
        },
      ],
    };
    const out = regenerateSignalGeometry(sig);
    expect(out.boundary.points).toHaveLength(4);
    expect(out.subsignals).toHaveLength(3);
    // anchor = midpoint of stop line ⇒ subsignal xy near the midpoint
    expect(out.subsignals[0]!.location).toBeDefined();
    expect(out.subsignals[0]!.location!.x).toBeCloseTo(116.4074, 4);
    expect(out.subsignals[0]!.location!.y).toBeCloseTo(39.9042, 4);
  });

  it('returns the entity unchanged when no anchor is available', () => {
    const sig = emptySignal();
    const out = regenerateSignalGeometry(sig);
    expect(out).toBe(sig);
  });

  it('falls back to boundary centroid when stop lines are empty', () => {
    const sig: SignalEntity = {
      ...emptySignal(),
      boundary: {
        points: [
          { x: 116.407, y: 39.904 },
          { x: 116.4078, y: 39.904 },
          { x: 116.4078, y: 39.9044 },
          { x: 116.407, y: 39.9044 },
        ],
      },
    };
    const out = regenerateSignalGeometry(sig);
    expect(out.subsignals).toHaveLength(3);
    expect(out.boundary.points).toHaveLength(4);
  });
});
