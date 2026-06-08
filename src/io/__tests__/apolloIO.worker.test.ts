import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApolloIORequest, ApolloIOResponse } from '../apolloIOProtocol';
import type { MapEntity, PolylineEntity } from '@/types/entities';

const mocks = vi.hoisted(() => ({
  decodeMapBin: vi.fn(),
  encodeMapBin: vi.fn(),
  decodeMapText: vi.fn(),
  encodeMapText: vi.fn(),
  apolloMapFromLonLat: vi.fn(),
  apolloMapToLonLat: vi.fn(),
  entityCounts: vi.fn(),
  readHeaderProjString: vi.fn(),
  apolloMapToEntities: vi.fn(),
  entitiesToApolloMap: vi.fn(),
  computeApolloMapBounds: vi.fn(),
  createBlankApolloMap: vi.fn(),
  setApolloMapBounds: vi.fn(),
  hydrateEntitySourcesFromEditorMeta: vi.fn(),
  writeEntitySourcesToEditorMeta: vi.fn(),
  reconcileLaneTopology: vi.fn(),
  reconcileOverlaps: vi.fn(),
}));

vi.mock('../proto/binCodec', () => ({
  decodeMapBin: mocks.decodeMapBin,
  encodeMapBin: mocks.encodeMapBin,
}));

vi.mock('../proto/textCodec', () => ({
  decodeMapText: mocks.decodeMapText,
  encodeMapText: mocks.encodeMapText,
}));

vi.mock('../proto/adapter', () => ({
  apolloMapFromLonLat: mocks.apolloMapFromLonLat,
  apolloMapToLonLat: mocks.apolloMapToLonLat,
  entityCounts: mocks.entityCounts,
  readHeaderProjString: mocks.readHeaderProjString,
}));

vi.mock('../proto/entityBridge', () => ({
  apolloMapToEntities: mocks.apolloMapToEntities,
  entitiesToApolloMap: mocks.entitiesToApolloMap,
}));

vi.mock('../proto/apolloGeoJson', () => ({
  computeApolloMapBounds: mocks.computeApolloMapBounds,
}));

vi.mock('../proto/blankApolloMap', () => ({
  createBlankApolloMap: mocks.createBlankApolloMap,
  setApolloMapBounds: mocks.setApolloMapBounds,
}));

vi.mock('../proto/editorMeta', () => ({
  hydrateEntitySourcesFromEditorMeta: mocks.hydrateEntitySourcesFromEditorMeta,
  writeEntitySourcesToEditorMeta: mocks.writeEntitySourcesToEditorMeta,
}));

vi.mock('@/core/geometry/laneTopology', () => ({
  reconcileLaneTopology: mocks.reconcileLaneTopology,
}));

vi.mock('@/core/elements/overlap', () => ({
  reconcileOverlaps: mocks.reconcileOverlaps,
}));

vi.mock('@/core/elements/overlap/spatialIndex', () => ({
  SpatialIndex: class SpatialIndex {},
}));

type MessageHandler = (event: MessageEvent<ApolloIORequest>) => void;

interface WorkerHandle {
  responses: ApolloIOResponse[];
  send(request: ApolloIORequest): void;
}

function makePolyline(id: string): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 116, y: 30 },
      { x: 116.001, y: 30 },
    ],
  };
}

function makePolylines(count: number): PolylineEntity[] {
  return Array.from({ length: count }, (_item, index) => makePolyline(`polyline_${index}`));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForResponse<T extends ApolloIOResponse['type']>(
  worker: WorkerHandle,
  type: T,
  requestId: string,
): Promise<Extract<ApolloIOResponse, { type: T }>> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = worker.responses.find(
      (item): item is Extract<ApolloIOResponse, { type: T }> =>
        item.type === type && item.requestId === requestId,
    );
    if (response) return response;
    await flushAsync();
  }
  throw new Error(`Timed out waiting for ${type} ${requestId}`);
}

