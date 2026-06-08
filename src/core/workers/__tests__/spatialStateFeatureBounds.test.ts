import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapEntity } from '@/types/entities';

const mockFeatures = vi.hoisted(() => new Map<string, GeoJSON.Feature[]>());

vi.mock('@/core/geometry/compile', () => ({
  compileColdFeatures: (entity: MapEntity) => mockFeatures.get(entity.id) ?? [],
  entityBBox: () => [Infinity, Infinity, -Infinity, -Infinity],
}));

function entity(id: string): MapEntity {
  return { id, entityType: 'polyline', points: [] };
}

async function loadSpatialState() {
  vi.resetModules();
  return import('../spatialState');
}

afterEach(() => {
  mockFeatures.clear();
});

describe('spatialState feature bounds', () => {
  it('indexes nested MultiPolygon and GeometryCollection feature bounds', async () => {
    mockFeatures.set('complex', [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'MultiPolygon',
              coordinates: [
                [
                  [
                    [10, 20],
                    [12, 20],
                    [12, 22],
                    [10, 20],
                  ],
                ],
                [
                  [
                    [30, 40],
                    [31, 40],
                    [31, 41],
                    [30, 40],
                  ],
                ],
              ],
            },
            {
              type: 'LineString',
              coordinates: [
                [5, 6],
                [7, 8],
              ],
            },
          ],
        },
      },
    ]);
    const { createSpatialState, insertEntity } = await loadSpatialState();
    const state = createSpatialState();

    insertEntity(state, entity('complex'));

    expect(state.itemMap.get('complex')).toMatchObject({
      minX: 5,
      minY: 6,
      maxX: 31,
      maxY: 41,
    });
  });

  it('skips compiled feature bounds containing non-finite coordinates', async () => {
    mockFeatures.set('invalid', [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [Number.NaN, 1],
            [2, Infinity],
          ],
        },
      },
    ]);
    const { createSpatialState, insertEntity } = await loadSpatialState();
    const state = createSpatialState();

    insertEntity(state, entity('invalid'));

    expect(state.itemMap.has('invalid')).toBe(false);
    expect(state.tree.all()).toEqual([]);
  });
});
