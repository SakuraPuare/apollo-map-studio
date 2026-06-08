import { describe, expect, it } from 'vitest';
import { computeStats, searchEntities } from '../panelData';
import type { LaneEntity, RoadEntity, RSUEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

function lane(id: string, junctionId: string | null = null): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: { segments: [] },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 0,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function road(id: string, laneIds: string[], junctionId: string | null = null): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [{ id: `${id}-section`, laneIds }],
    junctionId,
    type: 'CITY_ROAD',
  };
}

function rsu(id: string, junctionId: string | null = null): RSUEntity {
  return { id, entityType: 'rsu', junctionId, overlapIds: [] };
}

function drawing(id: string): MapEntity {
  return { id, entityType: 'polyline', points: [] } as MapEntity;
}

describe('panelData pure helpers', () => {
  it('computes outline stats across Apollo entities, drawings, and structural issues', () => {
    const entities = new Map<string, MapEntity>([
      ['road-1', road('road-1', ['lane-in-road'], 'missing-junction')],
      ['lane-in-road', lane('lane-in-road')],
      ['lane-orphan', lane('lane-orphan')],
      ['lane-missing-junction', lane('lane-missing-junction', 'ghost-junction')],
      ['rsu-missing-junction', rsu('rsu-missing-junction', 'ghost-junction')],
      ['draft-polyline', drawing('draft-polyline')],
    ]);

    const stats = computeStats(entities);

    expect(stats.apolloCounts.get('road')).toBe(1);
    expect(stats.apolloCounts.get('lane')).toBe(3);
    expect(stats.apolloCounts.get('rsu')).toBe(1);
    expect(stats.apolloCounts.has('polyline')).toBe(false);
    expect(stats.drawingCount).toBe(1);
    expect(stats.unparentedLanes).toBe(2);
    expect(stats.orphanedJunctionRefs).toBe(3);
  });

  it('treats lanes with valid junction parents as parented and structurally valid', () => {
    const entities = new Map<string, MapEntity>([
      [
        'junction-1',
        { id: 'junction-1', entityType: 'junction', polygon: { points: [] }, overlapIds: [] },
      ],
      ['lane-in-junction', lane('lane-in-junction', 'junction-1')],
      ['road-in-junction', road('road-in-junction', [], 'junction-1')],
      ['rsu-in-junction', rsu('rsu-in-junction', 'junction-1')],
    ]);

    const stats = computeStats(entities);

    expect(stats.unparentedLanes).toBe(0);
    expect(stats.orphanedJunctionRefs).toBe(0);
    expect(stats.apolloCounts.get('junction')).toBe(1);
  });

  it('searches by id or type case-insensitively, trims query text, and honors limits', () => {
    const entities = new Map<string, MapEntity>([
      ['Lane-Alpha', lane('Lane-Alpha')],
      ['Road-Beta', road('Road-Beta', [])],
      ['Signal-Gamma', { id: 'Signal-Gamma', entityType: 'signal' } as MapEntity],
    ]);

    expect(searchEntities(entities, ' lane ')).toEqual([{ id: 'Lane-Alpha', entityType: 'lane' }]);
    expect(searchEntities(entities, 'SIG')).toEqual([{ id: 'Signal-Gamma', entityType: 'signal' }]);
    expect(searchEntities(entities, 'a', 2)).toEqual([
      { id: 'Lane-Alpha', entityType: 'lane' },
      { id: 'Road-Beta', entityType: 'road' },
    ]);
    expect(searchEntities(entities, '')).toEqual([]);
  });
});