async function waitForMockCall(mock: { mock: { calls: unknown[] } }): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (mock.mock.calls.length > 0) return;
    await flushAsync();
  }
  throw new Error('Timed out waiting for mock call');
}

async function loadWorker(): Promise<WorkerHandle> {
  vi.resetModules();
  const responses: ApolloIOResponse[] = [];
  const messageHandlers = new Set<MessageHandler>();
  let onmessage: MessageHandler | null = null;
  const fakeSelf = {
    postMessage: vi.fn((response: ApolloIOResponse) => {
      responses.push(response);
    }),
    addEventListener: vi.fn((type: string, handler: MessageHandler) => {
      if (type === 'message') messageHandlers.add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: MessageHandler) => {
      if (type === 'message') messageHandlers.delete(handler);
    }),
    set onmessage(handler: MessageHandler) {
      onmessage = handler;
    },
  };

  vi.stubGlobal('self', fakeSelf);
  await import('../apolloIO.worker');
  if (!onmessage) throw new Error('apolloIO.worker did not register self.onmessage');

  return {
    responses,
    send(request: ApolloIORequest): void {
      const event = new MessageEvent<ApolloIORequest>('message', { data: request });
      onmessage?.(event);
      for (const handler of [...messageHandlers]) handler(event);
    },
  };
}

