import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApolloIOBridge, type ApolloIOWorkerPort } from '../apolloIOBridge';
import type { ApolloIORequest, ApolloIOResponse } from '../apolloIOProtocol';
import { UTM_PRESETS } from '../proto/projection';
import { useProjDialogStore } from '@/store/projDialogStore';

class FakeWorker implements ApolloIOWorkerPort {
  onmessage: ((event: MessageEvent<ApolloIOResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: Array<{ request: ApolloIORequest; transfer?: Transferable[] }> = [];
  postMessage = vi.fn((request: ApolloIORequest, transfer?: Transferable[]) => {
    this.messages.push({ request, transfer });
  });
  terminate = vi.fn();

  emit(response: ApolloIOResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<ApolloIOResponse>);
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
  useProjDialogStore.setState({ request: originalProjRequest });
});

describe('ApolloIOBridge edge cases', () => {
  it('wraps non-Error projection rejections before rejecting the pending import', async () => {
    useProjDialogStore.setState({
      request: vi.fn().mockRejectedValue('projection dialog rejected'),
    });

    const { bridge, workers } = createBridge();
    const result = bridge.importText('bad-projection.txt', new Uint8Array([1]));
    const rejection = result.catch((error: unknown) => error);
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    await flushPromises();

    await expect(rejection).resolves.toMatchObject({
      name: 'Error',
      message: 'projection dialog rejected',
    });
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'CANCEL_IMPORT',
      requestId: 'import_1',
    });
  });

  it('keeps projection prompts usable after a synchronous prompt failure', async () => {
    const request = vi
      .fn<() => Promise<string | null>>()
      .mockImplementationOnce(() => {
        throw new Error('projection prompt unavailable');
      })
      .mockResolvedValueOnce(UTM_PRESETS.sunnyvale);
    useProjDialogStore.setState({ request });

    const { bridge, workers } = createBridge();
    const first = bridge.importText('first.txt', new Uint8Array([1]));
    const firstRejection = expect(first).rejects.toThrow('projection prompt unavailable');

    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    await flushPromises();
    await firstRejection;

    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual([
      'IMPORT_TEXT',
      'CANCEL_IMPORT',
    ]);

    const second = bridge.importText('second.txt', new Uint8Array([2]));
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_2' });
    await flushPromises();

    expect(request).toHaveBeenCalledTimes(2);
    expect(workers[0]!.messages.at(-1)!.request).toEqual({
      type: 'RESOLVE_PROJECTION',
      requestId: 'import_2',
      projString: UTM_PRESETS.sunnyvale,
    });

    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_2',
      info: {
        filename: 'second.txt',
        counts: {},
        projString: UTM_PRESETS.sunnyvale,
        importedAt: 1_700_000_000_000,
      },
      header: null,
      bounds: null,
      stats: importStats,
    });

    await expect(second).resolves.toMatchObject({
      info: { filename: 'second.txt', projString: UTM_PRESETS.sunnyvale },
    });
  });

  it('does not prompt for a queued projection request after its pending import vanishes', async () => {
    const firstProjection = deferred<string | null>();
    const request = vi.fn().mockReturnValueOnce(firstProjection.promise);
    useProjDialogStore.setState({ request });

    const { bridge, workers } = createBridge();
    const first = bridge.importText('first.txt', new Uint8Array([1]));
    const second = bridge.importText('second.txt', new Uint8Array([2]));
    const secondRejection = expect(second).rejects.toThrow('second decode failed');

    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_2' });
    await flushPromises();

    expect(request).toHaveBeenCalledTimes(1);

    workers[0]!.emit({ type: 'ERROR', requestId: 'import_2', message: 'second decode failed' });
    await secondRejection;

    firstProjection.resolve(UTM_PRESETS.sunnyvale);
    await flushPromises();
    await flushPromises();

    expect(request).toHaveBeenCalledTimes(1);
    expect(
      workers[0]!.messages
        .map((message) => message.request)
        .filter((requestMessage) => requestMessage.type === 'RESOLVE_PROJECTION'),
    ).toEqual([
      {
        type: 'RESOLVE_PROJECTION',
        requestId: 'import_1',
        projString: UTM_PRESETS.sunnyvale,
      },
    ]);

    workers[0]!.emit({
      type: 'IMPORT_RESULT',
      requestId: 'import_1',
      info: {
        filename: 'first.txt',
        counts: {},
        projString: UTM_PRESETS.sunnyvale,
        importedAt: 1_700_000_000_000,
      },
      header: null,
      bounds: null,
      stats: importStats,
    });

    await expect(first).resolves.toMatchObject({
      info: { filename: 'first.txt', projString: UTM_PRESETS.sunnyvale },
    });
  });

  it('does not post a resolved projection after the import is removed in the same race', async () => {
    const projection = deferred<string | null>();
    useProjDialogStore.setState({
      request: vi.fn().mockReturnValue(projection.promise),
    });

    const { bridge, workers } = createBridge();
    const result = bridge.importText('race.txt', new Uint8Array([1]));
    const rejection = expect(result).rejects.toThrow('race decode failed');

    workers[0]!.emit({ type: 'NEEDS_PROJECTION', requestId: 'import_1' });
    await flushPromises();

    projection.resolve(UTM_PRESETS.sunnyvale);
    workers[0]!.emit({ type: 'ERROR', requestId: 'import_1', message: 'race decode failed' });

    await rejection;
    await flushPromises();

    expect(workers[0]!.messages.map((message) => message.request.type)).toEqual(['IMPORT_TEXT']);
  });
});
