/// <reference lib="webworker" />
import { decodeMapBin, encodeMapBin } from './proto/binCodec';
import { decodeMapText, encodeMapText } from './proto/textCodec';
import {
  apolloMapFromLonLat,
  apolloMapToLonLat,
  entityCounts,
  readHeaderProjString,
} from './proto/adapter';
import { apolloMapToEntities, entitiesToApolloMap } from './proto/entityBridge';
import { computeApolloMapBounds } from './proto/apolloGeoJson';
import { createBlankApolloMap, setApolloMapBounds } from './proto/blankApolloMap';
import {
  hydrateEntitySourcesFromEditorMeta,
  writeEntitySourcesToEditorMeta,
} from './proto/editorMeta';
import { reconcileLaneTopology } from '@/core/geometry/laneTopology';
import { reconcileOverlaps } from '@/core/elements/overlap';
import { SpatialIndex } from '@/core/elements/overlap/spatialIndex';
import type { ApolloMapBounds, ApolloMapHeader, ApolloMapImportInfo } from '@/store/apolloMapStore';
import type { MapEntity } from '@/types/entities';
import type {
  ApolloExportBaseMapSource,
  ApolloExportFormat,
  ApolloIOProgress,
  ApolloIORequest,
  ApolloIOResponse,
  ApolloImportStats,
} from './apolloIOProtocol';

declare const self: DedicatedWorkerGlobalScope;

let cachedRawLonLatMap: Record<string, unknown> | null = null;
let cachedRawLonLatMapSource: ApolloExportBaseMapSource | null = null;
const IMPORT_ENTITY_CHUNK_SIZE = 2_000;
const TEXT_DECODER = new TextDecoder();
const TEXT_ENCODER = new TextEncoder();

interface PendingExport {
  format: ApolloExportFormat;
  baseMapSource: ApolloExportBaseMapSource;
  projString: string;
  entities: MapEntity[];
  total: number;
}

const pendingExports = new Map<string, PendingExport>();

function post(msg: ApolloIOResponse) {
  self.postMessage(msg);
}

function postWithTransfer(msg: ApolloIOResponse, transfer: Transferable[]) {
  self.postMessage(msg, transfer);
}

function progress(requestId: string, update: ApolloIOProgress) {
  post({ type: 'PROGRESS', requestId, progress: update });
}

function elapsed(start: number): number {
  return Math.round((performance.now() - start) * 10) / 10;
}

function fail(requestId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  post({ type: 'ERROR', requestId, message, stack });
}

function postImportEntities(requestId: string, entities: MapEntity[]) {
  for (let offset = 0; offset < entities.length; offset += IMPORT_ENTITY_CHUNK_SIZE) {
    post({
      type: 'IMPORT_ENTITIES_CHUNK',
      requestId,
      entities: entities.slice(offset, offset + IMPORT_ENTITY_CHUNK_SIZE),
      offset,
      total: entities.length,
    });
  }
}

function cloneHeader(map: Record<string, unknown>): ApolloMapHeader | null {
  const header = map.header;
  if (!header || typeof header !== 'object') return null;
  return structuredClone(header) as ApolloMapHeader;
}

async function requestProjection(requestId: string): Promise<string> {
  post({ type: 'NEEDS_PROJECTION', requestId });
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<ApolloIORequest>) => {
      const msg = event.data;
      if (msg.type !== 'RESOLVE_PROJECTION' || msg.requestId !== requestId) return;
      self.removeEventListener('message', onMessage);
      resolve(msg.projString);
    };
    self.addEventListener('message', onMessage);
  });
}

function applyImportTopology(entities: MapEntity[]): {
  entities: MapEntity[];
  topologyMs: number;
  overlapMs: number;
} {
  const entityMap = new Map<string, MapEntity>();
  for (const entity of entities) entityMap.set(entity.id, entity);

  const topologyStart = performance.now();
  const { changes: topoChanges } = reconcileLaneTopology(entityMap);
  for (const [id, entity] of topoChanges) entityMap.set(id, entity);
  const topologyMs = elapsed(topologyStart);

  const overlapStart = performance.now();
  const patch = reconcileOverlaps(entityMap, { mode: 'full' }, new SpatialIndex());
  for (const id of patch.removedOverlapIds) entityMap.delete(id);
  for (const [id, entity] of patch.changes) entityMap.set(id, entity);
  const overlapMs = elapsed(overlapStart);

  return { entities: Array.from(entityMap.values()), topologyMs, overlapMs };
}

