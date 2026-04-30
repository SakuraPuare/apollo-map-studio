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
import { packAms, unpackAms } from './projectFile';
import { apolloMapToEntities, entitiesToApolloMap } from './proto/entityBridge';

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

/** Open file picker (.bin) and import; updates the apolloMapStore on success. */
export async function pickAndImportBin(): Promise<ApolloMapImportInfo | null> {
  const file = await pickFile('.bin,application/octet-stream');
  if (!file) return null;
  return runImport(() => importApolloBinFile(file));
}

/** Open file picker (.txt/.pb.txt) and import; updates the apolloMapStore on success. */
export async function pickAndImportText(): Promise<ApolloMapImportInfo | null> {
  const file = await pickFile('.txt,.pb.txt,text/plain');
  if (!file) return null;
  return runImport(() => importApolloTextFile(file));
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
    const mapStore = useMapStore.getState();
    const entities = apolloMapToEntities(rawMap as Parameters<typeof apolloMapToEntities>[0]);
    for (const entity of entities) {
      mapStore.addEntity(entity);
    }

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
  // 1. Merge editor changes from mapStore back into the raw map for any
  //    entity types we have bridges for. Other arrays (lane, road, etc.)
  //    pass through verbatim.
  const editorEntities = Array.from(useMapStore.getState().entities.values());
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

export async function exportApolloBin(): Promise<void> {
  const { rawMap, info } = useApolloMapStore.getState();
  if (!rawMap || !info) {
    useApolloMapStore.getState().setError('Nothing to export — import a map first.');
    return;
  }
  const enuMap = await buildExportPayload(rawMap, info.projString);
  const bytes = await encodeMapBin(enuMap);
  // Copy into a fresh ArrayBuffer so Blob constructor accepts it cleanly
  // regardless of whether the underlying buffer is ArrayBuffer or
  // SharedArrayBuffer (TS narrows the BlobPart type to ArrayBuffer only).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, suggestedFilename(info.filename, 'bin'));
}

export async function exportApolloText(): Promise<void> {
  const { rawMap, info } = useApolloMapStore.getState();
  if (!rawMap || !info) {
    useApolloMapStore.getState().setError('Nothing to export — import a map first.');
    return;
  }
  const enuMap = await buildExportPayload(rawMap, info.projString);
  const text = await encodeMapText(enuMap);
  const blob = new Blob([text], { type: 'text/plain' });
  downloadBlob(blob, suggestedFilename(info.filename, 'txt'));
}

// ──────────────────────────────────────────────────────────────────────
// Project file (.ams) — Apollo bin + sidecar manifest in a single zip
// ──────────────────────────────────────────────────────────────────────

function suggestedAmsFilename(info: ApolloMapImportInfo): string {
  const base = info.filename.replace(/\.(bin|txt|pb\.txt|ams)$/i, '') || 'apollo-project';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${base}-${stamp}.ams`;
}

export async function saveAmsProject(): Promise<void> {
  const { rawMap, info } = useApolloMapStore.getState();
  if (!rawMap || !info) {
    useApolloMapStore.getState().setError('Nothing to save — import a map first.');
    return;
  }
  const enuMap = await buildExportPayload(rawMap, info.projString);
  const blob = await packAms(enuMap, info);
  downloadBlob(blob, suggestedAmsFilename(info));
}

export async function pickAndOpenAmsProject(): Promise<ApolloMapImportInfo | null> {
  const file = await pickFile('.ams,application/zip');
  if (!file) return null;
  const store = useApolloMapStore.getState();
  try {
    const { rawEnuMap, manifest } = await unpackAms(file);
    const { map: lonLatMap, projString: usedProj } = await apolloMapToLonLat(
      rawEnuMap,
      manifest.projString,
    );
    const info: ApolloMapImportInfo = {
      filename: manifest.filename || file.name,
      counts: entityCounts(lonLatMap),
      projString: usedProj,
      importedAt: Date.now(),
    };
    store.setMap(lonLatMap, info);
    return info;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    store.setError(`Open project failed: ${msg}`);

    console.error('[mapIO] open project failed', e);
    return null;
  }
}
