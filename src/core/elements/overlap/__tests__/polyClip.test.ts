/**
 * Tests for polyClip — polygon-clipping 包装层.
 *
 * 覆盖：基本求交 / 退化输入 / 多块结果选最大 / 不相交 / 包含关系.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { intersectPolygons, largestRing } from '../polyClip';
import type { GeoPoint } from '@/types/entities';

afterEach(() => {
  vi.doUnmock('polygon-clipping');
  vi.restoreAllMocks();
});

function rect(x0: number, y0: number, x1: number, y1: number): GeoPoint[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

describe('intersectPolygons', () => {
  it('returns empty for non-overlapping rectangles', () => {
    const a = rect(0, 0, 1, 1);
    const b = rect(2, 2, 3, 3);
    expect(intersectPolygons(a, b)).toEqual([]);
  });

  it('returns the smaller rect when one contains the other', () => {
    const big = rect(0, 0, 10, 10);
    const small = rect(2, 2, 4, 4);
    const out = intersectPolygons(big, small);
    expect(out.length).toBe(1);
    // 4 corners (closed ring is dropped by fromRing)
    expect(out[0]!.length).toBe(4);
  });

  it('returns the overlapping square when rectangles partially overlap', () => {
    const a = rect(0, 0, 2, 2);
    const b = rect(1, 1, 3, 3);
    const out = intersectPolygons(a, b);
    expect(out.length).toBe(1);
    // intersection = [(1,1)-(2,1)-(2,2)-(1,2)] → area = 1
    const ring = out[0]!;
    expect(ring.length).toBe(4);
    const xs = ring.map((p) => p.x).sort();
    const ys = ring.map((p) => p.y).sort();
    expect(xs).toEqual([1, 1, 2, 2]);
    expect(ys).toEqual([1, 1, 2, 2]);
  });

  it('returns empty when input is degenerate (< 3 points)', () => {
    const tiny = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const ok = rect(0, 0, 2, 2);
    expect(intersectPolygons(tiny, ok)).toEqual([]);
    expect(intersectPolygons(ok, tiny)).toEqual([]);
  });

  it('handles closed-ring input (first == last) without doubling', () => {
    const closed: GeoPoint[] = [...rect(0, 0, 2, 2), { x: 0, y: 0 }];
    const open = rect(1, 1, 3, 3);
    const out = intersectPolygons(closed, open);
    expect(out.length).toBe(1);
    expect(out[0]!.length).toBe(4);
  });

  it('logs and returns empty when polygon clipping throws on malformed geometry', async () => {
    vi.resetModules();
    vi.doMock('polygon-clipping', () => ({
      default: {
        intersection: vi.fn(() => {
          throw new Error('bad polygon');
        }),
      },
    }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { intersectPolygons: mockedIntersectPolygons } = await import('../polyClip');

    expect(mockedIntersectPolygons(rect(0, 0, 1, 1), rect(0, 0, 1, 1))).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[polyClip] intersection failed; returning empty',
      expect.objectContaining({
        inputA: 4,
        inputB: 4,
        error: expect.any(Error),
      }),
    );
  });
});

describe('largestRing', () => {
  it('returns null on empty input', () => {
    expect(largestRing([])).toBeNull();
  });

  it('returns the only ring when length=1', () => {
    const r = rect(0, 0, 1, 1);
    expect(largestRing([r])).toBe(r);
  });

  it('picks the ring with larger absolute area', () => {
    const small = rect(0, 0, 1, 1);
    const big = rect(0, 0, 10, 10);
    expect(largestRing([small, big])).toBe(big);
    expect(largestRing([big, small])).toBe(big);
  });
});
