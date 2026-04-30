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

describe('idGenerator — entityIdPrefix (Apollo official conventions)', () => {
  it('maps Apollo-confirmed prefixes (lowercase or upper-case abbreviations)', () => {
    // Apollo borregas observed: lane_N, road_N, signal_N, stopsign_N, J_N, CW_N
    expect(entityIdPrefix('lane')).toBe('lane');
    expect(entityIdPrefix('road')).toBe('road');
    expect(entityIdPrefix('signal')).toBe('signal');
    expect(entityIdPrefix('stopSign')).toBe('stopsign');
    expect(entityIdPrefix('junction')).toBe('J');
    expect(entityIdPrefix('crosswalk')).toBe('CW');
    expect(entityIdPrefix('rsu')).toBe('RSU');
    // Inferred from concatenated-lowercase pattern (no Apollo data sample)
    expect(entityIdPrefix('pncJunction')).toBe('PNCJ');
    expect(entityIdPrefix('parkingSpace')).toBe('parkingspace');
    expect(entityIdPrefix('overlap')).toBe('overlap');
    expect(entityIdPrefix('region')).toBe('region');
  });

  it('falls back to first-letter-uppercased for unknown types', () => {
    expect(entityIdPrefix('frob')).toBe('Frob');
  });
});

describe('idGenerator — nextEntityId', () => {
  it('starts at 1 for empty store', () => {
    const entities = new Map<string, MapEntity>();
    expect(nextEntityId('lane', entities)).toBe('lane_1');
  });

  it('increments past the highest existing number per type', () => {
    const entities = new Map<string, MapEntity>();
    entities.set('lane_1', makeLane('lane_1'));
    entities.set('lane_5', makeLane('lane_5'));
    entities.set('lane_3', makeLane('lane_3'));
    expect(nextEntityId('lane', entities)).toBe('lane_6');
  });

  it('ignores legacy nanoid-style ids', () => {
    const entities = new Map<string, MapEntity>();
    entities.set('lane_SH0Wqv1X8lnb', makeLane('lane_SH0Wqv1X8lnb'));
    entities.set('lane_abc', makeLane('lane_abc'));
    expect(nextEntityId('lane', entities)).toBe('lane_1');
  });

  it('scopes counter per entity type with Apollo prefixes', () => {
    const entities = new Map<string, MapEntity>();
    entities.set('lane_2', makeLane('lane_2'));
    entities.set('J_4', makeJunction('J_4'));
    expect(nextEntityId('lane', entities)).toBe('lane_3');
    expect(nextEntityId('junction', entities)).toBe('J_5');
    expect(nextEntityId('signal', entities)).toBe('signal_1');
    expect(nextEntityId('crosswalk', entities)).toBe('CW_1');
  });

  it('uses fallback counter when entities map is omitted', () => {
    const a = nextEntityId('rect');
    const b = nextEntityId('rect');
    expect(a).not.toBe(b);
    expect(a.startsWith('rect_')).toBe(true);
    expect(b.startsWith('rect_')).toBe(true);
  });
});

describe('idGenerator — nextSubId', () => {
  it('starts at 1 for empty list', () => {
    expect(nextSubId(SUB_PREFIX.passage, [])).toBe('passage_1');
  });

  it('increments past existing sub-ids', () => {
    expect(nextSubId(SUB_PREFIX.passageGroup, ['passagegroup_1', 'passagegroup_3'])).toBe(
      'passagegroup_4',
    );
  });

  it('ignores ids that do not match the prefix pattern', () => {
    expect(nextSubId(SUB_PREFIX.section, ['sec_xyz', 'section_2'])).toBe('section_3');
  });
});
