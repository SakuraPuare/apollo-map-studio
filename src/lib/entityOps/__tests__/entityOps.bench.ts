import { bench, describe } from 'vitest';
import { cascadeDeleteRefsFull } from '../cascadeDeleteRefs';
import { reparent } from '../reparent';
import { buildPerfEntityMap, makePerfOverlap, makePerfRoad } from '@/test/fixtures/perfEntities';
import type { MapEntity } from '@/types/entities';

function buildReferencedMap(laneCount: number): Map<string, MapEntity> {
  const entities = buildPerfEntityMap(laneCount);
  const laneIds = Array.from({ length: laneCount }, (_, i) => `lane_${i}`);
  const road = makePerfRoad('road_0', laneIds, 20);
  entities.set(road.id, road);

  const overlapCount = Math.floor(laneCount / 20);
  for (let i = 0; i < overlapCount; i++) {
    const overlap = makePerfOverlap(
      `overlap_${i}`,
      `lane_${i * 20}`,
      `crosswalk_${i % Math.max(1, Math.floor(laneCount / 25))}`,
    );
    entities.set(overlap.id, overlap);
    const lane = entities.get(`lane_${i * 20}`);
    if (lane?.entityType === 'lane') entities.set(lane.id, { ...lane, overlapIds: [overlap.id] });
    const crosswalk = entities.get(overlap.objects[1]!.objectId);
    if (crosswalk?.entityType === 'crosswalk') {
      entities.set(crosswalk.id, { ...crosswalk, overlapIds: [overlap.id] });
    }
  }
  return entities;
}

describe('entity reference operations', () => {
  for (const scale of [
    { label: '10k', count: 10_000 },
    { label: '50k', count: 50_000 },
  ]) {
    const entities = buildReferencedMap(scale.count);
    const lane = entities.get('lane_1234');
    if (!lane) throw new Error('missing fixture lane');

    bench(`entityOps ${scale.label} — cascadeDeleteRefsFull one lane`, () => {
      cascadeDeleteRefsFull(new Set(['lane_0']), entities);
    });

    bench(`entityOps ${scale.label} — cascadeDeleteRefsFull 100 lanes`, () => {
      cascadeDeleteRefsFull(
        new Set(Array.from({ length: 100 }, (_, i) => `lane_${i * 10}`)),
        entities,
      );
    });

    bench(`entityOps ${scale.label} — reparent lane to road section`, () => {
      reparent(
        lane,
        { kind: 'roadSection', roadId: 'road_0', sectionId: 'road_0_section_0' },
        entities,
      );
    });
  }
});