const decodedMap = { header: { projection: { proj: 'EPSG:TEST' } } };
const lonLatMap = { header: { projection: { proj: 'EPSG:TEST' } }, lane: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.decodeMapBin.mockResolvedValue(decodedMap);
  mocks.decodeMapText.mockResolvedValue(decodedMap);
  mocks.encodeMapBin.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.encodeMapText.mockResolvedValue('map text');
  mocks.apolloMapToLonLat.mockResolvedValue({ map: lonLatMap, projString: 'EPSG:TEST' });
  mocks.apolloMapFromLonLat.mockResolvedValue({ map: { header: lonLatMap.header } });
  mocks.entityCounts.mockReturnValue({ lane: 1 });
  mocks.readHeaderProjString.mockReturnValue('EPSG:TEST');
  mocks.apolloMapToEntities.mockReturnValue([makePolyline('polyline_1')]);
  mocks.hydrateEntitySourcesFromEditorMeta.mockImplementation(
    (_map: Record<string, unknown>, entities: MapEntity[]) => entities,
  );
  mocks.entitiesToApolloMap.mockImplementation((baseMap: Record<string, unknown>) => ({
    ...baseMap,
    merged: true,
  }));
  mocks.computeApolloMapBounds.mockReturnValue([
    [116, 30],
    [116.001, 30.001],
  ]);
  mocks.createBlankApolloMap.mockImplementation((projString: string) => ({
    header: { projection: { proj: projString } },
  }));
  mocks.reconcileLaneTopology.mockReturnValue({ changes: new Map<string, MapEntity>() });
  mocks.reconcileOverlaps.mockReturnValue({
    changes: new Map<string, MapEntity>(),
    removedOverlapIds: new Set<string>(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apolloIO.worker protocol state', () => {
  it('commits imported base-map cache only after ACK_IMPORT', async () => {
    const worker = await loadWorker();

    worker.send({
      type: 'IMPORT_BIN',
      requestId: 'import_1',
      filename: 'base.bin',
      bytes: new Uint8Array([1]),
    });
    await waitForResponse(worker, 'IMPORT_RESULT', 'import_1');

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'export_before_ack',
      format: 'bin',
      projString: 'EPSG:TEST',
      total: 0,
      baseMapSource: 'cached',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'export_before_ack' });

    const beforeAck = await waitForResponse(worker, 'ERROR', 'export_before_ack');
    expect(beforeAck.message).toContain('No imported Apollo map is cached');

    worker.send({ type: 'ACK_IMPORT', requestId: 'import_1' });
    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'export_after_ack',
      format: 'bin',
      projString: 'EPSG:TEST',
      total: 0,
      baseMapSource: 'cached',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'export_after_ack' });

    await waitForResponse(worker, 'EXPORT_BIN_RESULT', 'export_after_ack');
    expect(mocks.entitiesToApolloMap).toHaveBeenLastCalledWith(lonLatMap, []);
  });

  it('ignores projection responses for other requests before resolving the matching import', async () => {
    mocks.readHeaderProjString.mockReturnValueOnce(null);
    const worker = await loadWorker();

    worker.send({
      type: 'IMPORT_BIN',
      requestId: 'import_projection',
      filename: 'missing_projection.bin',
      bytes: new Uint8Array([1]),
    });
    await waitForResponse(worker, 'NEEDS_PROJECTION', 'import_projection');

    worker.send({
      type: 'RESOLVE_PROJECTION',
      requestId: 'different_import',
      projString: 'EPSG:WRONG',
    });
    await flushAsync();
    expect(mocks.apolloMapToLonLat).not.toHaveBeenCalled();

    worker.send({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_projection',
      projString: 'EPSG:MANUAL',
    });

    await waitForResponse(worker, 'IMPORT_RESULT', 'import_projection');
    expect(mocks.apolloMapToLonLat).toHaveBeenCalledWith(decodedMap, 'EPSG:MANUAL');
  });

  it('cancels an import after projection was supplied but before conversion completes', async () => {
    mocks.readHeaderProjString.mockReturnValueOnce(null);
    const projection = deferred<{ map: Record<string, unknown>; projString: string }>();
    mocks.apolloMapToLonLat.mockReturnValueOnce(projection.promise);
    const worker = await loadWorker();

    worker.send({
      type: 'IMPORT_TEXT',
      requestId: 'import_convert_race',
      filename: 'slow_projection.txt',
      bytes: new Uint8Array([1]),
    });
    await waitForResponse(worker, 'NEEDS_PROJECTION', 'import_convert_race');
    worker.send({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_convert_race',
      projString: 'EPSG:MANUAL',
    });
    await waitForMockCall(mocks.apolloMapToLonLat);

    worker.send({ type: 'CANCEL_IMPORT', requestId: 'import_convert_race' });
    projection.resolve({ map: lonLatMap, projString: 'EPSG:MANUAL' });

    const error = await waitForResponse(worker, 'ERROR', 'import_convert_race');
    expect(error.message).toContain('import request import_convert_race was cancelled');
    expect(
      worker.responses.some(
        (response) =>
          response.type === 'IMPORT_RESULT' && response.requestId === 'import_convert_race',
      ),
    ).toBe(false);
  });

  it('cancels an active import waiting for projection when CLEAR arrives', async () => {
    mocks.readHeaderProjString.mockReturnValueOnce(null);
    const worker = await loadWorker();

    worker.send({
      type: 'IMPORT_TEXT',
      requestId: 'import_needs_projection',
      filename: 'missing_projection.txt',
      bytes: new Uint8Array([1]),
    });
    await waitForResponse(worker, 'NEEDS_PROJECTION', 'import_needs_projection');

    worker.send({ type: 'CLEAR', requestId: 'clear_1' });

    await waitForResponse(worker, 'CLEARED', 'clear_1');
    const error = await waitForResponse(worker, 'ERROR', 'import_needs_projection');
    expect(error.message).toContain('projection request import_needs_projection was cancelled');
    expect(
      worker.responses.some(
        (response) =>
          response.type === 'IMPORT_RESULT' && response.requestId === 'import_needs_projection',
      ),
    ).toBe(false);
  });

  it('cancels an active export when CLEAR arrives before projection finishes', async () => {
    const projection = deferred<{ map: Record<string, unknown> }>();
    mocks.apolloMapFromLonLat.mockReturnValueOnce(projection.promise);
    const worker = await loadWorker();

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'export_1',
      format: 'bin',
      projString: 'EPSG:TEST',
      total: 0,
      baseMapSource: 'blank',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'export_1' });
    await waitForMockCall(mocks.apolloMapFromLonLat);

    worker.send({ type: 'CLEAR', requestId: 'clear_1' });
    await waitForResponse(worker, 'CLEARED', 'clear_1');

    projection.resolve({ map: { header: lonLatMap.header } });
    const error = await waitForResponse(worker, 'ERROR', 'export_1');
    expect(error.message).toContain('export request export_1 was cancelled');
    expect(
      worker.responses.some(
        (response) => response.type === 'EXPORT_BIN_RESULT' && response.requestId === 'export_1',
      ),
    ).toBe(false);
  });

  it('normalizes non-Error failures into worker error responses', async () => {
    mocks.decodeMapBin.mockRejectedValueOnce('string decode failure');
    const worker = await loadWorker();

    worker.send({
      type: 'IMPORT_BIN',
      requestId: 'import_string_failure',
      filename: 'bad.bin',
      bytes: new Uint8Array([1]),
    });

    const error = await waitForResponse(worker, 'ERROR', 'import_string_failure');
    expect(error.message).toBe('string decode failure');
    expect(error.stack).toBeUndefined();
  });

  it('reports export chunk and finish validation errors', async () => {
    const worker = await loadWorker();

    worker.send({
      type: 'EXPORT_ENTITIES_CHUNK',
      requestId: 'unknown_export',
      entities: [makePolyline('orphan')],
      offset: 0,
      total: 1,
    });
    const unknown = await waitForResponse(worker, 'ERROR', 'unknown_export');
    expect(unknown.message).toContain('Unknown Apollo export request unknown_export');

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'short_export',
      format: 'bin',
      projString: 'EPSG:TEST',
      total: 2,
      baseMapSource: 'blank',
    });
    worker.send({
      type: 'EXPORT_ENTITIES_CHUNK',
      requestId: 'short_export',
      entities: [makePolyline('only_one')],
      offset: 0,
      total: 2,
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'short_export' });

    const mismatch = await waitForResponse(worker, 'ERROR', 'short_export');
    expect(mismatch.message).toContain('Apollo export received 1 entities; expected 2');
  });

  it('cleans up a cancelled pending export so the request id can be reused', async () => {
    const worker = await loadWorker();

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'reused_export',
      format: 'bin',
      projString: 'EPSG:TEST',
      total: 1,
      baseMapSource: 'blank',
    });
    worker.send({
      type: 'EXPORT_ENTITIES_CHUNK',
      requestId: 'reused_export',
      entities: [makePolyline('cancelled')],
      offset: 0,
      total: 1,
    });
    worker.send({ type: 'CANCEL_EXPORT', requestId: 'reused_export' });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'reused_export' });

    const cancelled = await waitForResponse(worker, 'ERROR', 'reused_export');
    expect(cancelled.message).toContain('export request reused_export was cancelled');

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'reused_export',
      format: 'bin',
      projString: 'EPSG:TEST',
      total: 0,
      baseMapSource: 'blank',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'reused_export' });

    await waitForResponse(worker, 'EXPORT_BIN_RESULT', 'reused_export');
    expect(mocks.encodeMapBin).toHaveBeenCalledTimes(1);
  });

  it('streams large imports in entity chunks with ordered progress updates', async () => {
    const entities = makePolylines(2_001);
    mocks.apolloMapToEntities.mockReturnValueOnce(entities);
    const worker = await loadWorker();

    worker.send({
      type: 'IMPORT_BIN',
      requestId: 'large_import',
      filename: 'large.bin',
      bytes: new Uint8Array([1]),
    });
    await waitForResponse(worker, 'IMPORT_RESULT', 'large_import');

    const chunks = worker.responses.filter(
      (response): response is Extract<ApolloIOResponse, { type: 'IMPORT_ENTITIES_CHUNK' }> =>
        response.type === 'IMPORT_ENTITIES_CHUNK' && response.requestId === 'large_import',
    );
    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => [chunk.offset, chunk.entities.length, chunk.total])).toEqual([
      [0, 2_000, 2_001],
      [2_000, 1, 2_001],
    ]);

    const progressDetails = worker.responses
      .filter(
        (response): response is Extract<ApolloIOResponse, { type: 'PROGRESS' }> =>
          response.type === 'PROGRESS' && response.requestId === 'large_import',
      )
      .map((response) => response.progress.detail);
    expect(progressDetails).toEqual([
      'Decoding protobuf',
      'Projecting coordinates',
      'Building editable entities',
      'Recomputing topology and overlaps',
      'Sending entities',
      'Applying result',
    ]);
  });

  it('returns null import header and bounds when the projected map lacks them', async () => {
    mocks.apolloMapToLonLat.mockResolvedValueOnce({ map: { lane: [] }, projString: 'EPSG:TEST' });
    mocks.computeApolloMapBounds.mockReturnValueOnce(null);
    const worker = await loadWorker();

    worker.send({
      type: 'IMPORT_TEXT',
      requestId: 'headerless_import',
      filename: 'headerless.txt',
      bytes: new Uint8Array([1]),
    });

    const result = await waitForResponse(worker, 'IMPORT_RESULT', 'headerless_import');
    expect(result.header).toBeNull();
    expect(result.bounds).toBeNull();
  });

  it('exports text from a blank base map, writes bounds, and reuses the cached blank map', async () => {
    const enuMap = { header: { projection: { proj: 'EPSG:TEST' } }, lane: [] };
    const firstMerged = { header: lonLatMap.header, merged: 'first' };
    const secondMerged = { header: lonLatMap.header, merged: 'second' };
    mocks.apolloMapFromLonLat.mockResolvedValue({ map: enuMap });
    mocks.entitiesToApolloMap.mockReturnValueOnce(firstMerged).mockReturnValueOnce(secondMerged);
    const worker = await loadWorker();

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'blank_text_export',
      format: 'txt',
      projString: 'EPSG:TEST',
      total: 0,
      baseMapSource: 'blank',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'blank_text_export' });

    const firstResult = await waitForResponse(worker, 'EXPORT_TEXT_RESULT', 'blank_text_export');
    expect(new TextDecoder().decode(firstResult.bytes)).toBe('map text');
    expect(mocks.setApolloMapBounds).toHaveBeenNthCalledWith(1, firstMerged, [
      [116, 30],
      [116.001, 30.001],
    ]);
    expect(mocks.setApolloMapBounds).toHaveBeenNthCalledWith(2, enuMap, [
      [116, 30],
      [116.001, 30.001],
    ]);

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'blank_bin_export',
      format: 'bin',
      projString: 'EPSG:TEST',
      total: 0,
      baseMapSource: 'blank',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'blank_bin_export' });

    await waitForResponse(worker, 'EXPORT_BIN_RESULT', 'blank_bin_export');
    expect(mocks.createBlankApolloMap).toHaveBeenCalledTimes(1);
    expect(mocks.entitiesToApolloMap).toHaveBeenNthCalledWith(2, firstMerged, []);
  });

  it('does not reuse cached blank base maps across projection strings', async () => {
    mocks.apolloMapFromLonLat.mockResolvedValue({ map: { header: lonLatMap.header } });
    const worker = await loadWorker();

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'blank_first_proj',
      format: 'bin',
      projString: 'EPSG:FIRST',
      total: 0,
      baseMapSource: 'blank',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'blank_first_proj' });
    await waitForResponse(worker, 'EXPORT_BIN_RESULT', 'blank_first_proj');

    worker.send({
      type: 'BEGIN_EXPORT',
      requestId: 'blank_second_proj',
      format: 'bin',
      projString: 'EPSG:SECOND',
      total: 0,
      baseMapSource: 'blank',
    });
    worker.send({ type: 'FINISH_EXPORT', requestId: 'blank_second_proj' });
    await waitForResponse(worker, 'EXPORT_BIN_RESULT', 'blank_second_proj');

    expect(mocks.createBlankApolloMap).toHaveBeenNthCalledWith(1, 'EPSG:FIRST');
    expect(mocks.createBlankApolloMap).toHaveBeenNthCalledWith(2, 'EPSG:SECOND');
  });
});
