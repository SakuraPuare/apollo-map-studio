import type { WorkerPublicRequest, WorkerRequest, WorkerResponse } from './protocol';

const DEFAULT_TIMEOUT = 120_000; // Full map-data cold-layer sync can exceed 10s on large maps.
const SYNC_ENTITY_CHUNK_SIZE = 2_000;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type WorkerRequestPayload = DistributiveOmit<WorkerPublicRequest, 'requestId'>;

type PendingEntry = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  chunks?: Extract<WorkerResponse, { type: 'COLD_GROUPS_CHUNK' }>[];
};

export class SpatialWorkerBridge {
  private worker: Worker;
  private pending = new Map<string, PendingEntry>();
  private counter = 0;
  private disposed = false;

  constructor() {
    this.worker = new Worker(new URL('./spatial.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const { requestId } = msg;
      const entry = this.pending.get(requestId);
      if (entry) {
        if (msg.type === 'COLD_GROUPS_CHUNK') {
          entry.chunks ??= [];
          entry.chunks.push(msg);
          return;
        }
        clearTimeout(entry.timer);
        this.pending.delete(requestId);
        entry.resolve(this.mergeChunks(entry, msg));
      }
    };
    this.worker.onerror = (e) => {
      const err = new Error(`Worker error: ${e.message}`);
      this.pending.forEach(({ reject, timer }) => {
        clearTimeout(timer);
        reject(err);
      });
      this.pending.clear();
    };
  }

  send<T extends WorkerResponse>(
    request: WorkerRequestPayload,
    timeout = DEFAULT_TIMEOUT,
  ): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Worker disposed'));
    const requestId = `req_${++this.counter}`;
    const messagePromise = this.registerPending<T>(requestId, timeout);
    if (request.type === 'SYNC' && request.entities.length > SYNC_ENTITY_CHUNK_SIZE) {
      void this.postChunkedSync(requestId, request).catch((error: unknown) => {
        this.rejectPending(requestId, error);
      });
    } else {
      this.worker.postMessage({ ...request, requestId });
    }
    return messagePromise;
  }

  private registerPending<T extends WorkerResponse>(
    requestId: string,
    timeout: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Worker request ${requestId} timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(requestId, {
        resolve: resolve as (value: WorkerResponse) => void,
        reject,
        timer,
      });
    });
  }

  private async postChunkedSync(
    requestId: string,
    request: Extract<WorkerRequestPayload, { type: 'SYNC' }>,
  ): Promise<void> {
    const total = request.entities.length;
    this.worker.postMessage({
      type: 'SYNC_BEGIN',
      requestId,
      total,
      excludeId: request.excludeId,
    } satisfies Extract<WorkerRequest, { type: 'SYNC_BEGIN' }>);

    for (let offset = 0; offset < total; offset += SYNC_ENTITY_CHUNK_SIZE) {
      this.worker.postMessage({
        type: 'SYNC_CHUNK',
        requestId,
        entities: request.entities.slice(offset, offset + SYNC_ENTITY_CHUNK_SIZE),
        offset,
        total,
      } satisfies Extract<WorkerRequest, { type: 'SYNC_CHUNK' }>);
      await this.yieldToMain();
    }

    this.worker.postMessage({
      type: 'SYNC_FINISH',
      requestId,
    } satisfies Extract<WorkerRequest, { type: 'SYNC_FINISH' }>);
  }

  private rejectPending(requestId: string, error: unknown): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.reject(error instanceof Error ? error : new Error(String(error)));
  }

  private yieldToMain(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  private mergeChunks(entry: PendingEntry, msg: WorkerResponse): WorkerResponse {
    if (msg.type !== 'COLD_READY' || !entry.chunks?.length) return msg;
    const chunks = [...entry.chunks].sort((a, b) => a.offset - b.offset);
    return {
      ...msg,
      groups: chunks.flatMap((chunk) => chunk.groups),
    };
  }

  dispose() {
    this.disposed = true;
    this.worker.terminate();
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error('Worker terminated'));
    });
    this.pending.clear();
  }
}
