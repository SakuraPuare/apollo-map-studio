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

export interface ApolloExportOptions {
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

class ApolloIOBridge {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingEntry>();
  private counter = 0;

  importBin(
    filename: string,
    bytes: Uint8Array,
    onProgress?: (progress: ApolloIOProgress) => void,
  ): Promise<ApolloImportWorkerResult> {
    const requestId = this.nextRequestId('import');
    return new Promise((resolve, reject) => {
      this.register(requestId, { kind: 'import', resolve, reject, onProgress, entities: [] });
      this.post({ type: 'IMPORT_BIN', requestId, filename, bytes }, [bytes.buffer]);
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
      this.post({ type: 'IMPORT_TEXT', requestId, filename, bytes }, [bytes.buffer]);
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

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./apolloIO.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<ApolloIOResponse>) => {
      void this.handleMessage(event.data);
    };
    this.worker.onerror = (event) => {
      const error = new Error(`Apollo IO worker error: ${event.message}`);
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      this.pending.clear();
      this.disposeWorker();
    };
    return this.worker;
  }

  private sendExport(
    format: 'bin',
    entities: MapEntity[],
    projString: string,
    onProgress?: (progress: ApolloIOProgress) => void,
    options?: ApolloExportOptions,
  ): Promise<Uint8Array>;
  private sendExport(
    format: 'txt',
    entities: MapEntity[],
    projString: string,
    onProgress?: (progress: ApolloIOProgress) => void,
    options?: ApolloExportOptions,
  ): Promise<Uint8Array>;
  private async sendExport(
    format: ApolloExportFormat,
    entities: MapEntity[],
    projString: string,
    onProgress?: (progress: ApolloIOProgress) => void,
    options: ApolloExportOptions = {},
  ): Promise<Uint8Array | string> {
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
      this.post({ type: 'FINISH_EXPORT', requestId });
    } catch (error) {
      this.rejectPending(requestId, error);
    }

    return result;
  }

  private sendClear(): Promise<void> {
    const requestId = this.nextRequestId('clear');
    return new Promise((resolve, reject) => {
      this.register(requestId, { kind: 'clear', resolve, reject });
      this.post({ type: 'CLEAR', requestId });
    });
  }

  private register(requestId: string, entry: PendingEntryInit): void {
    const timer = setTimeout(() => {
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      pending.reject(new Error(`Apollo IO request timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    }, DEFAULT_TIMEOUT_MS);
    this.pending.set(requestId, { ...entry, timer } as PendingEntry);
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
      await this.yieldToMain();
    }
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

  private async handleMessage(msg: ApolloIOResponse): Promise<void> {
    const entry = this.pending.get(msg.requestId);
    if (!entry) return;

    if (this.handleStreamingMessage(msg, entry)) return;
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
    if (entry.kind === 'import') {
      entry.entities.push(...msg.entities);
      entry.onProgress?.({
        label: 'Importing Apollo map',
        detail: `Receiving entities ${entry.entities.length.toLocaleString()} / ${msg.total.toLocaleString()}`,
        progress: 0.9 + 0.05 * (entry.entities.length / Math.max(1, msg.total)),
      });
    }
    return true;
  }

  private async handleProjectionRequest(msg: ApolloIOResponse): Promise<void> {
    if (msg.type !== 'NEEDS_PROJECTION') return;
    const picked = await useProjDialogStore.getState().request();
    const projString = picked ?? FALLBACK_PROJ;
    this.post({ type: 'RESOLVE_PROJECTION', requestId: msg.requestId, projString });
  }

  private resolveFinalMessage(msg: ApolloIOResponse, entry: PendingEntry): void {
    clearTimeout(entry.timer);
    this.pending.delete(msg.requestId);

    switch (msg.type) {
      case 'IMPORT_RESULT':
        this.resolveImport(msg, entry);
        break;
      case 'EXPORT_BIN_RESULT':
        if (entry.kind === 'exportBin') entry.resolve(msg.bytes);
        break;
      case 'EXPORT_TEXT_RESULT':
        if (entry.kind === 'exportText') entry.resolve(msg.bytes);
        break;
      case 'CLEARED':
        if (entry.kind === 'clear') entry.resolve();
        break;
      case 'ERROR':
        entry.reject(new Error(msg.message));
        break;
      default:
        break;
    }
  }

  private resolveImport(msg: ApolloIOResponse, entry: PendingEntry): void {
    if (msg.type !== 'IMPORT_RESULT' || entry.kind !== 'import') return;
    entry.resolve({
      info: msg.info,
      header: msg.header,
      bounds: msg.bounds,
      entities: entry.entities,
      stats: msg.stats,
    });
  }

  private nextRequestId(prefix: string): string {
    return `${prefix}_${++this.counter}`;
  }

  private disposeWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

export const apolloIOBridge = new ApolloIOBridge();
