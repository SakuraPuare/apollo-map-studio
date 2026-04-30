import { decodeMapBin, encodeMapBin } from './proto/binCodec';
import { decodeMapText, encodeMapText } from './proto/textCodec';
import {
  apolloMapToLonLat,
  apolloMapFromLonLat,
  readHeaderProjString,
  entityCounts,
} from './proto/adapter';
import { UTM_PRESETS } from './proto/projection';
import { useApolloMapStore, type ApolloMapImportInfo } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import { pickFile, readFileAsBytes, readFileAsText, downloadBlob } from './fileIO';
import { apolloMapToEntities, entitiesToApolloMap } from './proto/entityBridge';
import { reconcileOverlaps } from '@/core/elements/overlap';
import { SpatialIndex } from '@/core/elements/overlap/spatialIndex';
import type { MapEntity } from '@/types/entities';

/**
 * Default PROJ.4 fallback when the imported map's header has no
 * projection field (common for fleet-internal Chinese maps that omit it).
 * UTM 50N covers Beijing/Shenzhen, the most common deployment regions.
 * The user can override this later through a region/zone picker.
 */
const FALLBACK_PROJ = UTM_PRESETS.beijing;

/** Common return shape for any successful import. */
interface ImportResult {
  rawMap: Record<string, unknown>;
  info: ApolloMapImportInfo;
}

async function buildImportResult(
  decodedEnu: Record<string, unknown>,
  filename: string,
): Promise<ImportResult> {
  let projString = readHeaderProjString(decodedEnu);
  if (!projString) {
    // Ask the UI to pick one. If no UI is mounted (e.g. in tests) the
    // request returns null immediately and we fall back to UTM 50N.
    const picked = await useProjDialogStore.getState().request();
    if (picked) {
      projString = picked;
    } else {
      projString = FALLBACK_PROJ;

      console.warn(
        `[mapIO] header has no projection.proj — falling back to ${projString}.`,
        'Set Header.projection.proj to round-trip with the original CRS.',
      );
    }
  }
  const { map: lonLatMap, projString: usedProj } = await apolloMapToLonLat(decodedEnu, projString);
  const info: ApolloMapImportInfo = {
    filename,
    counts: entityCounts(lonLatMap),
    projString: usedProj,
    importedAt: Date.now(),
  };
  return { rawMap: lonLatMap, info };
}

// ──────────────────────────────────────────────────────────────────────
// Import
// ──────────────────────────────────────────────────────────────────────

export async function importApolloBinFile(file: File): Promise<ImportResult> {
  const bytes = await readFileAsBytes(file);
  const decoded = await decodeMapBin(bytes);
  return buildImportResult(decoded, file.name);
}

export async function importApolloTextFile(file: File): Promise<ImportResult> {
  const text = await readFileAsText(file);
  const decoded = await decodeMapText(text);
  return buildImportResult(decoded, file.name);
}

/**
 * Open one file picker that accepts both Apollo formats and routes by
 * filename suffix (`.bin` → binary protobuf, `.txt`/`.pb.txt` → text
 * protobuf). The picker is the only entry point exposed to the menu —
 * having a single "Import Apollo Map…" action keeps the File menu tight
 * and avoids forcing the user to know which codec their file uses.
 */
export async function pickAndImportApollo(): Promise<ApolloMapImportInfo | null> {
  const file = await pickFile('.bin,.txt,.pb.txt,application/octet-stream,text/plain');
  if (!file) return null;
  const isText = /\.(pb\.txt|txt)$/i.test(file.name);
  return runImport(() => (isText ? importApolloTextFile(file) : importApolloBinFile(file)));
}

