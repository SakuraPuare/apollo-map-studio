import { describe, it, expect } from 'vitest';
import { entityIdPrefix, nextEntityId, nextSubId, SUB_PREFIX } from '@/lib/idGenerator';
import type { LaneEntity, JunctionEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

function makeLane(id: string): LaneEntity {
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
    junctionId: null,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function makeJunction(id: string): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: { points: [] },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

describe('idGenerator — entityIdPrefix', () => {
  it('maps known entity types to PascalCase / acronym prefixes', () => {
    expect(entityIdPrefix('lane')).toBe('Lane');
    expect(entityIdPrefix('pncJunction')).toBe('PNCJunction');
    expect(entityIdPrefix('rsu')).toBe('RSU');
    expect(entityIdPrefix('parkingSpace')).toBe('ParkingSpace');
  });

  it('falls back to first-letter-uppercased for unknown types', () => {
    expect(entityIdPrefix('frob')).toBe('Frob');
  });
});

describe('idGenerator — nextEntityId', () => {
  it('starts at 1 for empty store', () => {
    const entities = new Map<string, MapEntity>();
    expect(nextEntityId('lane', entities)).toBe('Lane_1');
  });

  it('increments past the highest existing number per type', () => {
    const entities = new Map<string, MapEntity>();
    entities.set('Lane_1', makeLane('Lane_1'));
    entities.set('Lane_5', makeLane('Lane_5'));
    entities.set('Lane_3', makeLane('Lane_3'));
    expect(nextEntityId('lane', entities)).toBe('Lane_6');
  });

  it('ignores legacy nanoid-style ids', () => {
    const entities = new Map<string, MapEntity>();
    entities.set('lane_SH0Wqv1X8lnb', makeLane('lane_SH0Wqv1X8lnb'));
    entities.set('lane_abc', makeLane('lane_abc'));
    expect(nextEntityId('lane', entities)).toBe('Lane_1');
  });

  it('scopes counter per entity type', () => {
    const entities = new Map<string, MapEntity>();
    entities.set('Lane_2', makeLane('Lane_2'));
    entities.set('Junction_4', makeJunction('Junction_4'));
    expect(nextEntityId('lane', entities)).toBe('Lane_3');
    expect(nextEntityId('junction', entities)).toBe('Junction_5');
    expect(nextEntityId('signal', entities)).toBe('Signal_1');
  });

  it('uses fallback counter when entities map is omitted', () => {
    const a = nextEntityId('rect');
    const b = nextEntityId('rect');
    expect(a).not.toBe(b);
    expect(a.startsWith('Rect_')).toBe(true);
    expect(b.startsWith('Rect_')).toBe(true);
  });
});

describe('idGenerator — nextSubId', () => {
  it('starts at 1 for empty list', () => {
    expect(nextSubId(SUB_PREFIX.passage, [])).toBe('Passage_1');
  });

  it('increments past existing sub-ids', () => {
    expect(nextSubId(SUB_PREFIX.passageGroup, ['PassageGroup_1', 'PassageGroup_3'])).toBe(
      'PassageGroup_4',
    );
  });

  it('ignores ids that do not match the prefix pattern', () => {
    expect(nextSubId(SUB_PREFIX.section, ['sec_xyz', 'Section_2'])).toBe('Section_3');
  });
});