async function runImport(
  requestId: string,
  filename: string,
  decode: () => Promise<Record<string, unknown>>,
): Promise<void> {
  const totalStart = performance.now();

  progress(requestId, {
    label: 'Importing Apollo map',
    detail: 'Decoding protobuf',
    progress: 0.1,
  });
  const decodeStart = performance.now();
  const decodedEnu = await decode();
  const decodeMs = elapsed(decodeStart);

  let projString = readHeaderProjString(decodedEnu);
  if (!projString) {
    progress(requestId, {
      label: 'Importing Apollo map',
      detail: 'Waiting for projection',
      progress: 0.2,
    });
    projString = await requestProjection(requestId);
  }

  progress(requestId, {
    label: 'Importing Apollo map',
    detail: 'Projecting coordinates',
    progress: 0.3,
  });
  const projectStart = performance.now();
  const { map: lonLatMap, projString: usedProj } = await apolloMapToLonLat(decodedEnu, projString);
  const projectMs = elapsed(projectStart);
  cachedRawLonLatMap = lonLatMap;
  cachedRawLonLatMapSource = 'cached';

  progress(requestId, {
    label: 'Importing Apollo map',
    detail: 'Building editable entities',
    progress: 0.58,
  });
  const bridgeStart = performance.now();
  const baseEntities = hydrateEntitySourcesFromEditorMeta(
    lonLatMap,
    apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]),
  );
  const bounds = computeApolloMapBounds(
    lonLatMap as Parameters<typeof computeApolloMapBounds>[0],
  ) as ApolloMapBounds | null;
  const bridgeMs = elapsed(bridgeStart);

  progress(requestId, {
    label: 'Importing Apollo map',
    detail: 'Recomputing topology and overlaps',
    progress: 0.75,
  });
  const processed = applyImportTopology(baseEntities);

  const info: ApolloMapImportInfo = {
    source: 'imported',
    filename,
    counts: entityCounts(lonLatMap),
    projString: usedProj,
    importedAt: Date.now(),
  };
  const stats: ApolloImportStats = {
    decodeMs,
    projectMs,
    bridgeMs,
    topologyMs: processed.topologyMs,
    overlapMs: processed.overlapMs,
    totalMs: elapsed(totalStart),
  };

  progress(requestId, { label: 'Importing Apollo map', detail: 'Sending entities', progress: 0.9 });
  postImportEntities(requestId, processed.entities);
  progress(requestId, { label: 'Importing Apollo map', detail: 'Applying result', progress: 0.98 });
  post({
    type: 'IMPORT_RESULT',
    requestId,
    info,
    header: cloneHeader(lonLatMap),
    bounds,
    stats,
  });
}

