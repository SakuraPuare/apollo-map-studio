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

interface ApolloMapState {
  /** Decoded `apollo.hdmap.Map` message; PointENU coordinates are lon/lat. */
  rawMap: Record<string, unknown> | null;
  /** Diagnostic info for the most recent import. */
  info: ApolloMapImportInfo | null;
  /** Last error from import/export, surfaced to the UI. */
  lastError: string | null;
}

interface ApolloMapActions {
  setMap(rawMap: Record<string, unknown>, info: ApolloMapImportInfo): void;
  clear(): void;
  setError(message: string | null): void;
}

export const useApolloMapStore = create<ApolloMapState & ApolloMapActions>((set) => ({
  rawMap: null,
  info: null,
  lastError: null,

  setMap(rawMap, info) {
    set({ rawMap, info, lastError: null });
  },

  clear() {
    set({ rawMap: null, info: null, lastError: null });
  },

  setError(message) {
    set({ lastError: message });
  },
}));
