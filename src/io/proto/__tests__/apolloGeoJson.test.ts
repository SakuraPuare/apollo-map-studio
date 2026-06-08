import { describe, expect, it } from 'vitest';
import { computeApolloMapBounds } from '../apolloGeoJson';

const p = (x: number, y: number, z?: number) => (z === undefined ? { x, y } : { x, y, z });
const badX = (y: number) => ({ x: 'bad' as never, y });
const badY = (x: number) => ({ x, y: 'bad' as never });

function curve(points: Array<{ x: number; y: number }> = []) {
  return { segment: [{ line_segment: { point: points } }] };
}

function polygon(points: Array<{ x: number; y: number }> = []) {
  return { point: points };
}

describe('computeApolloMapBounds', () => {
  it('returns null for empty or fully degenerate raw maps', () => {
    expect(computeApolloMapBounds({})).toBeNull();
    expect(
      computeApolloMapBounds({
        lane: [
          {
            central_curve: { segment: [{}, { line_segment: { point: [] } }] },
            left_boundary: {},
            right_boundary: { curve: { segment: [{ line_segment: { point: [badX(1)] } }] } },
          },
        ],
        crosswalk: [{ polygon: polygon() }, {}],
        junction: [{ polygon: {} }],
        clear_area: [{ polygon: polygon() }],
        parking_space: [{ polygon: polygon() }],
        pnc_junction: [{ polygon: polygon() }],
        ad_area: [{ polygon: polygon() }],
        barrier_gate: [{ polygon: polygon(), stop_line: [curve()] }],
        road: [{ section: [{}, { boundary: { outer_polygon: { edge: [{}] } } }] }],
        signal: [
          {
            boundary: { point: [badX(2)] },
            stop_line: [{ segment: [{ line_segment: { point: [badY(1)] } }] }],
          },
        ],
        stop_sign: [{}],
        yield: [{}],
        speed_bump: [{ position: [curve()] }],
      }),
    ).toBeNull();
  });

  it('combines every supported Apollo raw geometry family into one bound', () => {
    const bounds = computeApolloMapBounds({
      lane: [
        {
          central_curve: curve([p(10, 10), p(20, 11)]),
          left_boundary: { curve: curve([p(-5, 12)]) },
          right_boundary: { curve: curve([p(25, -2)]) },
        },
      ],
      crosswalk: [{ polygon: polygon([p(0, 30), p(1, 31)]) }],
      junction: [{ polygon: polygon([p(3, -8)]) }],
      clear_area: [{ polygon: polygon([p(40, 5)]) }],
      parking_space: [{ polygon: polygon([p(6, 50)]) }],
      pnc_junction: [{ polygon: polygon([p(61, -32)]) }],
      ad_area: [{ polygon: polygon([p(-22, 76)]) }],
      barrier_gate: [{ polygon: polygon([p(18, 4)]), stop_line: [curve([p(64, -36)])] }],
      road: [
        {
          section: [
            {
              boundary: {
                outer_polygon: {
                  edge: [{ curve: curve([p(-20, 0), p(2, 2)]) }, {}],
                },
              },
            },
          ],
        },
      ],
      signal: [{ boundary: polygon([p(4, 4)]), stop_line: [curve([p(8, -30)])] }],
      stop_sign: [{ stop_line: [curve([p(60, 1)])] }],
      yield: [{ stop_line: [curve([p(2, 74)])] }],
      speed_bump: [{ position: [curve([p(7, 70)])] }],
    });

    expect(bounds).toEqual([
      [-22, -36],
      [64, 76],
    ]);
  });

  it('handles optional containers, z values, and single-point bounds', () => {
    const bounds = computeApolloMapBounds({
      lane: [
        {
          central_curve: { segment: [{}, { line_segment: { point: [p(1, 2, 3)] } }] },
        },
      ],
      road: [{}, { section: [{}, { boundary: {} }] }],
      signal: [{}, { boundary: polygon(), stop_line: [] }],
      stop_sign: [{ stop_line: [] }],
      speed_bump: [{}],
    });

    expect(bounds).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });

  it('accumulates across multiple curve segments', () => {
    const bounds = computeApolloMapBounds({
      lane: [
        {
          central_curve: {
            segment: [
              { line_segment: { point: [p(5, 6), p(-1, 8)] } },
              {},
              { line_segment: { point: [p(4, -2)] } },
            ],
          },
        },
      ],
    });

    expect(bounds).toEqual([
      [-1, -2],
      [5, 8],
    ]);
  });
});