async function runExport(
  requestId: string,
  entities: MapEntity[],
  projString: string,
  format: 'bin' | 'txt',
  baseMapSource: ApolloExportBaseMapSource,
): Promise<void> {
  if (!cachedRawLonLatMap && baseMapSource === 'cached') {
    throw new Error('No imported Apollo map is cached in the IO worker.');
  }

  progress(requestId, {
    label: 'Exporting Apollo map',
    detail: 'Recomputing overlaps',
    progress: 0.12,
  });
  const processed = applyImportTopology(entities);

  progress(requestId, {
    label: 'Exporting Apollo map',
    detail: 'Merging editor entities',
    progress: 0.35,
  });
  const shouldCacheBlankMap = baseMapSource === 'blank';
  const canUseCachedBlankMap =
    shouldCacheBlankMap && cachedRawLonLatMap !== null && cachedRawLonLatMapSource === 'blank';
  const baseMap = shouldCacheBlankMap
    ? canUseCachedBlankMap
      ? cachedRawLonLatMap!
      : createBlankApolloMap(projString)
    : cachedRawLonLatMap!;
  const merged = entitiesToApolloMap(baseMap, processed.entities);
  writeEntitySourcesToEditorMeta(merged, processed.entities);

  progress(requestId, {
    label: 'Exporting Apollo map',
    detail: 'Projecting coordinates',
    progress: 0.55,
  });
  const { map: enuMap } = await apolloMapFromLonLat(merged, projString);
  if (shouldCacheBlankMap) {
    const bounds = computeApolloMapBounds(
      enuMap as Parameters<typeof computeApolloMapBounds>[0],
    ) as ApolloMapBounds | null;
    setApolloMapBounds(merged, bounds);
    setApolloMapBounds(enuMap, bounds);
  }

  progress(requestId, {
    label: 'Exporting Apollo map',
    detail: format === 'bin' ? 'Encoding binary protobuf' : 'Encoding text protobuf',
    progress: 0.8,
  });
  if (format === 'bin') {
    const bytes = await encodeMapBin(enuMap);
    if (shouldCacheBlankMap) {
      cachedRawLonLatMap = merged;
      cachedRawLonLatMapSource = 'blank';
    }
    postWithTransfer({ type: 'EXPORT_BIN_RESULT', requestId, bytes }, [bytes.buffer]);
  } else {
    const text = await encodeMapText(enuMap);
    const bytes = TEXT_ENCODER.encode(text);
    if (shouldCacheBlankMap) {
      cachedRawLonLatMap = merged;
      cachedRawLonLatMapSource = 'blank';
    }
    postWithTransfer({ type: 'EXPORT_TEXT_RESULT', requestId, bytes }, [bytes.buffer]);
  }
}

function beginExport(
  requestId: string,
  format: ApolloExportFormat,
  baseMapSource: ApolloExportBaseMapSource,
  projString: string,
  total: number,
) {
  pendingExports.set(requestId, { format, baseMapSource, projString, total, entities: [] });
}

function addExportChunk(requestId: string, entities: MapEntity[], total: number): void {
  const pending = pendingExports.get(requestId);
  if (!pending) throw new Error(`Unknown Apollo export request ${requestId}`);
  pending.entities.push(...entities);
  pending.total = total;
  progress(requestId, {
    label: 'Exporting Apollo map',
    detail: `Receiving entities ${pending.entities.length.toLocaleString()} / ${total.toLocaleString()}`,
    progress: 0.02 + 0.08 * (pending.entities.length / Math.max(1, total)),
  });
}

async function finishExport(requestId: string): Promise<void> {
  const pending = pendingExports.get(requestId);
  if (!pending) throw new Error(`Unknown Apollo export request ${requestId}`);
  pendingExports.delete(requestId);
  if (pending.entities.length !== pending.total) {
    throw new Error(
      `Apollo export received ${pending.entities.length} entities; expected ${pending.total}.`,
    );
  }
  await runExport(
    requestId,
    pending.entities,
    pending.projString,
    pending.format,
    pending.baseMapSource,
  );
}

self.onmessage = (event: MessageEvent<ApolloIORequest>) => {
  const req = event.data;
  void (async () => {
    try {
      switch (req.type) {
        case 'IMPORT_BIN':
          await runImport(req.requestId, req.filename, () => decodeMapBin(req.bytes));
          break;
        case 'IMPORT_TEXT':
          await runImport(req.requestId, req.filename, () =>
            decodeMapText(TEXT_DECODER.decode(req.bytes)),
          );
          break;
        case 'BEGIN_EXPORT':
          beginExport(
            req.requestId,
            req.format,
            req.baseMapSource ?? 'cached',
            req.projString,
            req.total,
          );
          break;
        case 'EXPORT_ENTITIES_CHUNK':
          addExportChunk(req.requestId, req.entities, req.total);
          break;
        case 'FINISH_EXPORT':
          await finishExport(req.requestId);
          break;
        case 'CLEAR':
          cachedRawLonLatMap = null;
          cachedRawLonLatMapSource = null;
          pendingExports.clear();
          post({ type: 'CLEARED', requestId: req.requestId });
          break;
        case 'RESOLVE_PROJECTION':
          break;
      }
    } catch (error) {
      fail(req.requestId, error);
    }
  })();
};
