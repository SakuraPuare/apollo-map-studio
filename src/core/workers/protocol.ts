import type { MapEntity } from '@/types/entities';

/** 序列化实体（可通过 postMessage 传输） */
export type SerializedEntity = MapEntity;

/** 主线程 → Worker */
export type WorkerPublicRequest =
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

export type WorkerRequest =
  | WorkerPublicRequest
  | { type: 'SYNC_BEGIN'; requestId: string; total: number; excludeId?: string | null }
  | {
      type: 'SYNC_CHUNK';
      requestId: string;
      entities: SerializedEntity[];
      offset: number;
      total: number;
    }
  | { type: 'SYNC_FINISH'; requestId: string };

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
  | {
      type: 'COLD_GROUPS_CHUNK';
      requestId: string;
      groups: EntityFeatureGroup[];
      offset: number;
      total: number;
    }
  | {
      type: 'COLD_READY';
      requestId: string;
      featureCollection?: GeoJSON.FeatureCollection;
      groups: EntityFeatureGroup[];
    }
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
