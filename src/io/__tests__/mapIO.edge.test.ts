import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApolloMapStore, type ApolloMapImportInfo } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import type { CrosswalkEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import type { ApolloImportWorkerResult } from '../apolloIOBridge';
import type { ApolloIOProgress } from '../apolloIOProtocol';
import { UTM_PRESETS } from '../proto/projection';

const fileIOMock = vi.hoisted(() => ({
  pickFile: vi.fn(),
  readFileAsBytes: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('../fileIO', () => fileIOMock);

const now = new Date('2026-06-08T12:34:56.000Z');

function crosswalk(id = 'cw_1'): CrosswalkEntity {
  return {
    id,
    entityType: 'crosswalk',
    polygon: {
      points: [
        { x: 116.4, y: 39.9 },
        { x: 116.401, y: 39.9 },
        { x: 116.401, y: 39.901 },
        { x: 116.4, y: 39.901 },
      ],
    },
    overlapIds: [],
  };
}

function importInfo(filename = 'base_map.txt'): ApolloMapImportInfo {
  return {
    filename,
    counts: { crosswalk: 1 },
    projString: UTM_PRESETS.sunnyvale,
    importedAt: 1_700_000_000_000,
  };
}

function importResult(filename = 'base_map.txt'): ApolloImportWorkerResult {
  return {
    info: importInfo(filename),
    header: null,
    bounds: null,
    entities: [crosswalk()],
    stats: {
      decodeMs: 1,
      projectMs: 2,
      bridgeMs: 3,
      topologyMs: 4,
      overlapMs: 5,
      totalMs: 15,
    },
  };
}

function fakeBridge() {
  return {
    importBin: vi.fn(),
    importText: vi.fn(),
    exportBin: vi.fn(),
    exportText: vi.fn(),
  };
}

function resetStores() {
  useApolloMapStore.getState().clear();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useTaskProgressStore.setState({ activeTask: null });
  useProjDialogStore.setState({
    pending: false,
    resolver: null,
    request: vi.fn().mockResolvedValue(null),
  });
}

async function importMapIOModule() {
  return import('../mapIO');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  resetStores();
  fileIOMock.readFileAsBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe('mapIO edge cases', () => {
  it('records non-Error import rejections as import failures', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fileIOMock.pickFile.mockResolvedValue({ name: 'bad.bin' } as File);
    bridge.importBin.mockRejectedValue('decode failed without Error');

    try {
      await expect(mapIO.pickAndImportApollo()).resolves.toBeNull();

      expect(useApolloMapStore.getState().lastError).toBe(
        'Import failed: decode failed without Error',
      );
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith('[mapIO] import failed', 'decode failed without Error');
    } finally {
      errorSpy.mockRestore();
      restore();
    }
  });

  it('forwards text import worker progress into the import task', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    fileIOMock.pickFile.mockResolvedValue({ name: 'base_map.txt' } as File);
    bridge.importText.mockImplementation(
      async (_filename: string, _bytes: Uint8Array, onProgress?: (p: ApolloIOProgress) => void) => {
        onProgress?.({ label: 'Importing text', detail: 'decoding text', progress: 0.4 });
        expect(useTaskProgressStore.getState().activeTask).toMatchObject({
          id: 'apollo-import',
          label: 'Importing text',
          detail: 'decoding text',
          progress: 0.4,
        });
        return importResult('base_map.txt');
      },
    );

    try {
      await expect(mapIO.pickAndImportApollo()).resolves.toMatchObject({
        filename: 'base_map.txt',
        source: 'imported',
      });
      expect(bridge.importText).toHaveBeenCalledWith(
        'base_map.txt',
        new Uint8Array([1, 2, 3]),
        expect.any(Function),
      );
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    } finally {
      restore();
    }
  });

  it('records non-Error export rejections as export failures', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useApolloMapStore
      .getState()
      .setImported({ ...importInfo('base_map.bin'), source: 'imported' }, null, null);
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });
    bridge.exportBin.mockRejectedValue({ code: 'ENCODE_FAILED' });

    try {
      await mapIO.exportApolloBin();

      expect(useApolloMapStore.getState().lastError).toBe('Export failed: [object Object]');
      expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith('[mapIO] export failed', {
        code: 'ENCODE_FAILED',
      });
    } finally {
      errorSpy.mockRestore();
      restore();
    }
  });

  it('remembers metadata after exporting a newly drawn map as binary', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    bridge.exportBin.mockResolvedValue(new Uint8Array([8, 9, 10]));
    useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(UTM_PRESETS.beijing) });
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    try {
      await mapIO.exportApolloBin();

      expect(bridge.exportBin).toHaveBeenCalledWith(
        [crosswalk()],
        UTM_PRESETS.beijing,
        expect.any(Function),
        { baseMapSource: 'blank' },
      );
      expect(fileIOMock.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        'apollo-map-20260608123456.bin',
      );
      expect(useApolloMapStore.getState()).toMatchObject({
        info: {
          source: 'created',
          filename: 'apollo-map',
          counts: { crosswalk: 1 },
          projString: UTM_PRESETS.beijing,
        },
        header: {
          projection: {
            proj: UTM_PRESETS.beijing,
          },
        },
        bounds: null,
        lastError: null,
      });
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    } finally {
      restore();
    }
  });

  it('forwards text export progress and falls back when the source filename has no base', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    bridge.exportText.mockImplementation(
      async (
        _entities: MapEntity[],
        _projString: string,
        onProgress?: (p: ApolloIOProgress) => void,
      ) => {
        onProgress?.({ label: 'Exporting text', detail: 'encoding text', progress: 0.7 });
        expect(useTaskProgressStore.getState().activeTask).toMatchObject({
          id: 'apollo-export',
          label: 'Exporting text',
          detail: 'encoding text',
          progress: 0.7,
        });
        return new Uint8Array([123, 10]);
      },
    );
    useApolloMapStore
      .getState()
      .setImported({ ...importInfo('.pb.txt'), source: 'imported' }, null, null);
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    try {
      await mapIO.exportApolloText();

      expect(bridge.exportText).toHaveBeenCalledWith(
        [crosswalk()],
        UTM_PRESETS.sunnyvale,
        expect.any(Function),
        { baseMapSource: 'cached' },
      );
      expect(fileIOMock.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        'apollo-map-20260608123456.txt',
      );
      expect(useTaskProgressStore.getState().activeTask).toBeNull();
    } finally {
      restore();
    }
  });
});
