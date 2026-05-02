import { create } from 'zustand';

/**
 * Stores the raw decoded Apollo Map (with all PointENU coordinates already
 * converted to WGS84 lon/lat for the editor's coordinate system) plus the
 * PROJ string used for the conversion. Round-trip through Export uses the
 * same PROJ string so coordinates land back at their original UTM values.
 *
 * This store is intentionally separate from `mapStore` (which holds editor
 * MapEntity records). The Apollo IO layer round-trips the proto's exact
 * field tree, including fields the editor doesn't render yet, so nothing
 * is lost when re-exporting an imported map.
 */
export interface ApolloMapImportInfo {
  /** Source filename, used as the suggested name for re-export. */
  filename: string;
  /** Per-entity counts surfaced for the status bar / toast. */
  counts: Record<string, number>;
  /** PROJ.4 string actually used to project ENU → lon/lat. */
  projString: string;
  /** Imported-at timestamp (ms epoch). */
  importedAt: number;
}

export type ApolloMapBounds = [[number, number], [number, number]];
export type ApolloMapHeader = Record<string, unknown>;

interface ApolloMapState {
  /**
   * Decoded `apollo.hdmap.Map` message; retained only for legacy in-process
   * callers/tests. Browser import keeps the full tree inside the IO worker so
   * React state does not clone or rescan 50-200MB maps on the main thread.
   */
  rawMap: Record<string, unknown> | null;
  /** Lightweight clone of Map.header for metadata UI. */
  header: ApolloMapHeader | null;
  /** WGS84 bounds precomputed during import, used for viewport fit. */
  bounds: ApolloMapBounds | null;
  /** Diagnostic info for the most recent import. */
  info: ApolloMapImportInfo | null;
  /** Last error from import/export, surfaced to the UI. */
  lastError: string | null;
}

interface ApolloMapActions {
  setMap(rawMap: Record<string, unknown> | null, info: ApolloMapImportInfo): void;
  setImported(
    info: ApolloMapImportInfo,
    bounds: ApolloMapBounds | null,
    header?: ApolloMapHeader | null,
  ): void;
  clear(): void;
  setError(message: string | null): void;
}

export const useApolloMapStore = create<ApolloMapState & ApolloMapActions>((set) => ({
  rawMap: null,
  header: null,
  bounds: null,
  info: null,
  lastError: null,

  setMap(rawMap, info) {
    const header = rawMap?.header;
    set({
      rawMap,
      header: header && typeof header === 'object' ? (header as ApolloMapHeader) : null,
      info,
      bounds: null,
      lastError: null,
    });
  },

  setImported(info, bounds, header = null) {
    set({ rawMap: null, header, info, bounds, lastError: null });
  },

  clear() {
    set({ rawMap: null, header: null, bounds: null, info: null, lastError: null });
  },

  setError(message) {
    set({ lastError: message });
  },
}));