async function runImport(fn: () => Promise<ImportResult>): Promise<ApolloMapImportInfo | null> {
  const store = useApolloMapStore.getState();
  try {
    const { rawMap, info } = await fn();
    store.setMap(rawMap, info);

    // Bridge: lift bridged entity types (currently Crosswalk) out of the
    // raw map into the editor's mapStore so cold-/hot-layer + selection
    // work on them. Anything not bridged stays in apolloMapStore.rawMap
    // untouched and is round-tripped on export.
    //
    // 走 batchImport：一次 zundo 事务 + 一次 full overlap reconcile，避免
    // 逐实体 addEntity 把 history 打爆（5w 实体 == 5w 步 undo，limit 500
    // 瞬间溢出）+ 累积漂移（每步只看增量 dirty 集，一致性靠累加）.
    const mapStore = useMapStore.getState();
    const entities = apolloMapToEntities(rawMap as Parameters<typeof apolloMapToEntities>[0]);
    mapStore.batchImport(entities);

    return info;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    store.setError(`Import failed: ${msg}`);

    console.error('[mapIO] import failed', e);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────────────

async function buildExportPayload(
  rawMap: Record<string, unknown>,
  projString: string,
): Promise<Record<string, unknown>> {
  // 0. GAP-4: 导出前强制跑一次 full reconcile。编辑期 incremental 受 dirtyIds
  //    集合影响，长会话下偶发漏算的可能性永远 > 0；导出前 full 一遍兜底，
  //    保证 .bin 出仓的拓扑闭环一定与几何一致。reconcile 是纯函数，用
  //    transient Map 计算后写回，不污染 live store / 不进 zundo 历史。
  //
  //    传入**独立** SpatialIndex —— 默认共享单例会被 transient 实体的 ref
  //    覆盖 lastSeen，export 完成后下次 incremental 编辑会全部 ref-miss
  //    走全量重建（性能黑洞），更糟的是 transient 实体引用会泄漏进 sharedIndex。
  const liveSnapshot = useMapStore.getState().entities;
  const transient = new Map<string, MapEntity>(liveSnapshot);
  const isolatedIndex = new SpatialIndex();
  const patch = reconcileOverlaps(transient, { mode: 'full' }, isolatedIndex);
  for (const id of patch.removedOverlapIds) transient.delete(id);
  for (const [id, e] of patch.changes) transient.set(id, e);
  const editorEntities = Array.from(transient.values());

  // 1. Merge editor changes from mapStore back into the raw map for any
  //    entity types we have bridges for. Other arrays (lane, road, etc.)
  //    pass through verbatim.
  const merged = entitiesToApolloMap(rawMap, editorEntities);
  // 2. Reproject lon/lat back to UTM ENU using the same PROJ the import used.
  const { map: enuMap } = await apolloMapFromLonLat(merged, projString);
  return enuMap;
}

function suggestedFilename(originalName: string, ext: 'bin' | 'txt'): string {
  const base = originalName.replace(/\.(bin|txt|pb\.txt)$/i, '') || 'apollo-map';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${base}-${stamp}.${ext}`;
}

/**
 * Read the current edit state, run the export pipeline (overlap reconcile +
 * lon/lat → ENU reproject), and return the ENU-space Apollo map ready to be
 * encoded by either codec. Returns null if there is nothing to export and
 * surfaces the error to the apolloMapStore for the UI to display.
 */
async function prepareExport(): Promise<{
  enuMap: Record<string, unknown>;
  info: ApolloMapImportInfo;
} | null> {
  const { rawMap, info } = useApolloMapStore.getState();
  if (!rawMap || !info) {
    useApolloMapStore.getState().setError('Nothing to export — import a map first.');
    return null;
  }
  const enuMap = await buildExportPayload(rawMap, info.projString);
  return { enuMap, info };
}

/**
 * Export the current map as Apollo binary protobuf (`base_map.bin`). This
 * is the canonical runtime format consumed by Apollo's map loader and the
 * default `Save` action.
 */
export async function exportApolloBin(): Promise<void> {
  const prepared = await prepareExport();
  if (!prepared) return;
  const bytes = await encodeMapBin(prepared.enuMap);
  // Copy into a fresh ArrayBuffer so Blob accepts it regardless of whether
  // the underlying buffer is ArrayBuffer or SharedArrayBuffer (TS narrows
  // the BlobPart type to ArrayBuffer only).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, suggestedFilename(prepared.info.filename, 'bin'));
}

/**
 * Export the current map as Apollo text protobuf (`base_map.txt`). Useful
 * for human inspection, diffing, and debugging — Apollo runtime can also
 * load it but binary is preferred for size.
 */
export async function exportApolloText(): Promise<void> {
  const prepared = await prepareExport();
  if (!prepared) return;
  const text = await encodeMapText(prepared.enuMap);
  const blob = new Blob([text], { type: 'text/plain' });
  downloadBlob(blob, suggestedFilename(prepared.info.filename, 'txt'));
}
