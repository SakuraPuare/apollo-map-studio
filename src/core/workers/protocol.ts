import type { MapEntity } from '@/types/entities';

/** 序列化实体（可通过 postMessage 传输） */
export type SerializedEntity = MapEntity;

/** 主线程 → Worker */
export type WorkerRequest =
  | { type: 'SYNC'; requestId: string; entities: SerializedEntity[]; excludeId?: string | null }
  | { type: 'INCREMENTAL'; requestId: string; added: SerializedEntity[]; removed: string[]; updated: SerializedEntity[]; excludeId?: string | null }
  | { type: 'HIT_TEST'; requestId: string; point: [number, number]; radius: number };

/** Worker → 主线程 */
export type WorkerResponse =
  | { type: 'COLD_READY'; requestId: string; featureCollection: GeoJSON.FeatureCollection }
  | { type: 'HIT_RESULT'; requestId: string; hits: HitResult[] };

export interface HitResult {
  id: string;
  entityType: string;
  distance: number;
}
