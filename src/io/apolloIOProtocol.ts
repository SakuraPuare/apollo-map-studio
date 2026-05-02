import type { ApolloMapBounds, ApolloMapHeader, ApolloMapImportInfo } from '@/store/apolloMapStore';
import type { MapEntity } from '@/types/entities';

export interface ApolloIOProgress {
  label: string;
  detail?: string;
  progress: number | null;
}

export interface ApolloImportStats {
  decodeMs: number;
  projectMs: number;
  bridgeMs: number;
  topologyMs: number;
  overlapMs: number;
  totalMs: number;
}

export type ApolloExportFormat = 'bin' | 'txt';

export type ApolloIORequest =
  | {
      type: 'IMPORT_BIN';
      requestId: string;
      filename: string;
      bytes: Uint8Array;
    }
  | {
      type: 'IMPORT_TEXT';
      requestId: string;
      filename: string;
      bytes: Uint8Array;
    }
  | { type: 'RESOLVE_PROJECTION'; requestId: string; projString: string }
  | {
      type: 'BEGIN_EXPORT';
      requestId: string;
      format: ApolloExportFormat;
      projString: string;
      total: number;
    }
  | {
      type: 'EXPORT_ENTITIES_CHUNK';
      requestId: string;
      entities: MapEntity[];
      offset: number;
      total: number;
    }
  | { type: 'FINISH_EXPORT'; requestId: string }
  | { type: 'CLEAR'; requestId: string };

export type ApolloIOResponse =
  | { type: 'PROGRESS'; requestId: string; progress: ApolloIOProgress }
  | { type: 'NEEDS_PROJECTION'; requestId: string }
  | {
      type: 'IMPORT_ENTITIES_CHUNK';
      requestId: string;
      entities: MapEntity[];
      offset: number;
      total: number;
    }
  | {
      type: 'IMPORT_RESULT';
      requestId: string;
      info: ApolloMapImportInfo;
      header: ApolloMapHeader | null;
      bounds: ApolloMapBounds | null;
      stats: ApolloImportStats;
    }
  | { type: 'EXPORT_BIN_RESULT'; requestId: string; bytes: Uint8Array }
  | { type: 'EXPORT_TEXT_RESULT'; requestId: string; bytes: Uint8Array }
  | { type: 'CLEARED'; requestId: string }
  | { type: 'ERROR'; requestId: string; message: string; stack?: string };
