import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityFeatureGroup, WorkerRequest, WorkerResponse } from '../protocol';

const { handleRequestMock } = vi.hoisted(() => ({
  handleRequestMock: vi.fn(),
}));

vi.mock('../spatialRequests', () => ({
  handleRequest: handleRequestMock,
}));

interface WorkerHandle {
  responses: WorkerResponse[];
  send(req: WorkerRequest): void;
}

async function loadWorker(): Promise<WorkerHandle> {
  vi.resetModules();

  const responses: WorkerResponse[] = [];
  let handler: ((e: MessageEvent<WorkerRequest>) => void) | undefined;

  vi.stubGlobal('self', {
    set onmessage(h: (e: MessageEvent<WorkerRequest>) => void) {
      handler = h;
    },
  });
  vi.stubGlobal('postMessage', (msg: WorkerResponse) => {
    responses.push(msg);
  });

  await import('../spatial.worker');

  if (!handler) {
    throw new Error('spatial.worker did not register self.onmessage');
  }

  return {
    responses,
    send(req: WorkerRequest) {
      handler!(new MessageEvent<WorkerRequest>('message', { data: req }));
    },
  };
}

function makeGroups(total: number): EntityFeatureGroup[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `entity_${index}`,
    features: [],
  }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  handleRequestMock.mockReset();
});

describe('spatial.worker chunked cold responses', () => {
  it('splits oversized COLD_READY groups into chunks before COLD_READY', async () => {
    const requestId = 'cold_chunked';
    const groups = makeGroups(1_001);
    handleRequestMock.mockImplementation(
      (_state: unknown, req: WorkerRequest, respond: (msg: WorkerResponse) => void): void => {
        respond({
          type: 'COLD_READY',
          requestId: req.requestId,
          featureCollection: { type: 'FeatureCollection', features: [] },
          groups,
        });
      },
    );

    const worker = await loadWorker();
    worker.send({ type: 'SYNC', requestId, entities: [] });

    expect(worker.responses).toHaveLength(3);
    expect(worker.responses.map((msg) => msg.type)).toEqual([
      'COLD_GROUPS_CHUNK',
      'COLD_GROUPS_CHUNK',
      'COLD_READY',
    ]);

    const [first, second, ready] = worker.responses;
    if (first?.type !== 'COLD_GROUPS_CHUNK' || second?.type !== 'COLD_GROUPS_CHUNK') {
      throw new Error('expected COLD_GROUPS_CHUNK messages');
    }
    expect(first).toMatchObject({ requestId, offset: 0, total: groups.length });
    expect(first.groups).toHaveLength(1_000);
    expect(first.groups[0]?.id).toBe('entity_0');
    expect(first.groups.at(-1)?.id).toBe('entity_999');

    expect(second).toMatchObject({ requestId, offset: 1_000, total: groups.length });
    expect(second.groups).toHaveLength(1);
    expect(second.groups[0]?.id).toBe('entity_1000');

    if (ready?.type !== 'COLD_READY') throw new Error('expected final COLD_READY');
    expect(ready).toMatchObject({ requestId, groups: [] });
    expect(ready.featureCollection).toBeUndefined();
  });
});
