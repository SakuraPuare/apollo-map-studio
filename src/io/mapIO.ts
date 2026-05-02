import { useApolloMapStore, type ApolloMapImportInfo } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import { pickFile, readFileAsBytes, downloadBlob } from './fileIO';
import { apolloIOBridge, type ApolloImportWorkerResult } from './apolloIOBridge';
import type { ApolloIOProgress } from './apolloIOProtocol';
import type { MapEntity } from '@/types/entities';

const TASK_IMPORT = 'apollo-import';
const TASK_EXPORT = 'apollo-export';

function reportProgress(taskId: string, progress: ApolloIOProgress): void {
  useTaskProgressStore.getState().updateTask(taskId, {
    label: progress.label,
    detail: progress.detail,
    progress: progress.progress,
  });
}

function beginTask(id: string, label: string, detail?: string): void {
  useTaskProgressStore.getState().beginTask({
    id,
    label,
    detail,
    progress: null,
    visibleAfterMs: 1000,
  });
}

function endTask(id: string): void {
  useTaskProgressStore.getState().endTask(id);
}

async function importApolloBinFile(file: File): Promise<ApolloImportWorkerResult> {
  const bytes = await readFileAsBytes(file);
  return apolloIOBridge.importBin(file.name, bytes, (progress) =>
    reportProgress(TASK_IMPORT, progress),
  );
}

async function importApolloTextFile(file: File): Promise<ApolloImportWorkerResult> {
  const bytes = await readFileAsBytes(file);
  return apolloIOBridge.importText(file.name, bytes, (progress) =>
    reportProgress(TASK_IMPORT, progress),
  );
}

/**
 * Open one file picker that accepts both Apollo formats and routes by
 * filename suffix (`.bin` -> binary protobuf, `.txt`/`.pb.txt` -> text
 * protobuf). Long import work runs in a Web Worker and surfaces progress
 * after 1s, so the browser window remains responsive on official map_data.
 */
export async function pickAndImportApollo(): Promise<ApolloMapImportInfo | null> {
  const file = await pickFile('.bin,.txt,.pb.txt,application/octet-stream,text/plain');
  if (!file) return null;

  beginTask(TASK_IMPORT, 'Importing Apollo map', file.name);
  try {
    const isText = /\.(pb\.txt|txt)$/i.test(file.name);
    const result = isText ? await importApolloTextFile(file) : await importApolloBinFile(file);
    useApolloMapStore.getState().setImported(result.info, result.bounds, result.header);
    useMapStore.getState().replaceImportedEntities(result.entities);
    return result.info;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    useApolloMapStore.getState().setError(`Import failed: ${msg}`);
    console.error('[mapIO] import failed', error);
    return null;
  } finally {
    endTask(TASK_IMPORT);
  }
}

function suggestedFilename(originalName: string, ext: 'bin' | 'txt'): string {
  const base = originalName.replace(/\.(bin|txt|pb\.txt)$/i, '') || 'apollo-map';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${base}-${stamp}.${ext}`;
}

function currentExportContext(): { info: ApolloMapImportInfo; entities: MapEntity[] } | null {
  const { info } = useApolloMapStore.getState();
  if (!info) {
    useApolloMapStore.getState().setError('Nothing to export - import a map first.');
    return null;
  }
  const entities = Array.from(useMapStore.getState().entities.values());
  return { info, entities };
}

/**
 * Export the current map as Apollo binary protobuf (`base_map.bin`). Export
 * projection, overlap recompute and protobuf encode are worker-side.
 */
export async function exportApolloBin(): Promise<void> {
  const ctx = currentExportContext();
  if (!ctx) return;

  beginTask(TASK_EXPORT, 'Exporting Apollo map', ctx.info.filename);
  try {
    const bytes = await apolloIOBridge.exportBin(ctx.entities, ctx.info.projString, (progress) =>
      reportProgress(TASK_EXPORT, progress),
    );
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
    downloadBlob(blob, suggestedFilename(ctx.info.filename, 'bin'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    useApolloMapStore.getState().setError(`Export failed: ${msg}`);
    console.error('[mapIO] export failed', error);
  } finally {
    endTask(TASK_EXPORT);
  }
}

/**
 * Export the current map as Apollo text protobuf (`base_map.txt`). Useful for
 * human inspection; heavy serialization still stays off the main thread.
 */
export async function exportApolloText(): Promise<void> {
  const ctx = currentExportContext();
  if (!ctx) return;

  beginTask(TASK_EXPORT, 'Exporting Apollo map', ctx.info.filename);
  try {
    const bytes = await apolloIOBridge.exportText(ctx.entities, ctx.info.projString, (progress) =>
      reportProgress(TASK_EXPORT, progress),
    );
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'text/plain' });
    downloadBlob(blob, suggestedFilename(ctx.info.filename, 'txt'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    useApolloMapStore.getState().setError(`Export failed: ${msg}`);
    console.error('[mapIO] export failed', error);
  } finally {
    endTask(TASK_EXPORT);
  }
}
