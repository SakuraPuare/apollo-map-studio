import { describe, expect, it } from 'vitest';
import { boundsCenter, boundsForEntity, isTinyBounds } from '../entityBounds';
import type { Curve, RoadEntity } from '@/types/apollo';
import type { RectEntity } from '@/types/entities';

const pt = (x: number, y: number) => ({ x, y });

function curve(points: { x: number; y: number }[]): Curve {
  return { segments: [{ lineSegment: { points } }] };
}

describe('entityBounds', () => {
  it('uses road section boundary edges for road bounds', () => {
    const road: RoadEntity = {
      id: 'road_1',
      entityType: 'road',
      junctionId: null,
      sections: [
        {
          id: 'section_1',
          laneIds: [],
          boundary: {
            outerPolygon: {
              edges: [
                { type: 'LEFT_BOUNDARY', curve: curve([pt(116.1, 39.1), pt(116.4, 39.2)]) },
                { type: 'RIGHT_BOUNDARY', curve: curve([pt(116.2, 39.3), pt(116.5, 39.4)]) },
              ],
            },
            holes: [],
          },
        },
      ],
    };

    expect(boundsForEntity(road)).toEqual({
      minX: 116.1,
      minY: 39.1,
      maxX: 116.5,
      maxY: 39.4,
    });
  });

  it('uses rotated rectangle corners instead of just diagonal control points', () => {
    const rect: RectEntity = {
      id: 'rect_1',
      entityType: 'rect',
      p1: pt(0, 0),
      p2: pt(2, 1),
      rotation: Math.PI / 2,
    };

    const bounds = boundsForEntity(rect);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeCloseTo(0.5);
    expect(bounds!.maxX).toBeCloseTo(1.5);
    expect(bounds!.minY).toBeCloseTo(-0.5);
    expect(bounds!.maxY).toBeCloseTo(1.5);
  });

  it('computes center and tiny-state for degenerate bounds', () => {
    const bounds = boundsForEntity({
      id: 'polyline_1',
      entityType: 'polyline',
      points: [pt(116, 39)],
    });

    expect(bounds).toEqual({ minX: 116, minY: 39, maxX: 116, maxY: 39 });
    expect(boundsCenter(bounds!)).toEqual([116, 39]);
    expect(isTinyBounds(bounds!)).toBe(true);
  });
});
