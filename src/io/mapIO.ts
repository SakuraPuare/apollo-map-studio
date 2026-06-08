import { useApolloMapStore, type ApolloMapImportInfo } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import { pickFile, readFileAsBytes, downloadBlob } from './fileIO';
import { apolloIOBridge, type ApolloImportWorkerResult } from './apolloIOBridge';
import type { ApolloExportBaseMapSource, ApolloIOProgress } from './apolloIOProtocol';
import { createBlankApolloMap } from './proto/blankApolloMap';
import { isApolloMapEntity } from './proto/entityBridge';
import type { MapEntity } from '@/types/entities';

const TASK_IMPORT = 'apollo-import';
const TASK_EXPORT = 'apollo-export';
const NEW_MAP_FILENAME = 'apollo-map';

type ApolloIOBridgeLike = Pick<
  typeof apolloIOBridge,
  'importBin' | 'importText' | 'exportBin' | 'exportText'
>;

let activeApolloIOBridge: ApolloIOBridgeLike = apolloIOBridge;

export function setApolloIOBridgeForTests(bridge: ApolloIOBridgeLike): () => void {
  const previous = activeApolloIOBridge;
  activeApolloIOBridge = bridge;
  return () => {
    activeApolloIOBridge = previous;
  };
}

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
  return activeApolloIOBridge.importBin(file.name, bytes, (progress) =>
    reportProgress(TASK_IMPORT, progress),
  );
}

async function importApolloTextFile(file: File): Promise<ApolloImportWorkerResult> {
  const bytes = await readFileAsBytes(file);
  return activeApolloIOBridge.importText(file.name, bytes, (progress) =>
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
    const info: ApolloMapImportInfo = { ...result.info, source: 'imported' };
    useApolloMapStore.getState().setImported(info, result.bounds, result.header);
    useMapStore.getState().replaceImportedEntities(result.entities);
    return info;
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
  const base = originalName.replace(/\.(pb\.txt|bin|txt)$/i, '') || 'apollo-map';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${base}-${stamp}.${ext}`;
}

interface ExportContext {
  info: ApolloMapImportInfo;
  entities: MapEntity[];
  baseMapSource: ApolloExportBaseMapSource;
  isCreatedMap: boolean;
}

function countEntitiesByType(entities: MapEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) counts[entity.entityType] = (counts[entity.entityType] ?? 0) + 1;
  return counts;
}

async function currentExportContext(): Promise<ExportContext | null> {
  const { info } = useApolloMapStore.getState();
  const entities = Array.from(useMapStore.getState().entities.values());
  const exportableEntities = entities.filter(isApolloMapEntity);

  if (info) {
    return {
      info,
      entities: exportableEntities,
      baseMapSource: info.source === 'created' ? 'blank' : 'cached',
      isCreatedMap: info.source === 'created',
    };
  }

  if (exportableEntities.length === 0) {
    useApolloMapStore
      .getState()
      .setError('Nothing to export - draw or import Apollo map elements first.');
    return null;
  }

  const projString = await useProjDialogStore.getState().request();
  if (!projString) return null;

  return {
    info: {
      source: 'created',
      filename: NEW_MAP_FILENAME,
      counts: countEntitiesByType(exportableEntities),
      projString,
      importedAt: Date.now(),
    },
    entities: exportableEntities,
    baseMapSource: 'blank',
    isCreatedMap: true,
  };
}

function rememberCreatedExport(info: ApolloMapImportInfo): void {
  const header = createBlankApolloMap(info.projString).header as Record<string, unknown>;
  useApolloMapStore.getState().setImported(info, null, header);
}

/**
 * Export the current map as Apollo binary protobuf (`base_map.bin`). Export
 * projection, overlap recompute and protobuf encode are worker-side.
 */
export async function exportApolloBin(): Promise<void> {
  const ctx = await currentExportContext();
  if (!ctx) return;

  beginTask(TASK_EXPORT, 'Exporting Apollo map', ctx.info.filename);
  try {
    const bytes = await activeApolloIOBridge.exportBin(
      ctx.entities,
      ctx.info.projString,
      (progress) => reportProgress(TASK_EXPORT, progress),
      { baseMapSource: ctx.baseMapSource },
    );
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
    downloadBlob(blob, suggestedFilename(ctx.info.filename, 'bin'));
    if (ctx.isCreatedMap) rememberCreatedExport(ctx.info);
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
  const ctx = await currentExportContext();
  if (!ctx) return;

  beginTask(TASK_EXPORT, 'Exporting Apollo map', ctx.info.filename);
  try {
    const bytes = await activeApolloIOBridge.exportText(
      ctx.entities,
      ctx.info.projString,
      (progress) => reportProgress(TASK_EXPORT, progress),
      { baseMapSource: ctx.baseMapSource },
    );
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'text/plain' });
    downloadBlob(blob, suggestedFilename(ctx.info.filename, 'txt'));
    if (ctx.isCreatedMap) rememberCreatedExport(ctx.info);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    useApolloMapStore.getState().setError(`Export failed: ${msg}`);
    console.error('[mapIO] export failed', error);
  } finally {
    endTask(TASK_EXPORT);
  }
}
