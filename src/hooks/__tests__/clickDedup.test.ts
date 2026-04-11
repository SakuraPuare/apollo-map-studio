/**
 * Dblclick double-vertex regression test.
 *
 * Bug: maplibre fires `mousedown` → `click` for every press inside a dblclick
 * gesture, then a final `dblclick`. Without dedup, polyline/catmullrom/polygon/
 * bezier draw states see N+1 vertices and the FSM `removeLastPoint` action only
 * undoes one — leaving a duplicate vertex at the dblclick spot.
 *
 * Fix: useMapEventRouter shadows the 2nd input of any same-pixel + sub-350ms
 * sequence. The pure `isDuplicateInput` predicate is exported for unit testing.
 */

import { describe, it, expect } from 'vitest';
import { isDuplicateInput } from '../useMapEventRouter';

describe('isDuplicateInput (dblclick dedup)', () => {
  it('returns false when there is no previous sample', () => {
    expect(isDuplicateInput(null, { x: 100, y: 200, ts: 1000 })).toBe(false);
  });

  it('treats same pixel within 350ms as duplicate (dblclick 2nd click)', () => {
    const prev = { x: 100, y: 200, ts: 1000 };
    expect(isDuplicateInput(prev, { x: 100, y: 200, ts: 1100 })).toBe(true);
    expect(isDuplicateInput(prev, { x: 102, y: 201, ts: 1300 })).toBe(true);
  });

  it('rejects same pixel beyond 350ms (separate clicks at same spot)', () => {
    const prev = { x: 100, y: 200, ts: 1000 };
    expect(isDuplicateInput(prev, { x: 100, y: 200, ts: 1400 })).toBe(false);
  });

  it('rejects different pixel within 350ms (rapid clicks at different spots)', () => {
    const prev = { x: 100, y: 200, ts: 1000 };
    expect(isDuplicateInput(prev, { x: 110, y: 200, ts: 1050 })).toBe(false);
    expect(isDuplicateInput(prev, { x: 100, y: 215, ts: 1050 })).toBe(false);
  });

  it('uses Euclidean distance, not Manhattan', () => {
    const prev = { x: 100, y: 200, ts: 1000 };
    // dx=2, dy=2 → hypot ≈ 2.83 < 4 → still duplicate
    expect(isDuplicateInput(prev, { x: 102, y: 202, ts: 1100 })).toBe(true);
    // dx=3, dy=3 → hypot ≈ 4.24 > 4 → not duplicate
    expect(isDuplicateInput(prev, { x: 103, y: 203, ts: 1100 })).toBe(false);
  });

  it('handles dblclick simulation: 2 clicks then DOUBLE_CLICK', () => {
    // Trace a real dblclick sequence and verify FSM would see only 1 MOUSE_DOWN.
    let last: { x: number; y: number; ts: number } | null = null;
    const sentToFsm: string[] = [];
    const handleClick = (sample: { x: number; y: number; ts: number }) => {
      if (isDuplicateInput(last, sample)) {
        last = sample;
        return;
      }
      last = sample;
      sentToFsm.push(`MOUSE_DOWN@${sample.x},${sample.y}`);
    };
    const handleDblClick = () => {
      last = null;
      sentToFsm.push('DOUBLE_CLICK');
    };

    // 3 normal clicks at distinct positions
    handleClick({ x: 50, y: 50, ts: 0 });
    handleClick({ x: 80, y: 80, ts: 500 });
    handleClick({ x: 110, y: 110, ts: 1000 });
    // dblclick at (200, 200): browser fires 2 click events + 1 dblclick
    handleClick({ x: 200, y: 200, ts: 1200 });
    handleClick({ x: 200, y: 200, ts: 1280 });
    handleDblClick();

    expect(sentToFsm).toEqual([
      'MOUSE_DOWN@50,50',
      'MOUSE_DOWN@80,80',
      'MOUSE_DOWN@110,110',
      'MOUSE_DOWN@200,200', // only one of the 2 dblclick clicks survives
      'DOUBLE_CLICK',
    ]);
  });

  it('resets state after DOUBLE_CLICK so the next click is fresh', () => {
    let last: { x: number; y: number; ts: number } | null = null;
    const fired: string[] = [];
    const click = (s: { x: number; y: number; ts: number }) => {
      if (isDuplicateInput(last, s)) {
        last = s;
        return;
      }
      last = s;
      fired.push(`click@${s.x},${s.y}`);
    };
    const dbl = () => {
      last = null;
      fired.push('dbl');
    };

    click({ x: 100, y: 100, ts: 0 });
    click({ x: 100, y: 100, ts: 100 });
    dbl();
    // After dbl, even if next click happens at the same pixel within window,
    // it should NOT be deduped because the gesture is over.
    click({ x: 100, y: 100, ts: 200 });

    expect(fired).toEqual(['click@100,100', 'dbl', 'click@100,100']);
  });
});
