import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApolloIOBridge, type ApolloIOWorkerPort } from '../apolloIOBridge';
import { UTM_PRESETS } from '../proto/projection';
import { useProjDialogStore } from '@/store/projDialogStore';
import type { ApolloIORequest, ApolloIOResponse } from '../apolloIOProtocol';
import type { MapEntity, PolylineEntity } from '@/types/entities';

type UnknownApolloIOResponse = {
  type: 'UNKNOWN_RESPONSE';
  requestId: string;
};

interface ApolloIOBridgeInternals {
  pending: Map<string, unknown>;
  register: (
    requestId: string,
    entry: {
      kind: 'clear';
      resolve: () => void;
      reject: (error: Error) => void;
    },
  ) => void;
  takePending: (requestId: string) => unknown;
  handleProjectionRequest: (msg: ApolloIOResponse) => Promise<void>;
}

function bridgeInternals(bridge: ApolloIOBridge): ApolloIOBridgeInternals {
  return {
    pending: Reflect.get(bridge, 'pending') as Map<string, unknown>,
    register: Reflect.get(bridge, 'register').bind(bridge) as ApolloIOBridgeInternals['register'],
    takePending: Reflect.get(bridge, 'takePending').bind(
      bridge,
    ) as ApolloIOBridgeInternals['takePending'],
    handleProjectionRequest: Reflect.get(bridge, 'handleProjectionRequest').bind(
      bridge,
    ) as ApolloIOBridgeInternals['handleProjectionRequest'],
  };
}

