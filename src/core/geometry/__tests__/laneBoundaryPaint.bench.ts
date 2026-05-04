import { bench, describe } from 'vitest';
import { findLaneBoundaryPaintHit, paintLaneBoundaryTypeAtPoint } from '../laneBoundaryPaint';
import { buildPerfEntities, makeLongLane } from '@/test/fixtures/perfEntities';
import type { LaneEntity } from '@/types/apollo';

function lanes(count: number, pointCount: number): LaneEntity[] {
  return buildPerfEntities(count, pointCount).filter((entity): entity is LaneEntity => {
    return entity.entityType === 'lane';
  });
}

describe('lane boundary brush hit testing', () => {
  for (const scale of [
    { label: '1k', count: 1_000 },
    { label: '5k', count: 5_000 },
  ]) {
    const laneSet = lanes(scale.count, 12);

    bench(`boundary brush ${scale.label} lanes — find paint hit`, () => {
      findLaneBoundaryPaintHit(laneSet, [116.40002, 39.90001]);
    });
  }

  for (const count of [100, 1_000]) {
    const lane = makeLongLane(`paint_lane_${count}`, count);

    bench(`boundary brush ${count} pts — paint lane type`, () => {
      paintLaneBoundaryTypeAtPoint(lane, [116.40002, 39.90001], 'CURB');
    });
  }
});
