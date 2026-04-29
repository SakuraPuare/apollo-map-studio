/**
 * Derivation rules for `LaneEntity`.
 *
 *   1. `lane.length`        — polyline length of `centralCurve`.
 *   2. `lane.turn`          — start/end heading delta classifier.
 *   3. `lane.boundarySeed`  — seed `boundaryType` at `s=0` so the
 *                             inspector reads the project default
 *                             instead of `'UNKNOWN'`. Create-only.
 *
 * All three are pure functions; geometry source of truth is
 * `centralCurve.segments[0].lineSegment.points`.
 */
import type { LaneEntity, BoundaryLineType } from '@/types/apollo';
import { DEFAULT_LANE_BOUNDARY_TYPE } from '@/config/mapConstants';
import { polylineLengthMeters } from '@/lib/geo';
import { inferLaneTurn } from '@/core/geometry/apolloCompile';
import type { DeriveRule } from '../types';

function centerPoints(e: LaneEntity) {
  return e.centralCurve.segments[0]?.lineSegment.points ?? [];
}

const lengthRule: DeriveRule<LaneEntity> = {
  id: 'lane.length',
  owns: ['length'],
  apply: (e) => {
    const next = polylineLengthMeters(centerPoints(e));
    return next === e.length ? e : { ...e, length: next };
  },
};

const turnRule: DeriveRule<LaneEntity> = {
  id: 'lane.turn',
  owns: ['turn'],
  apply: (e) => {
    const next = inferLaneTurn(centerPoints(e));
    return next === e.turn ? e : { ...e, turn: next };
  },
};

/**
 * Seed `boundaryType` arrays at `s=0` with the project default if
 * empty. Idempotent on re-run; create-only because mid-edit drag
 * shouldn't rewrite the array the user may have edited via inspector.
 */
const boundarySeedRule: DeriveRule<LaneEntity> = {
  id: 'lane.boundarySeed',
  owns: ['leftBoundary.boundaryType', 'rightBoundary.boundaryType'],
  on: ['create'],
  apply: (e) => {
    const seed = [{ s: 0, types: [DEFAULT_LANE_BOUNDARY_TYPE as BoundaryLineType] }];
    const leftEmpty = e.leftBoundary.boundaryType.length === 0;
    const rightEmpty = e.rightBoundary.boundaryType.length === 0;
    if (!leftEmpty && !rightEmpty) return e;
    return {
      ...e,
      leftBoundary: leftEmpty ? { ...e.leftBoundary, boundaryType: seed } : e.leftBoundary,
      rightBoundary: rightEmpty ? { ...e.rightBoundary, boundaryType: seed } : e.rightBoundary,
    };
  },
};

export const laneRules: DeriveRule<LaneEntity>[] = [lengthRule, turnRule, boundarySeedRule];