class FakeWorker implements ApolloIOWorkerPort {
  onmessage: ((event: MessageEvent<ApolloIOResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((request: ApolloIORequest, transfer?: Transferable[]) => {
    this.messages.push({ request, transfer });
  });
  terminate = vi.fn();
  messages: Array<{ request: ApolloIORequest; transfer?: Transferable[] }> = [];

  emit(response: ApolloIOResponse | UnknownApolloIOResponse): void {
    this.onmessage?.({
      data: response as ApolloIOResponse,
    } as MessageEvent<ApolloIOResponse>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createBridge() {
  const workers: FakeWorker[] = [];
  const bridge = new ApolloIOBridge(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { bridge, workers };
}

function makePolyline(id: string): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  };
}

function importInfo(filename = 'base_map.bin') {
  return {
    filename,
    counts: { lane: 1 },
    projString: UTM_PRESETS.sunnyvale,
    importedAt: 1_700_000_000_000,
  };
}

const importStats = {
  decodeMs: 1,
  projectMs: 2,
  bridgeMs: 3,
  topologyMs: 4,
  overlapMs: 5,
  totalMs: 15,
};

const originalProjRequest = useProjDialogStore.getState().request;

beforeEach(() => {
  vi.clearAllMocks();
  useProjDialogStore.setState({ request: originalProjRequest });
});

afterEach(() => {
  vi.useRealTimers();
  useProjDialogStore.setState({ request: originalProjRequest });
  vi.unstubAllGlobals();
});

describe('ApolloIOBridge', () => {
  it('streams binary import progress and accumulates entity chunks', async () => {
    const { bridge, workers } = createBridge();
    const progress = vi.fn();
    const bytes = new Uint8Array([1, 2, 3]);

    const resultPromise = bridge.importBin('base_map.bin', bytes, progress);

    expect(workers).toHaveLength(1);
    expect(workers[0]!.messages).toHaveLength(1);
    expect(workers[0]!.messages[0]!.request).toMatchObject({
      type: 'IMPORT_BIN',
      requestId: 'import_1',
      filename: 'base_map.bin',
      bytes,
    });
    expect(workers[0]!.messages[0]!.transfer).toEqual([bytes.buffer]);

    workers[0]!.emit({
      type: 'PROGRESS',
      requestId: 'import_1',
      progress: { label: 'Decoding', progress: 0.25 },
    });
    workers[0]!.emit({
      type: 'IMPORT_ENTITIES_CHUNK',
      requestId: 'import_1',
      entities: [makePolyline('polyline_1')],
      offset: 0,
      total: 2,
    });
    workers[0]!.emit({
      type: 'IMPORT_ENTITIES_CHUNK',
      requestId: 'import_1',
      entities: [makePolyline('polyline_2')],
      offset: 1,
      total: 2,
    });
    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_1',
      info: importInfo(),
      header: { projection: { proj: UTM_PRESETS.sunnyvale } },
      bounds: [
        [0, 0],
        [1, 1],
      ],
      stats: importStats,
    });

    const result = await resultPromise;
    expect(result.entities.map((entity) => entity.id)).toEqual(['polyline_1', 'polyline_2']);
    expect(result.info.filename).toBe('base_map.bin');
    expect(result.stats.totalMs).toBe(15);
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'ACK_IMPORT',
      requestId: 'import_1',
    });
    expect(progress).toHaveBeenCalledWith({ label: 'Decoding', progress: 0.25 });
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Importing Apollo map',
        detail: 'Receiving entities 2 / 2',
      }),
    );
  });

  it('negotiates missing projection and falls back when the dialog is cancelled', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(UTM_PRESETS.sunnyvale)
      .mockResolvedValueOnce(null);
    useProjDialogStore.setState({ request });

    const { bridge, workers } = createBridge();
    const first = bridge.importText('base_map.txt', new Uint8Array([1]));
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    await flushPromises();

    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_1',
      projString: UTM_PRESETS.sunnyvale,
    });

    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_1',
      info: importInfo('base_map.txt'),
      header: null,
      bounds: null,
      stats: importStats,
    });
    await first;

    const second = bridge.importText('missing_projection.txt', new Uint8Array([2]));
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_2' });
    await flushPromises();

    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_2',
      projString: UTM_PRESETS.beijing,
    });

    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_2',
      info: importInfo('missing_projection.txt'),
      header: null,
      bounds: null,
      stats: importStats,
    });
    await second;
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent projection prompts so requests are not superseded', async () => {
    const firstProjection = deferred<string | null>();
    const secondProjection = deferred<string | null>();
    const request = vi
      .fn()
      .mockReturnValueOnce(firstProjection.promise)
      .mockReturnValueOnce(secondProjection.promise);
    useProjDialogStore.setState({ request });

    const { bridge, workers } = createBridge();
    const first = bridge.importText('first.txt', new Uint8Array([1]));
    const second = bridge.importText('second.txt', new Uint8Array([2]));
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_2' });
    await flushPromises();

    expect(request).toHaveBeenCalledTimes(1);

    firstProjection.resolve(UTM_PRESETS.sunnyvale);
    await flushPromises();

    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_1',
      projString: UTM_PRESETS.sunnyvale,
    });
    expect(request).toHaveBeenCalledTimes(2);

    secondProjection.resolve(null);
    await flushPromises();

    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_2',
      projString: UTM_PRESETS.beijing,
    });

    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_1',
      info: importInfo('first.txt'),
      header: null,
      bounds: null,
      stats: importStats,
    });
    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_2',
      info: importInfo('second.txt'),
      header: null,
      bounds: null,
      stats: importStats,
    });
    await first;
    await second;
  });

  it('continues queued projection prompts when the active import times out', async () => {
    vi.useFakeTimers();
    const firstProjection = deferred<string | null>();
    const secondProjection = deferred<string | null>();
    const request = vi
      .fn()
      .mockReturnValueOnce(firstProjection.promise)
      .mockReturnValueOnce(secondProjection.promise);
    useProjDialogStore.setState({ request });

    const { bridge, workers } = createBridge();
    const first = bridge.importText('first-timeout.txt', new Uint8Array([1]));
    const firstRejection = expect(first).rejects.toThrow(
      'Apollo IO request timed out after 600000ms',
    );
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    await vi.advanceTimersByTimeAsync(0);

    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600_000);
    await firstRejection;
    await vi.advanceTimersByTimeAsync(0);

    const second = bridge.importText('second-proj.txt', new Uint8Array([2]));
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_2' });
    await vi.advanceTimersByTimeAsync(0);

    expect(request).toHaveBeenCalledTimes(2);
    secondProjection.resolve(UTM_PRESETS.sunnyvale);
    await vi.advanceTimersByTimeAsync(0);
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_2',
      projString: UTM_PRESETS.sunnyvale,
    });

    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_2',
      info: importInfo('second-proj.txt'),
      header: null,
      bounds: null,
      stats: importStats,
    });
    await second;
  });

  it('chunks large binary exports and resolves with worker bytes', async () => {
    const { bridge, workers } = createBridge();
    const progress = vi.fn();
    const entities: MapEntity[] = Array.from({ length: 2_001 }, (_, index) =>
      makePolyline(`polyline_${index + 1}`),
    );

    const resultPromise = bridge.exportBin(entities, UTM_PRESETS.sunnyvale, progress, {
      baseMapSource: 'blank',
    });
    await flushPromises();
    await flushPromises();

    const requests = workers[0]!.messages.map((message) => message.request);
    expect(requests[0]).toMatchObject({
      type: 'BEGIN_EXPORT',
      requestId: 'export_1',
      format: 'bin',
      projString: UTM_PRESETS.sunnyvale,
      total: 2_001,
      baseMapSource: 'blank',
    });
    expect(requests[1]).toMatchObject({
      type: 'EXPORT_ENTITIES_CHUNK',
      requestId: 'export_1',
      offset: 0,
      total: 2_001,
    });
    expect(
      (requests[1] as Extract<ApolloIORequest, { type: 'EXPORT_ENTITIES_CHUNK' }>).entities,
    ).toHaveLength(2_000);
    expect(requests[2]).toMatchObject({
      type: 'EXPORT_ENTITIES_CHUNK',
      requestId: 'export_1',
      offset: 2_000,
      total: 2_001,
    });
    expect(
      (requests[2] as Extract<ApolloIORequest, { type: 'EXPORT_ENTITIES_CHUNK' }>).entities,
    ).toHaveLength(1);
    expect(requests[3]).toEqual({ type: 'FINISH_EXPORT', requestId: 'export_1' });
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Exporting Apollo map',
        detail: 'Sending entities 2,001 / 2,001',
      }),
    );

    const bytes = new Uint8Array([9, 8, 7]);
    workers[0]!.emit({ type: 'EXPORT_BIN_RESULT', requestId: 'export_1', bytes });
    await expect(resultPromise).resolves.toBe(bytes);
  });

  it('resolves text exports and clear requests from final worker messages', async () => {
    const { bridge, workers } = createBridge();

    const exportPromise = bridge.exportText([makePolyline('polyline_1')], UTM_PRESETS.sunnyvale);
    await flushPromises();
    const textBytes = new Uint8Array([123]);
    workers[0]!.emit({ type: 'EXPORT_TEXT_RESULT', requestId: 'export_1', bytes: textBytes });
    await expect(exportPromise).resolves.toBe(textBytes);

    const clearPromise = bridge.clear();
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CLEAR',
      requestId: 'clear_2',
    });
    workers[0]!.emit({ type: 'CLEARED', requestId: 'clear_2' });
    await expect(clearPromise).resolves.toBeUndefined();
  });

  it('clear locally rejects older pending requests and ignores their late final messages', async () => {
    const { bridge, workers } = createBridge();
    const importPromise = bridge.importText('base_map.txt', new Uint8Array([1]));
    const importRejected = expect(importPromise).rejects.toThrow('Apollo IO bridge was cleared.');

    const clearPromise = bridge.clear();

    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual([
      'IMPORT_TEXT',
      'CLEAR',
    ]);
    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_1',
      info: importInfo('base_map.txt'),
      header: null,
      bounds: null,
      stats: importStats,
    });
    workers[0]!.emit({ type: 'CLEARED', requestId: 'clear_2' });

    await importRejected;
    await expect(clearPromise).resolves.toBeUndefined();
    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual([
      'IMPORT_TEXT',
      'CLEAR',
    ]);
  });

  it('rejects mismatched final response types instead of leaving requests pending', async () => {
    const { bridge, workers } = createBridge();

    const exportPromise = bridge.exportBin([makePolyline('polyline_1')], UTM_PRESETS.sunnyvale);
    await flushPromises();
    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'export_1',
      info: importInfo(),
      header: null,
      bounds: null,
      stats: importStats,
    });

    await expect(exportPromise).rejects.toThrow(
      'Unexpected Apollo IO response IMPORT_RESULT for exportBin request.',
    );
  });

  it('stops streaming export chunks after the worker rejects a request', async () => {
    const { bridge, workers } = createBridge();
    const entities: MapEntity[] = Array.from({ length: 2_001 }, (_, index) =>
      makePolyline(`polyline_${index + 1}`),
    );

    const exportPromise = bridge.exportBin(entities, UTM_PRESETS.sunnyvale);
    const rejection = exportPromise.catch((error: unknown) => error);
    workers[0]!.emit({ type: 'ERROR', requestId: 'export_1', message: 'No cached map' });
    await flushPromises();

    await expect(rejection).resolves.toMatchObject({ message: 'No cached map' });
    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual([
      'BEGIN_EXPORT',
      'EXPORT_ENTITIES_CHUNK',
    ]);
  });

  it('cancels worker exports when progress callbacks throw while streaming chunks', async () => {
    const { bridge, workers } = createBridge();
    const progress = vi.fn(() => {
      throw new Error('export progress failed');
    });

    const exportPromise = bridge.exportBin(
      [makePolyline('polyline_1')],
      UTM_PRESETS.sunnyvale,
      progress,
    );

    await expect(exportPromise).rejects.toThrow('export progress failed');
    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual([
      'BEGIN_EXPORT',
      'EXPORT_ENTITIES_CHUNK',
      'CANCEL_EXPORT',
    ]);
  });

  it('cancels worker exports when worker progress callbacks throw', async () => {
    const { bridge, workers } = createBridge();
    const progress = vi.fn(() => {
      throw new Error('export worker progress failed');
    });

    const exportPromise = bridge.exportText([], UTM_PRESETS.sunnyvale, progress);
    await flushPromises();
    workers[0]!.emit({
      type: 'PROGRESS',
      requestId: 'export_1',
      progress: { label: 'Encoding', progress: 0.8 },
    });

    await expect(exportPromise).rejects.toThrow('export worker progress failed');
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_EXPORT',
      requestId: 'export_1',
    });
  });

  it('rejects all pending requests on worker error and creates a fresh worker afterward', async () => {
    const { bridge, workers } = createBridge();
    const first = bridge.importBin('a.bin', new Uint8Array([1]));
    const second = bridge.importText('b.txt', new Uint8Array([2]));

    workers[0]!.fail('boom');

    await expect(first).rejects.toThrow('Apollo IO worker error: boom');
    await expect(second).rejects.toThrow('Apollo IO worker error: boom');
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);

    void bridge.importBin('c.bin', new Uint8Array([3]));
    expect(workers).toHaveLength(2);
    expect(workers[1]!.messages[0]!.request).toMatchObject({
      type: 'IMPORT_BIN',
      requestId: 'import_3',
      filename: 'c.bin',
    });
  });

  it('rejects timed-out requests and ignores late worker responses', async () => {
    vi.useFakeTimers();
    const { bridge, workers } = createBridge();

    const resultPromise = bridge.importBin('slow.bin', new Uint8Array([1]));
    const rejection = expect(resultPromise).rejects.toThrow(
      'Apollo IO request timed out after 600000ms',
    );
    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;

    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_1',
      info: importInfo('slow.bin'),
      header: null,
      bounds: null,
      stats: importStats,
    });
    await Promise.resolve();
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_IMPORT',
      requestId: 'import_1',
    });
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
  });

  it('cancels worker exports when they time out', async () => {
    vi.useFakeTimers();
    const { bridge, workers } = createBridge();

    const resultPromise = bridge.exportText([], UTM_PRESETS.sunnyvale);
    const rejection = expect(resultPromise).rejects.toThrow(
      'Apollo IO request timed out after 600000ms',
    );
    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_EXPORT',
      requestId: 'export_1',
    });
  });

  it('rejects clear requests when they time out without sending cancellation', async () => {
    vi.useFakeTimers();
    const { bridge, workers } = createBridge();

    const resultPromise = bridge.clear();
    const rejection = expect(resultPromise).rejects.toThrow(
      'Apollo IO request timed out after 600000ms',
    );
    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual(['CLEAR']);
  });

  it('rejects ERROR messages from the worker', async () => {
    const { bridge, workers } = createBridge();
    const resultPromise = bridge.importBin('bad.bin', new Uint8Array([1]));

    workers[0]!.emit({ type: 'ERROR', requestId: 'import_1', message: 'decode failed' });

    await expect(resultPromise).rejects.toThrow('decode failed');
  });

  it('preserves worker ERROR stack traces on rejected requests', async () => {
    const { bridge, workers } = createBridge();
    const resultPromise = bridge.importBin('bad.bin', new Uint8Array([1]));

    workers[0]!.emit({
      type: 'ERROR',
      requestId: 'import_1',
      message: 'decode failed',
      stack: 'worker stack',
    });

    await expect(resultPromise).rejects.toMatchObject({
      message: 'decode failed',
      stack: 'worker stack',
    });
  });

  it('rejects the pending request when progress callbacks throw', async () => {
    const { bridge, workers } = createBridge();
    const progress = vi.fn(() => {
      throw new Error('progress failed');
    });

    const resultPromise = bridge.importBin('bad-progress.bin', new Uint8Array([1]), progress);
    workers[0]!.emit({
      type: 'PROGRESS',
      requestId: 'import_1',
      progress: { label: 'Decoding', progress: 0.25 },
    });

    await expect(resultPromise).rejects.toThrow('progress failed');
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_IMPORT',
      requestId: 'import_1',
    });
  });

  it('rejects import requests when chunk progress callbacks throw', async () => {
    const { bridge, workers } = createBridge();
    const progress = vi.fn(() => {
      throw new Error('chunk progress failed');
    });

    const resultPromise = bridge.importBin('bad-chunk-progress.bin', new Uint8Array([1]), progress);
    workers[0]!.emit({
      type: 'IMPORT_ENTITIES_CHUNK',
      requestId: 'import_1',
      entities: [makePolyline('polyline_1')],
      offset: 0,
      total: 1,
    });

    await expect(resultPromise).rejects.toThrow('chunk progress failed');
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_IMPORT',
      requestId: 'import_1',
    });
  });

  it('cancels worker imports when imports time out', async () => {
    vi.useFakeTimers();
    const { bridge, workers } = createBridge();

    const resultPromise = bridge.importBin('projection-timeout.bin', new Uint8Array([1]));
    const rejection = expect(resultPromise).rejects.toThrow(
      'Apollo IO request timed out after 600000ms',
    );
    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_IMPORT',
      requestId: 'import_1',
    });
  });

  it('rejects successful import results when the worker cannot acknowledge cache commit', async () => {
    const { bridge, workers } = createBridge();
    const resultPromise = bridge.importBin('ack-fails.bin', new Uint8Array([1]));

    workers[0]!.postMessage.mockImplementation((request: ApolloIORequest) => {
      workers[0]!.messages.push({ request });
      if (request.type === 'ACK_IMPORT') throw new Error('ack failed');
    });
    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_1',
      info: importInfo('ack-fails.bin'),
      header: null,
      bounds: null,
      stats: importStats,
    });

    await expect(resultPromise).rejects.toThrow('ack failed');
  });

  it('uses the default Worker factory when no custom factory is supplied', async () => {
    class DefaultWorker extends FakeWorker {
      static instances: DefaultWorker[] = [];

      constructor(
        public readonly url: URL,
        public readonly options: WorkerOptions,
      ) {
        super();
        DefaultWorker.instances.push(this);
      }
    }
    vi.stubGlobal('Worker', DefaultWorker);

    const bridge = new ApolloIOBridge();
    const clearPromise = bridge.clear();
    const worker = DefaultWorker.instances[0]!;

    expect(worker.url).toBeInstanceOf(URL);
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.messages[0]!.request).toEqual({ type: 'CLEAR', requestId: 'clear_1' });

    worker.emit({ type: 'CLEARED', requestId: 'clear_1' });
    await expect(clearPromise).resolves.toBeUndefined();
  });

  it('rejects import requests when worker creation fails before cancellation is possible', async () => {
    const bridge = new ApolloIOBridge(() => {
      throw new Error('worker unavailable');
    });

    await expect(bridge.importBin('broken.bin', new Uint8Array([1]))).rejects.toThrow(
      'worker unavailable',
    );
  });

  it('rejects import and clear requests when worker posting throws', async () => {
    const importWorker = new FakeWorker();
    importWorker.postMessage.mockImplementation(() => {
      throw new Error('post import failed');
    });
    const importBridge = new ApolloIOBridge(() => importWorker);

    await expect(importBridge.importText('broken.txt', new Uint8Array([1]))).rejects.toThrow(
      'post import failed',
    );
    expect(importWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'IMPORT_TEXT', requestId: 'import_1' }),
      [expect.any(ArrayBuffer)],
    );

    const clearWorker = new FakeWorker();
    clearWorker.postMessage.mockImplementation(() => {
      throw new Error('post clear failed');
    });
    const clearBridge = new ApolloIOBridge(() => clearWorker);

    await expect(clearBridge.clear()).rejects.toThrow('post clear failed');
    expect(clearWorker.postMessage).toHaveBeenCalledWith({
      type: 'CLEAR',
      requestId: 'clear_1',
    });
  });

  it('rejects an import when resolving projection cannot be posted back to the worker', async () => {
    const { bridge, workers } = createBridge();
    useProjDialogStore.setState({
      request: vi.fn().mockResolvedValue(UTM_PRESETS.sunnyvale),
    });
    const resultPromise = bridge.importText('needs-proj.txt', new Uint8Array([1]));
    const rejection = expect(resultPromise).rejects.toThrow('resolve post failed');

    workers[0]!.postMessage.mockImplementation((request: ApolloIORequest) => {
      workers[0]!.messages.push({ request });
      if (request.type === 'RESOLVE_PROJECTION') throw new Error('resolve post failed');
    });
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    await flushPromises();

    await rejection;
  });

  it('rejects an import when the projection dialog request rejects', async () => {
    const { bridge, workers } = createBridge();
    useProjDialogStore.setState({
      request: vi.fn().mockRejectedValue(new Error('projection dialog failed')),
    });

    const resultPromise = bridge.importText('dialog-rejects.txt', new Uint8Array([1]));
    const rejection = expect(resultPromise).rejects.toThrow('projection dialog failed');
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    await flushPromises();

    await rejection;
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_IMPORT',
      requestId: 'import_1',
    });
  });

  it('does not resolve a projection after the pending import was removed', async () => {
    let resolveProjection!: (value: string | null) => void;
    useProjDialogStore.setState({
      request: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolveProjection = resolve;
          }),
      ),
    });
    const { bridge, workers } = createBridge();

    const resultPromise = bridge.importText('cancelled-proj.txt', new Uint8Array([1]));
    const rejection = expect(resultPromise).rejects.toThrow('decode failed');
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    workers[0]!.emit({ type: 'ERROR', requestId: 'import_1', message: 'decode failed' });
    await rejection;

    resolveProjection(UTM_PRESETS.sunnyvale);
    await flushPromises();

    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual(['IMPORT_TEXT']);
  });

  it('preserves the original rejection when posting cancellation fails', async () => {
    const { bridge, workers } = createBridge();
    const progress = vi.fn(() => {
      throw new Error('progress failed before cancel');
    });
    const resultPromise = bridge.importBin('cancel-post-fails.bin', new Uint8Array([1]), progress);
    workers[0]!.postMessage.mockImplementation((request: ApolloIORequest) => {
      workers[0]!.messages.push({ request });
      if (request.type === 'CANCEL_IMPORT') throw new Error('cancel post failed');
    });

    workers[0]!.emit({
      type: 'PROGRESS',
      requestId: 'import_1',
      progress: { label: 'Decoding', progress: 0.25 },
    });

    await expect(resultPromise).rejects.toThrow('progress failed before cancel');
  });

  it('rejects streaming import chunks sent to export requests', async () => {
    const { bridge, workers } = createBridge();

    const resultPromise = bridge.exportBin([makePolyline('polyline_1')], UTM_PRESETS.sunnyvale);
    const rejection = expect(resultPromise).rejects.toThrow(
      'Unexpected Apollo IO response IMPORT_ENTITIES_CHUNK for exportBin request.',
    );
    await flushPromises();
    workers[0]!.emit({
      type: 'IMPORT_ENTITIES_CHUNK',
      requestId: 'export_1',
      entities: [makePolyline('polyline_2')],
      offset: 0,
      total: 1,
    });

    await rejection;
  });

  it('rejects projection requests sent to non-import requests', async () => {
    const { bridge, workers } = createBridge();
    const request = vi.fn();
    useProjDialogStore.setState({ request });

    const exportPromise = bridge.exportText([makePolyline('polyline_1')], UTM_PRESETS.sunnyvale);
    const rejection = expect(exportPromise).rejects.toThrow(
      'Unexpected Apollo IO response NEEDS_PROJECTION for exportText request.',
    );
    await flushPromises();
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'export_1' });

    await rejection;
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects mismatched export and clear final response types', async () => {
    const { bridge, workers } = createBridge();

    const importPromise = bridge.importBin('wrong.bin', new Uint8Array([1]));
    const importRejection = expect(importPromise).rejects.toThrow(
      'Unexpected Apollo IO response EXPORT_BIN_RESULT for import request.',
    );
    workers[0]!.emit({
      type: 'EXPORT_BIN_RESULT',
      requestId: 'import_1',
      bytes: new Uint8Array([1]),
    });
    await importRejection;

    const exportPromise = bridge.exportBin([makePolyline('polyline_1')], UTM_PRESETS.sunnyvale);
    const exportRejection = expect(exportPromise).rejects.toThrow(
      'Unexpected Apollo IO response EXPORT_TEXT_RESULT for exportBin request.',
    );
    await flushPromises();
    workers[0]!.emit({
      type: 'EXPORT_TEXT_RESULT',
      requestId: 'export_2',
      bytes: new Uint8Array([2]),
    });
    await exportRejection;

    const clearPromise = bridge.clear();
    const clearRejection = expect(clearPromise).rejects.toThrow(
      'Unexpected Apollo IO response EXPORT_BIN_RESULT for clear request.',
    );
    workers[0]!.emit({ type: 'CLEARED', requestId: 'export_2' });
    workers[0]!.emit({ type: 'EXPORT_BIN_RESULT', requestId: 'clear_3', bytes: new Uint8Array() });
    await clearRejection;
  });

  it('rejects CLEARED final messages sent to non-clear requests', async () => {
    const { bridge, workers } = createBridge();

    const exportPromise = bridge.exportText([makePolyline('polyline_1')], UTM_PRESETS.sunnyvale);
    const rejection = expect(exportPromise).rejects.toThrow(
      'Unexpected Apollo IO response CLEARED for exportText request.',
    );
    await flushPromises();
    workers[0]!.emit({ type: 'CLEARED', requestId: 'export_1' });

    await rejection;
  });

  it('rejects unknown worker response types for pending requests', async () => {
    const { bridge, workers } = createBridge();

    const clearPromise = bridge.clear();
    const rejection = expect(clearPromise).rejects.toThrow(
      'Unexpected Apollo IO response UNKNOWN_RESPONSE for clear request.',
    );
    workers[0]!.emit({
      type: 'UNKNOWN_RESPONSE',
      requestId: 'clear_1',
    });

    await rejection;
  });

  it('keeps vanished-pending guard clauses inert', async () => {
    vi.useFakeTimers();
    const { bridge } = createBridge();
    const internals = bridgeInternals(bridge);
    const reject = vi.fn();

    internals.register('ghost', { kind: 'clear', resolve: vi.fn(), reject });
    internals.pending.delete('ghost');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(reject).not.toHaveBeenCalled();
    expect(internals.takePending('missing')).toBeNull();

    const request = vi.fn();
    useProjDialogStore.setState({ request });
    await internals.handleProjectionRequest({
      type: 'NEEDS_PROJECTION',
      requestId: 'missing',
    } as ApolloIOResponse);
    expect(request).not.toHaveBeenCalled();
  });
});
