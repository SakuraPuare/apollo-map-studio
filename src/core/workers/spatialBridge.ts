import type { WorkerRequest, WorkerResponse } from './protocol';

const DEFAULT_TIMEOUT = 10_000; // 10s

type PendingEntry = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class SpatialWorkerBridge {
  private worker: Worker;
  private pending = new Map<string, PendingEntry>();
  private counter = 0;
  private disposed = false;

  constructor() {
    this.worker = new Worker(
      new URL('./spatial.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { requestId } = e.data;
      const entry = this.pending.get(requestId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(requestId);
        entry.resolve(e.data);
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
    request: Omit<WorkerRequest, 'requestId'>,
    timeout = DEFAULT_TIMEOUT,
  ): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Worker disposed'));
    const requestId = `req_${++this.counter}`;
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
      this.worker.postMessage({ ...request, requestId });
    });
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
