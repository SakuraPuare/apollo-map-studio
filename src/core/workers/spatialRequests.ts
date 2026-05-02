import type { SerializedEntity, WorkerRequest, WorkerResponse } from './protocol';
import {
  buildFeatureCollection,
  featureGroupsForState,
  groupFeaturesByEntity,
} from './spatialFeatures';
import { hitTest } from './spatialHitTest';
import { insertEntity, removeEntity, syncEntities, type SpatialState } from './spatialState';

type Respond = (msg: WorkerResponse) => void;

function addLaneDependents(state: SpatialState, id: string, affected: Set<string>) {
  affected.add(id);
  for (const dep of state.junctionGraph.getDependents(id)) affected.add(dep);
}

function collectPreMutationDependents(
  state: SpatialState,
  req: Extract<WorkerRequest, { type: 'INCREMENTAL' }>,
  affected: Set<string>,
) {
  for (const id of req.removed) {
    const entity = state.entityMap.get(id);
    if (entity?.entityType === 'lane') addLaneDependents(state, id, affected);
  }

  for (const entity of req.updated) {
    if (entity.entityType === 'lane') addLaneDependents(state, entity.id, affected);
  }
}

function applyIncrementalMutations(
  state: SpatialState,
  req: Extract<WorkerRequest, { type: 'INCREMENTAL' }>,
) {
  for (const id of req.removed) removeEntity(state, id);
  for (const entity of req.updated) {
    removeEntity(state, entity.id);
    insertEntity(state, entity);
  }
  for (const entity of req.added) insertEntity(state, entity);
}

function collectPostMutationDependents(
  state: SpatialState,
  req: Extract<WorkerRequest, { type: 'INCREMENTAL' }>,
  affected: Set<string>,
) {
  for (const entity of req.updated) {
    if (entity.entityType === 'lane') {
      for (const dep of state.junctionGraph.getDependents(entity.id)) affected.add(dep);
    }
  }

  for (const entity of req.added) {
    if (entity.entityType === 'lane') addLaneDependents(state, entity.id, affected);
  }
}

function deltaIdsFor(req: Extract<WorkerRequest, { type: 'INCREMENTAL' }>, affected: Set<string>) {
  const deltaIds = new Set<string>(affected);
  for (const e of req.updated) deltaIds.add(e.id);
  for (const e of req.added) deltaIds.add(e.id);
  for (const id of req.removed) deltaIds.delete(id);
  return deltaIds;
}

function handleSync(
  state: SpatialState,
  req: { requestId: string; entities: SerializedEntity[]; excludeId?: string | null },
  respond: Respond,
) {
  syncEntities(state, req.entities);
  buildFeatureCollection(state, req.excludeId);
  respond({
    type: 'COLD_READY',
    requestId: req.requestId,
    groups: featureGroupsForState(state, req.excludeId),
  });
}

function handleSyncBegin(state: SpatialState, req: Extract<WorkerRequest, { type: 'SYNC_BEGIN' }>) {
  state.pendingSyncs.set(req.requestId, {
    entities: [],
    total: req.total,
    excludeId: req.excludeId,
  });
}

function handleSyncChunk(state: SpatialState, req: Extract<WorkerRequest, { type: 'SYNC_CHUNK' }>) {
  const pending = state.pendingSyncs.get(req.requestId);
  if (!pending) throw new Error(`Unknown spatial SYNC request ${req.requestId}`);
  pending.entities.push(...req.entities);
  pending.total = req.total;
}

function handleSyncFinish(
  state: SpatialState,
  req: Extract<WorkerRequest, { type: 'SYNC_FINISH' }>,
  respond: Respond,
) {
  const pending = state.pendingSyncs.get(req.requestId);
  if (!pending) throw new Error(`Unknown spatial SYNC request ${req.requestId}`);
  state.pendingSyncs.delete(req.requestId);
  if (pending.entities.length !== pending.total) {
    throw new Error(
      `Spatial SYNC received ${pending.entities.length} entities; expected ${pending.total}.`,
    );
  }
  handleSync(
    state,
    { requestId: req.requestId, entities: pending.entities, excludeId: pending.excludeId },
    respond,
  );
}

function handleIncremental(
  state: SpatialState,
  req: Extract<WorkerRequest, { type: 'INCREMENTAL' }>,
  respond: Respond,
) {
  const affected = new Set<string>();
  collectPreMutationDependents(state, req, affected);
  applyIncrementalMutations(state, req);
  collectPostMutationDependents(state, req, affected);

  const deltaIds = deltaIdsFor(req, affected);
  const fc = buildFeatureCollection(state, req.excludeId, affected.size > 0 ? affected : null);
  const changed = groupFeaturesByEntity(fc.features).filter((g) => deltaIds.has(g.id));

  respond({
    type: 'COLD_DELTA',
    requestId: req.requestId,
    changed,
    removed: [...req.removed],
  });
}

export function handleRequest(state: SpatialState, req: WorkerRequest, respond: Respond) {
  switch (req.type) {
    case 'SYNC':
      handleSync(state, req, respond);
      break;
    case 'SYNC_BEGIN':
      handleSyncBegin(state, req);
      break;
    case 'SYNC_CHUNK':
      handleSyncChunk(state, req);
      break;
    case 'SYNC_FINISH':
      handleSyncFinish(state, req, respond);
      break;
    case 'INCREMENTAL':
      handleIncremental(state, req, respond);
      break;
    case 'HIT_TEST':
      respond({
        type: 'HIT_RESULT',
        requestId: req.requestId,
        hits: hitTest(state, req.point, req.radius),
      });
      break;
  }
}
