/**
 * Lane topology reconciliation — pure public entrypoint.
 *
 * Recomputes predecessor / successor / selfReverse / junctionId / neighbor
 * arrays from current lane and junction geometry, returning only changed lanes.
 */
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { buildTopologyIndices, collectAffectedLanes } from './laneTopologyIndex';
import { deriveChangesForLanes } from './laneTopologyDerive';

export interface LaneTopologyDiff {
  changes: Map<string, LaneEntity>;
}

export interface LaneTopologyIncrementalOptions {
  dirtyIds: ReadonlySet<string>;
  previousEntities?: ReadonlyMap<string, MapEntity>;
}

export function reconcileLaneTopology(entities: ReadonlyMap<string, MapEntity>): LaneTopologyDiff {
  const indices = buildTopologyIndices(entities);
  return {
    changes: deriveChangesForLanes(
      indices,
      indices.lanes.map((lane) => lane.id),
    ),
  };
}

export function reconcileLaneTopologyIncremental(
  entities: ReadonlyMap<string, MapEntity>,
  options: LaneTopologyIncrementalOptions,
): LaneTopologyDiff {
  if (options.dirtyIds.size === 0) return { changes: new Map() };
  const indices = buildTopologyIndices(entities);
  const affected = collectAffectedLanes(indices, options.dirtyIds, options.previousEntities);
  return { changes: deriveChangesForLanes(indices, affected) };
}
