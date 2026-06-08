import { describe, expect, it } from 'vitest';
import type { MapEntity } from '@/types/entities';
import { createSpatialState, insertEntity, syncEntities } from '../spatialState';

function parkingLot(): MapEntity {
  return {
    id: 'parking_lot_1',
    entityType: 'parkingLot',
    polygon: {
      points: [
        { x: 10, y: 20 },
        { x: 12, y: 20 },
        { x: 12, y: 22 },
        { x: 10, y: 22 },
      ],
    },
    overlapIds: [],
  } as MapEntity;
}

describe('spatialState bbox indexing', () => {
  it('uses finite entity bbox fallback for Apollo entities without cold renderers', () => {
    const state = createSpatialState();
    const entity = parkingLot();

    insertEntity(state, entity);

    expect(state.featureCache.get(entity.id)).toEqual([]);
    expect(state.itemMap.get(entity.id)).toMatchObject({
      id: entity.id,
      entityType: 'parkingLot',
      minX: 10,
      minY: 20,
      maxX: 12,
      maxY: 22,
    });
    expect(
      state.tree.search({ minX: 11, minY: 21, maxX: 11, maxY: 21 }).map((item) => item.id),
    ).toEqual([entity.id]);
  });

  it('skips entities whose compiled and fallback geometry cannot produce a finite bbox', () => {
    const state = createSpatialState();
    const rsu = { id: 'rsu_1', entityType: 'rsu', junctionId: null, overlapIds: [] } as MapEntity;
    const emptyPolyline = {
      id: 'empty_polyline',
      entityType: 'polyline',
      points: [],
    } as MapEntity;

    syncEntities(state, [rsu, emptyPolyline]);

    expect(state.itemMap.size).toBe(0);
    expect(state.tree.all()).toEqual([]);
  });
});
