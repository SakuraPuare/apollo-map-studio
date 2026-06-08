import { describe, expect, it } from 'vitest';
import { OVERLAP_STOPLINE_PROBE_DEG } from '@/config/mapConstants';
import {
  bboxForEntity,
  getSharedSpatialIndex,
  resetSharedSpatialIndex,
  SpatialIndex,
} from '../spatialIndex';
import {
  curve,
  entityMap,
  makeCrosswalk,
  makeJunction,
  makeLane,
  makeSpeedBump,
  makeStopSign,
  pt,
} from './testHelpers';

const square = (minX: number, minY: number, maxX: number, maxY: number) => [
  pt(minX, minY),
  pt(maxX, minY),
  pt(maxX, maxY),
  pt(minX, maxY),
];

describe('bboxForEntity', () => {
  it('returns null for degenerate lane and polygon geometries', () => {
    expect(bboxForEntity(makeLane('L', [pt(0, 0)]))).toBeNull();
    expect(bboxForEntity(makeJunction('J', [pt(0, 0), pt(1, 0)]))).toBeNull();
  });

  it('computes bboxes for lanes, polygons, stop lines, and speed bump polylines', () => {
    expect(bboxForEntity(makeLane('L', [pt(2, 3), pt(1, 5)]))).toEqual({
      minX: 1,
      minY: 3,
      maxX: 2,
      maxY: 5,
    });
    expect(bboxForEntity(makeJunction('J', square(-1, -2, 3, 4)))).toEqual({
      minX: -1,
      minY: -2,
      maxX: 3,
      maxY: 4,
    });

    const stopBox = bboxForEntity(
      makeStopSign('STOP', [curve([pt(1, 1), pt(2, 1)]), curve([pt(9, 9)])]),
    );
    expect(stopBox?.minX).toBeCloseTo(1 - OVERLAP_STOPLINE_PROBE_DEG);
    expect(stopBox?.minY).toBeCloseTo(1 - OVERLAP_STOPLINE_PROBE_DEG);
    expect(stopBox?.maxX).toBeCloseTo(2 + OVERLAP_STOPLINE_PROBE_DEG);
    expect(stopBox?.maxY).toBeCloseTo(1 + OVERLAP_STOPLINE_PROBE_DEG);

    expect(
      bboxForEntity(
        makeSpeedBump('SB', [
          curve([pt(-2, 0), pt(-1, 0)]),
          curve([pt(4, 5), pt(6, 7)]),
          curve([pt(100, 100)]),
        ]),
      ),
    ).toEqual({ minX: -2, minY: 0, maxX: 6, maxY: 7 });
  });
});

describe('SpatialIndex', () => {
  it('builds and queries bbox neighbors without returning the source node', () => {
    const lane = makeLane('L', [pt(0, 0), pt(1, 0)]);
    const junction = makeJunction('J', square(0.4, -0.1, 0.6, 0.1));
    const far = makeCrosswalk('CW_far', square(5, 5, 6, 6));
    const index = new SpatialIndex();

    index.build(entityMap(lane, junction, far));

    expect(index.size()).toBe(3);
    expect(
      index
        .queryBBox({ minX: 0.45, minY: -0.05, maxX: 0.55, maxY: 0.05 })
        .map((n) => n.id)
        .sort(),
    ).toEqual(['J', 'L']);
    expect(index.queryNeighbors('L').map((n) => n.id)).toEqual(['J']);
    expect(index.queryNeighbors('missing')).toEqual([]);
    expect(index.getBBox('J')).toEqual({ minX: 0.4, minY: -0.1, maxX: 0.6, maxY: 0.1 });
  });

  it('updates an existing id, skips same-bbox updates, and removes invalid geometry', () => {
    const index = new SpatialIndex();
    index.insert(makeJunction('J', square(0, 0, 1, 1)));
    expect(index.size()).toBe(1);
    expect(index.queryBBox({ minX: 0, minY: 0, maxX: 1, maxY: 1 }).map((n) => n.id)).toEqual(['J']);

    index.insert(makeJunction('J', square(10, 10, 11, 11)));
    expect(index.size()).toBe(1);
    expect(index.queryBBox({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toEqual([]);
    expect(index.queryBBox({ minX: 10, minY: 10, maxX: 11, maxY: 11 }).map((n) => n.id)).toEqual([
      'J',
    ]);

    index.insert(makeJunction('J', square(10, 10, 11, 11)));
    expect(index.size()).toBe(1);

    index.insert(makeJunction('J', [pt(0, 0), pt(1, 1)]));
    expect(index.size()).toBe(0);
    expect(index.getBBox('J')).toBeNull();
  });

  it('syncFromEntities removes disappeared ids and updates changed bboxes', () => {
    const index = new SpatialIndex();
    index.build(
      entityMap(makeLane('L', [pt(0, 0), pt(1, 0)]), makeCrosswalk('CW', square(3, 3, 4, 4))),
    );

    index.syncFromEntities(entityMap(makeCrosswalk('CW', square(-4, -4, -3, -3))));

    expect(index.size()).toBe(1);
    expect(index.getBBox('L')).toBeNull();
    expect(index.getBBox('CW')).toEqual({ minX: -4, minY: -4, maxX: -3, maxY: -3 });
  });

  it('syncDirty cold-builds first, then applies add/update/remove dirty ids only', () => {
    const index = new SpatialIndex();
    const initial = entityMap(
      makeLane('L', [pt(0, 0), pt(1, 0)]),
      makeJunction('J', square(0.2, -0.2, 0.3, 0.2)),
    );

    index.syncDirty(initial, new Set(['L']));
    expect(index.size()).toBe(2);

    const next = entityMap(
      makeJunction('J', square(5, 5, 6, 6)),
      makeCrosswalk('CW', square(5.5, 5.5, 6.5, 6.5)),
    );
    index.syncDirty(next, new Set(['L', 'J', 'CW']));

    expect(index.size()).toBe(2);
    expect(index.getBBox('L')).toBeNull();
    expect(
      index
        .queryBBox({ minX: 5, minY: 5, maxX: 6, maxY: 6 })
        .map((n) => n.id)
        .sort(),
    ).toEqual(['CW', 'J']);
  });

  it('clears local and shared index state', () => {
    const index = new SpatialIndex();
    index.build(entityMap(makeLane('L', [pt(0, 0), pt(1, 0)])));
    index.clear();
    expect(index.size()).toBe(0);
    expect(index.queryBBox({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toEqual([]);

    resetSharedSpatialIndex();
    const first = getSharedSpatialIndex();
    const second = getSharedSpatialIndex();
    expect(second).toBe(first);
    resetSharedSpatialIndex();
    expect(getSharedSpatialIndex()).not.toBe(first);
  });
});
