import { create } from 'zustand';

/**
 * Stores import metadata for Apollo HD maps plus the WGS84 bounds and a
 * shallow copy of `Map.header`. The raw proto tree stays in the IO worker;
 * main-thread state only keeps the data needed by the UI and export flow.
 *
 * This store is intentionally separate from `mapStore` (which holds editor
 * MapEntity records) so import context does not get mixed into undo history.
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
  setImported(
    info: ApolloMapImportInfo,
    bounds: ApolloMapBounds | null,
    header?: ApolloMapHeader | null,
  ): void;
  clear(): void;
  setError(message: string | null): void;
}

export const useApolloMapStore = create<ApolloMapState & ApolloMapActions>((set) => ({
  header: null,
  bounds: null,
  info: null,
  lastError: null,

  setImported(info, bounds, header = null) {
    set({ header, info, bounds, lastError: null });
  },

  clear() {
    set({ header: null, bounds: null, info: null, lastError: null });
  },

  setError(message) {
    set({ lastError: message });
  },
}));
