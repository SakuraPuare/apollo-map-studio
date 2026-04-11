import type { MapEntity } from '@/types/entities';

/** 序列化实体（可通过 postMessage 传输） */
export type SerializedEntity = MapEntity;

/** 主线程 → Worker */
export type WorkerRequest =
  | { type: 'SYNC'; requestId: string; entities: SerializedEntity[]; excludeId?: string | null }
  | {
      type: 'INCREMENTAL';
      requestId: string;
      added: SerializedEntity[];
      removed: string[];
      updated: SerializedEntity[];
      excludeId?: string | null;
    }
  | { type: 'HIT_TEST'; requestId: string; point: [number, number]; radius: number };

/**
 * Per-entity feature list. The main thread keys its cold-layer cache by entity
 * id and merges these on COLD_DELTA messages.
 */
export interface EntityFeatureGroup {
  id: string;
  features: GeoJSON.Feature[];
}

/** Worker → 主线程 */
export type WorkerResponse =
  | { type: 'COLD_READY'; requestId: string; featureCollection: GeoJSON.FeatureCollection }
  /**
   * P1: incremental delta response. Replaces COLD_READY for INCREMENTAL
   * messages — ships only the entities whose features changed (plus removed
   * ids), instead of cloning the full FC across the postMessage boundary
   * every edit.
   */
  | {
      type: 'COLD_DELTA';
      requestId: string;
      changed: EntityFeatureGroup[];
      removed: string[];
    }
  | { type: 'HIT_RESULT'; requestId: string; hits: HitResult[] };

export interface HitResult {
  id: string;
  entityType: string;
  distance: number;
}
