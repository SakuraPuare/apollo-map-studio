import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { decodeMapBin, encodeMapBin } from './proto/binCodec';
import type { ApolloMapImportInfo } from '@/store/apolloMapStore';

/**
 * Apollo Map Studio project file (`.ams`) — a small zip bundle that
 * pairs a clean Apollo `.bin` with editor-side metadata.
 *
 * Layout:
 *   map.bin        Raw Apollo proto bytes (UTM ENU, opens directly in
 *                  Apollo tooling).
 *   manifest.json  Editor metadata: PROJ string, original filename,
 *                  imported-at timestamp, future entity overrides like
 *                  Bezier anchor handles.
 *
 * Versioning rule: bump `version` whenever a non-additive change is made
 * to the manifest schema. Readers should accept any minor-version bump.
 */
export const AMS_VERSION = 1;

export interface AmsManifest {
  version: number;
  filename: string;
  projString: string;
  importedAt: number;
  /** Reserved for future per-entity editor metadata (Bezier handles, etc.). */
  entitiesMeta?: Record<string, unknown>;
}

export interface AmsBundle {
  /** Apollo `.bin` bytes — UTM ENU as the original. */
  binBytes: Uint8Array;
  manifest: AmsManifest;
}

/**
 * Pack a decoded Apollo Map (assumed already in UTM ENU coordinates)
 * plus its editor info into a zip Blob suitable for File-Save dialogs.
 */
export async function packAms(
  enuMap: Record<string, unknown>,
  info: ApolloMapImportInfo,
  entitiesMeta?: Record<string, unknown>,
): Promise<Blob> {
  const binBytes = await encodeMapBin(enuMap);
  const manifest: AmsManifest = {
    version: AMS_VERSION,
    filename: info.filename,
    projString: info.projString,
    importedAt: info.importedAt,
    ...(entitiesMeta ? { entitiesMeta } : {}),
  };
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = zipSync(
    {
      'map.bin': binBytes,
      'manifest.json': manifestBytes,
    },
    { level: 6 },
  );
  // zipSync returns Uint8Array<ArrayBufferLike>; copy into a plain
  // ArrayBuffer to satisfy the strict Blob constructor type.
  const copy = new Uint8Array(zipped.byteLength);
  copy.set(zipped);
  return new Blob([copy.buffer], { type: 'application/zip' });
}

/**
 * Unpack a `.ams` file into the raw Apollo Map (still in UTM ENU) and
 * its manifest. Caller is responsible for projecting the map to lon/lat
 * via `apolloMapToLonLat` and feeding the apolloMapStore.
 */
export async function unpackAms(file: File): Promise<{
  rawEnuMap: Record<string, unknown>;
  manifest: AmsManifest;
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(bytes);
  const binBytes = entries['map.bin'];
  const manifestBytes = entries['manifest.json'];
  if (!binBytes) throw new Error('.ams file missing map.bin');
  if (!manifestBytes) throw new Error('.ams file missing manifest.json');
  const manifest = JSON.parse(strFromU8(manifestBytes)) as AmsManifest;
  if (typeof manifest.version !== 'number') {
    throw new Error('.ams manifest is missing version field');
  }
  if (manifest.version > AMS_VERSION) {
    console.warn(
      `[projectFile] .ams version ${manifest.version} is newer than reader (${AMS_VERSION}); fields may be lost.`,
    );
  }
  const rawEnuMap = await decodeMapBin(binBytes);
  return { rawEnuMap, manifest };
}
