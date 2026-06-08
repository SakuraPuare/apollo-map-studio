/* eslint-disable max-lines */
import { UTM_PRESETS } from './proto/projection';
import type {
  ApolloExportBaseMapSource,
  ApolloExportFormat,
  ApolloIOProgress,
  ApolloIORequest,
  ApolloIOResponse,
  ApolloImportStats,
} from './apolloIOProtocol';
import type { ApolloMapBounds, ApolloMapHeader, ApolloMapImportInfo } from '@/store/apolloMapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import type { MapEntity } from '@/types/entities';
import { chunkArray } from '@/lib/chunking';

const FALLBACK_PROJ = UTM_PRESETS.beijing;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const EXPORT_ENTITY_CHUNK_SIZE = 2_000;
const CANCELLED_PROJECTION_PROMPT = Symbol('cancelled projection prompt');

interface ApolloExportOptions {
  baseMapSource?: ApolloExportBaseMapSource;
}

export interface ApolloImportWorkerResult {
  info: ApolloMapImportInfo;
  header: ApolloMapHeader | null;
  bounds: ApolloMapBounds | null;
  entities: MapEntity[];
  stats: ApolloImportStats;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type PendingEntry =
  | {
      kind: 'import';
      resolve: (result: ApolloImportWorkerResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      onProgress?: (progress: ApolloIOProgress) => void;
      entities: MapEntity[];
    }
  | {
      kind: 'exportBin';
      resolve: (bytes: Uint8Array) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      onProgress?: (progress: ApolloIOProgress) => void;
    }
  | {
      kind: 'exportText';
      resolve: (bytes: Uint8Array) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      onProgress?: (progress: ApolloIOProgress) => void;
    }
  | {
      kind: 'clear';
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      onProgress?: (progress: ApolloIOProgress) => void;
    };
type PendingEntryInit = DistributiveOmit<PendingEntry, 'timer'>;

export interface ApolloIOWorkerPort {
  onmessage: ((event: MessageEvent<ApolloIOResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: ApolloIORequest, transfer?: Transferable[]): void;
  terminate(): void;
}

type WorkerFactory = () => ApolloIOWorkerPort;

function defaultWorkerFactory(): ApolloIOWorkerPort {
  return new Worker(new URL('./apolloIO.worker.ts', import.meta.url), { type: 'module' });
}

export class ApolloIOBridge {
  private worker: ApolloIOWorkerPort | null = null;
  private pending = new Map<string, PendingEntry>();
  private counter = 0;
  private projectionPromptQueue: Promise<void> = Promise.resolve();
  private projectionPromptCancelers = new Map<string, () => void>();

  constructor(private readonly createWorker: WorkerFactory = defaultWorkerFactory) {}

  importBin(
    filename: string,
    bytes: Uint8Array,
    onProgress?: (progress: ApolloIOProgress) => void,
  ): Promise<ApolloImportWorkerResult> {
    const requestId = this.nextRequestId('import');
    return new Promise((resolve, reject) => {
      this.register(requestId, { kind: 'import', resolve, reject, onProgress, entities: [] });
      try {
        this.post({ type: 'IMPORT_BIN', requestId, filename, bytes }, [bytes.buffer]);
      } catch (error) {
        this.rejectPending(requestId, error);
      }
    });
  }

  importText(
    filename: string,
    bytes: Uint8Array,
    onProgress?: (progress: ApolloIOProgress) => void,
  ): Promise<ApolloImportWorkerResult> {
    const requestId = this.nextRequestId('import');
    return new Promise((resolve, reject) => {
      this.register(requestId, { kind: 'import', resolve, reject, onProgress, entities: [] });
      try {
        this.post({ type: 'IMPORT_TEXT', requestId, filename, bytes }, [bytes.buffer]);
      } catch (error) {
        this.rejectPending(requestId, error);
      }
    });
  }

  exportBin(
    entities: MapEntity[],
    projString: string,
    onProgress?: (progress: ApolloIOProgress) => void,
    options?: ApolloExportOptions,
  ): Promise<Uint8Array> {
    return this.sendExport('bin', entities, projString, onProgress, options);
  }

  exportText(
    entities: MapEntity[],
    projString: string,
    onProgress?: (progress: ApolloIOProgress) => void,
    options?: ApolloExportOptions,
  ): Promise<Uint8Array> {
    return this.sendExport('txt', entities, projString, onProgress, options);
  }

  clear(): Promise<void> {
    return this.sendClear();
  }

  private ensureWorker(): ApolloIOWorkerPort {
    if (this.worker) return this.worker;
    this.worker = this.createWorker();
    this.worker.onmessage = (event: MessageEvent<ApolloIOResponse>) => {
      void this.handleMessage(event.data).catch((error: unknown) => {
        this.rejectPending(event.data.requestId, error);
      });
    };
    this.worker.onerror = (event) => {
      const error = new Error(`Apollo IO worker error: ${event.message}`);
      for (const [requestId, entry] of this.pending) {
        clearTimeout(entry.timer);
        this.cancelProjectionPrompt(requestId);
        entry.reject(error);
      }
      this.pending.clear();
      this.disposeWorker();
    };
    return this.worker;
  }

  private sendExport(
    format: ApolloExportFormat,
    entities: MapEntity[],
    projString: string,
    onProgress?: (progress: ApolloIOProgress) => void,
    options: ApolloExportOptions = {},
  ): Promise<Uint8Array> {
    const requestId = this.nextRequestId('export');
    const result = new Promise<Uint8Array>((resolve, reject) => {
      if (format === 'bin') {
        this.register(requestId, {
          kind: 'exportBin',
          resolve,
          reject,
          onProgress,
        });
      } else {
        this.register(requestId, {
          kind: 'exportText',
          resolve,
          reject,
          onProgress,
        });
      }
    });

    void this.streamExportRequest(requestId, format, entities, projString, onProgress, options);

    return result;
  }

  private async streamExportRequest(
    requestId: string,
    format: ApolloExportFormat,
    entities: MapEntity[],
    projString: string,
    onProgress: ((progress: ApolloIOProgress) => void) | undefined,
    options: ApolloExportOptions,
  ): Promise<void> {
    try {
      this.post({
        type: 'BEGIN_EXPORT',
        requestId,
        format,
        projString,
        total: entities.length,
        baseMapSource: options.baseMapSource,
      });
      await this.postEntityChunks(requestId, entities, onProgress);
      this.assertPending(requestId);
      this.post({ type: 'FINISH_EXPORT', requestId });
    } catch (error) {
      this.rejectPending(requestId, error);
    }
  }

  private sendClear(): Promise<void> {
    const requestId = this.nextRequestId('clear');
    return new Promise((resolve, reject) => {
      this.rejectNonClearPending(new Error('Apollo IO bridge was cleared.'));
      this.register(requestId, { kind: 'clear', resolve, reject });
      try {
        this.post({ type: 'CLEAR', requestId });
      } catch (error) {
        this.rejectPending(requestId, error);
      }
    });
  }

  private register(requestId: string, entry: PendingEntryInit): void {
    const timer = setTimeout(() => {
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      this.cancelProjectionPrompt(requestId);
      this.postCancelForPending(requestId, pending);
      pending.reject(new Error(`Apollo IO request timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    }, DEFAULT_TIMEOUT_MS);
    this.pending.set(requestId, { ...entry, timer } as PendingEntry);
  }

  private rejectNonClearPending(error: Error): void {
    for (const [requestId, entry] of [...this.pending]) {
      if (entry.kind === 'clear') continue;
      clearTimeout(entry.timer);
      this.pending.delete(requestId);
      this.cancelProjectionPrompt(requestId);
      entry.reject(error);
    }
  }

  private post(request: ApolloIORequest, transfer?: Transferable[]): void {
    const worker = this.ensureWorker();
    if (transfer && transfer.length > 0) worker.postMessage(request, transfer);
    else worker.postMessage(request);
  }

  private async postEntityChunks(
    requestId: string,
    entities: MapEntity[],
    onProgress?: (progress: ApolloIOProgress) => void,
  ): Promise<void> {
    for (const chunk of chunkArray(entities, EXPORT_ENTITY_CHUNK_SIZE)) {
      this.assertPending(requestId);
      this.post({
        type: 'EXPORT_ENTITIES_CHUNK',
        requestId,
        entities: chunk.items,
        offset: chunk.offset,
        total: chunk.total,
      });
      onProgress?.({
        label: 'Exporting Apollo map',
        detail: `Sending entities ${chunk.nextOffset.toLocaleString()} / ${chunk.total.toLocaleString()}`,
        progress: 0.02 + 0.08 * (chunk.nextOffset / Math.max(1, chunk.total)),
      });
      // Sequential by design: yield to the main thread between chunks so a
      // large export streams without blocking the UI. Parallelizing with
      // Promise.all would defeat the backpressure this loop provides.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await this.yieldToMain();
    }
  }

  private rejectPending(requestId: string, error: unknown): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    this.cancelProjectionPrompt(requestId);
    this.postCancelForPending(requestId, entry);
    entry.reject(error instanceof Error ? error : new Error(String(error)));
  }

  private postCancelForPending(requestId: string, entry: PendingEntry): void {
    if (entry.kind === 'import') {
      this.postCancelRequest({ type: 'CANCEL_IMPORT', requestId });
    } else if (entry.kind === 'exportBin' || entry.kind === 'exportText') {
      this.postCancelRequest({ type: 'CANCEL_EXPORT', requestId });
    }
  }

  private postCancelRequest(request: ApolloIORequest): void {
    if (!this.worker) return;
    try {
      this.worker.postMessage(request);
    } catch {
      // The original rejection/timeout reason is more useful to callers.
    }
  }

  private takePending(requestId: string): PendingEntry | null {
    const entry = this.pending.get(requestId);
    if (!entry) return null;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    this.cancelProjectionPrompt(requestId);
    return entry;
  }

  private assertPending(requestId: string): void {
    if (!this.pending.has(requestId)) {
      throw new Error(`Apollo IO request ${requestId} is no longer pending.`);
    }
  }

  private yieldToMain(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  private async handleMessage(msg: ApolloIOResponse): Promise<void> {
    const entry = this.pending.get(msg.requestId);
    if (!entry) return;

    if (this.handleStreamingMessage(msg, entry)) return;
    // This await *performs* the projection handling that the NEEDS_PROJECTION
    // guard below depends on — it cannot be deferred past the guard.
    // react-doctor-disable-next-line react-doctor/async-defer-await
    await this.handleProjectionRequest(msg);
    if (msg.type === 'NEEDS_PROJECTION') return;

    this.resolveFinalMessage(msg, entry);
  }

  private handleStreamingMessage(msg: ApolloIOResponse, entry: PendingEntry): boolean {
    if (msg.type === 'PROGRESS') {
      entry.onProgress?.(msg.progress);
      return true;
    }

    if (msg.type !== 'IMPORT_ENTITIES_CHUNK') return false;
    if (entry.kind !== 'import') {
      this.rejectUnexpectedResponse(msg, entry);
      return true;
    }
    entry.entities.push(...msg.entities);
    entry.onProgress?.({
      label: 'Importing Apollo map',
      detail: `Receiving entities ${entry.entities.length.toLocaleString()} / ${msg.total.toLocaleString()}`,
      progress: 0.9 + 0.05 * (entry.entities.length / Math.max(1, msg.total)),
    });
    return true;
  }

  private async handleProjectionRequest(msg: ApolloIOResponse): Promise<void> {
    if (msg.type !== 'NEEDS_PROJECTION') return;
    const entry = this.pending.get(msg.requestId);
    if (!entry) return;
    if (entry.kind !== 'import') {
      this.rejectUnexpectedResponse(msg, entry);
      return;
    }
    const run = this.projectionPromptQueue.then(() => this.resolveProjectionRequest(msg.requestId));
    this.projectionPromptQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async resolveProjectionRequest(requestId: string): Promise<void> {
    if (!this.pending.has(requestId)) return;
    const cancelled = new Promise<typeof CANCELLED_PROJECTION_PROMPT>((resolve) => {
      this.projectionPromptCancelers.set(requestId, () => resolve(CANCELLED_PROJECTION_PROMPT));
    });
    const prompt = useProjDialogStore.getState().request();
    void prompt.catch(() => undefined);
    let picked: string | null | typeof CANCELLED_PROJECTION_PROMPT;
    try {
      picked = await Promise.race([prompt, cancelled]);
    } catch (error) {
      this.projectionPromptCancelers.delete(requestId);
      this.rejectPending(requestId, error);
      return;
    }
    this.projectionPromptCancelers.delete(requestId);
    if (picked === CANCELLED_PROJECTION_PROMPT) return;
    if (!this.pending.has(requestId)) return;
    const projString = picked ?? FALLBACK_PROJ;
    try {
      this.post({ type: 'RESOLVE_PROJECTION', requestId, projString });
    } catch (error) {
      this.rejectPending(requestId, error);
    }
  }

  private cancelProjectionPrompt(requestId: string): void {
    const cancel = this.projectionPromptCancelers.get(requestId);
    if (!cancel) return;
    this.projectionPromptCancelers.delete(requestId);
    cancel();
  }

  private resolveFinalMessage(msg: ApolloIOResponse, entry: PendingEntry): void {
    switch (msg.type) {
      case 'IMPORT_RESULT':
        if (entry.kind !== 'import') {
          this.rejectUnexpectedResponse(msg, entry);
          return;
        }
        try {
          this.post({ type: 'ACK_IMPORT', requestId: msg.requestId });
        } catch (error) {
          this.rejectPending(msg.requestId, error);
          return;
        }
        this.takePending(msg.requestId);
        entry.resolve({
          info: msg.info,
          header: msg.header,
          bounds: msg.bounds,
          entities: entry.entities,
          stats: msg.stats,
        });
        break;
      case 'EXPORT_BIN_RESULT':
        if (entry.kind !== 'exportBin') {
          this.rejectUnexpectedResponse(msg, entry);
          return;
        }
        this.takePending(msg.requestId);
        entry.resolve(msg.bytes);
        break;
      case 'EXPORT_TEXT_RESULT':
        if (entry.kind !== 'exportText') {
          this.rejectUnexpectedResponse(msg, entry);
          return;
        }
        this.takePending(msg.requestId);
        entry.resolve(msg.bytes);
        break;
      case 'CLEARED':
        if (entry.kind !== 'clear') {
          this.rejectUnexpectedResponse(msg, entry);
          return;
        }
        this.takePending(msg.requestId);
        entry.resolve();
        break;
      case 'ERROR':
        this.takePending(msg.requestId);
        entry.reject(errorFromWorkerMessage(msg));
        break;
      default:
        this.rejectUnexpectedResponse(msg, entry);
    }
  }

  private rejectUnexpectedResponse(msg: ApolloIOResponse, entry: PendingEntry): void {
    this.rejectPending(
      msg.requestId,
      new Error(`Unexpected Apollo IO response ${msg.type} for ${entry.kind} request.`),
    );
  }

  private nextRequestId(prefix: string): string {
    return `${prefix}_${++this.counter}`;
  }

  private disposeWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

function errorFromWorkerMessage(msg: Extract<ApolloIOResponse, { type: 'ERROR' }>): Error {
  const error = new Error(msg.message);
  if (msg.stack) error.stack = msg.stack;
  return error;
}

export const apolloIOBridge = new ApolloIOBridge();
