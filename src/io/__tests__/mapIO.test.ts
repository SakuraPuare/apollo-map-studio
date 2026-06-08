import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UTM_PRESETS } from '../proto/projection';
import { useApolloMapStore, type ApolloMapImportInfo } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import type { ApolloImportWorkerResult } from '../apolloIOBridge';
import type { ApolloIOProgress } from '../apolloIOProtocol';
import type { CrosswalkEntity } from '@/types/apollo';
import type { MapEntity, PolylineEntity } from '@/types/entities';

const fileIOMock = vi.hoisted(() => ({
  pickFile: vi.fn(),
  readFileAsBytes: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('../fileIO', () => fileIOMock);

const now = new Date('2026-06-08T12:34:56.000Z');

function makeFile(name: string): File {
  return { name } as File;
}

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

function polyline(id = 'polyline_1'): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

function importInfo(filename = 'base_map.bin'): ApolloMapImportInfo {
  return {
    filename,
    counts: { crosswalk: 1 },
    projString: UTM_PRESETS.sunnyvale,
    importedAt: 1_700_000_000_000,
  };
}

function importResult(
  filename = 'base_map.bin',
  entities: MapEntity[] = [crosswalk()],
): ApolloImportWorkerResult {
  return {
    info: importInfo(filename),
    header: { projection: { proj: UTM_PRESETS.sunnyvale } },
    bounds: [
      [116.4, 39.9],
      [116.401, 39.901],
    ],
    entities,
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

describe('mapIO import flow', () => {
  it('returns null without starting a task when the picker is cancelled', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    fileIOMock.pickFile.mockResolvedValue(null);

    await expect(mapIO.pickAndImportApollo()).resolves.toBeNull();

    expect(bridge.importBin).not.toHaveBeenCalled();
    expect(bridge.importText).not.toHaveBeenCalled();
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    restore();
  });

  it('imports .bin files through the binary worker path and writes stores', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    fileIOMock.pickFile.mockResolvedValue(makeFile('base_map.bin'));
    bridge.importBin.mockImplementation(
      async (_filename: string, _bytes: Uint8Array, onProgress?: (p: ApolloIOProgress) => void) => {
        onProgress?.({ label: 'Importing', detail: 'halfway', progress: 0.5 });
        expect(useTaskProgressStore.getState().activeTask).toMatchObject({
          id: 'apollo-import',
          label: 'Importing',
          detail: 'halfway',
          progress: 0.5,
        });
        return importResult('base_map.bin');
      },
    );

    const info = await mapIO.pickAndImportApollo();

    expect(fileIOMock.pickFile).toHaveBeenCalledWith(
      '.bin,.txt,.pb.txt,application/octet-stream,text/plain',
    );
    expect(fileIOMock.readFileAsBytes).toHaveBeenCalledWith({ name: 'base_map.bin' });
    expect(bridge.importBin).toHaveBeenCalledWith(
      'base_map.bin',
      new Uint8Array([1, 2, 3]),
      expect.any(Function),
    );
    expect(bridge.importText).not.toHaveBeenCalled();
    expect(info).toMatchObject({ filename: 'base_map.bin', source: 'imported' });
    expect(useApolloMapStore.getState()).toMatchObject({
      info: expect.objectContaining({ source: 'imported', filename: 'base_map.bin' }),
      bounds: [
        [116.4, 39.9],
        [116.401, 39.901],
      ],
      lastError: null,
    });
    expect([...useMapStore.getState().entities.keys()]).toEqual(['cw_1']);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    restore();
  });

  it('imports .txt and .pb.txt files through the text worker path', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    bridge.importText.mockResolvedValue(importResult('base_map.pb.txt'));

    fileIOMock.pickFile.mockResolvedValue(makeFile('base_map.pb.txt'));
    await expect(mapIO.pickAndImportApollo()).resolves.toMatchObject({
      filename: 'base_map.pb.txt',
      source: 'imported',
    });
    expect(bridge.importText).toHaveBeenCalledWith(
      'base_map.pb.txt',
      expect.any(Uint8Array),
      expect.any(Function),
    );

    fileIOMock.pickFile.mockResolvedValue(makeFile('base_map.txt'));
    bridge.importText.mockResolvedValue(importResult('base_map.txt'));
    await expect(mapIO.pickAndImportApollo()).resolves.toMatchObject({
      filename: 'base_map.txt',
      source: 'imported',
    });
    expect(bridge.importText).toHaveBeenCalledTimes(2);
    expect(bridge.importBin).not.toHaveBeenCalled();
    restore();
  });

  it('records import errors and still ends the task', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fileIOMock.pickFile.mockResolvedValue(makeFile('bad.bin'));
    bridge.importBin.mockRejectedValue(new Error('decode failed'));

    await expect(mapIO.pickAndImportApollo()).resolves.toBeNull();

    expect(useApolloMapStore.getState().lastError).toBe('Import failed: decode failed');
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[mapIO] import failed', expect.any(Error));
    errorSpy.mockRestore();
    restore();
  });

  it('keeps stores unchanged when reading the selected import file fails', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fileIOMock.pickFile.mockResolvedValue(makeFile('unreadable.bin'));
    fileIOMock.readFileAsBytes.mockRejectedValue(new Error('read failed'));
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    await expect(mapIO.pickAndImportApollo()).resolves.toBeNull();

    expect(bridge.importBin).not.toHaveBeenCalled();
    expect(useApolloMapStore.getState().lastError).toBe('Import failed: read failed');
    expect([...useMapStore.getState().entities.keys()]).toEqual(['cw_1']);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    errorSpy.mockRestore();
    restore();
  });
});

describe('mapIO export flow', () => {
  it('does not export when there is no import context and no Apollo entity', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    useMapStore.setState({ entities: new Map([[polyline().id, polyline()]]) });

    await mapIO.exportApolloBin();

    expect(bridge.exportBin).not.toHaveBeenCalled();
    expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
    expect(useApolloMapStore.getState().lastError).toBe(
      'Nothing to export - draw or import Apollo map elements first.',
    );
    restore();
  });

  it('exports imported maps from cached base data and downloads a defensive copy', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const sourceBytes = new Uint8Array([9, 8, 7]);
    bridge.exportBin.mockImplementation(
      async (_entities, _proj, onProgress?: (p: ApolloIOProgress) => void) => {
        onProgress?.({ label: 'Exporting', detail: 'encoding', progress: 0.8 });
        expect(useTaskProgressStore.getState().activeTask).toMatchObject({
          id: 'apollo-export',
          label: 'Exporting',
          detail: 'encoding',
          progress: 0.8,
        });
        return sourceBytes;
      },
    );
    useApolloMapStore
      .getState()
      .setImported({ ...importInfo('base_map.bin'), source: 'imported' }, null, {
        projection: { proj: UTM_PRESETS.sunnyvale },
      });
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    await mapIO.exportApolloBin();

    expect(bridge.exportBin).toHaveBeenCalledWith(
      [crosswalk()],
      UTM_PRESETS.sunnyvale,
      expect.any(Function),
      { baseMapSource: 'cached' },
    );
    expect(fileIOMock.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'base_map-20260608123456.bin',
    );
    const downloadedBlob = fileIOMock.downloadBlob.mock.calls[0]![0] as Blob;
    await expect(downloadedBlob.arrayBuffer()).resolves.toEqual(sourceBytes.buffer);
    sourceBytes[0] = 1;
    const defensiveCopy = new Uint8Array(await downloadedBlob.arrayBuffer());
    expect([...defensiveCopy]).toEqual([9, 8, 7]);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    restore();
  });

  it('strips .pb.txt as a full suffix when suggesting export filenames', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    bridge.exportText.mockResolvedValue(new Uint8Array([123, 10]));
    useApolloMapStore
      .getState()
      .setImported({ ...importInfo('base_map.pb.txt'), source: 'imported' }, null, {
        projection: { proj: UTM_PRESETS.sunnyvale },
      });
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    await mapIO.exportApolloText();

    expect(fileIOMock.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'base_map-20260608123456.txt',
    );
    restore();
  });

  it('prompts for projection and remembers metadata when exporting a newly drawn map', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    bridge.exportText.mockResolvedValue(new Uint8Array([123, 10]));
    useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(UTM_PRESETS.beijing) });
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    await mapIO.exportApolloText();

    expect(bridge.exportText).toHaveBeenCalledWith(
      [crosswalk()],
      UTM_PRESETS.beijing,
      expect.any(Function),
      { baseMapSource: 'blank' },
    );
    expect(fileIOMock.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'apollo-map-20260608123456.txt',
    );
    expect(useApolloMapStore.getState().info).toMatchObject({
      source: 'created',
      filename: 'apollo-map',
      counts: { crosswalk: 1 },
      projString: UTM_PRESETS.beijing,
    });
    expect(useApolloMapStore.getState().header).toBeTruthy();
    restore();
  });

  it('cancels created-map export when projection selection is cancelled', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(null) });
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    await mapIO.exportApolloBin();

    expect(bridge.exportBin).not.toHaveBeenCalled();
    expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    restore();
  });

  it('records export errors and still ends the task', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useApolloMapStore
      .getState()
      .setImported({ ...importInfo('base_map.bin'), source: 'imported' }, null, null);
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });
    bridge.exportBin.mockRejectedValue(new Error('encode failed'));

    await mapIO.exportApolloBin();

    expect(useApolloMapStore.getState().lastError).toBe('Export failed: encode failed');
    expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[mapIO] export failed', expect.any(Error));
    errorSpy.mockRestore();
    restore();
  });

  it('records download failures without remembering a newly created map export', async () => {
    const mapIO = await importMapIOModule();
    const bridge = fakeBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bridge.exportText.mockResolvedValue(new Uint8Array([123, 10]));
    fileIOMock.downloadBlob.mockImplementation(() => {
      throw new Error('download failed');
    });
    useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(UTM_PRESETS.beijing) });
    useMapStore.setState({ entities: new Map([[crosswalk().id, crosswalk()]]) });

    await mapIO.exportApolloText();

    expect(bridge.exportText).toHaveBeenCalledWith(
      [crosswalk()],
      UTM_PRESETS.beijing,
      expect.any(Function),
      { baseMapSource: 'blank' },
    );
    expect(useApolloMapStore.getState().lastError).toBe('Export failed: download failed');
    expect(useApolloMapStore.getState().info).toBeNull();
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[mapIO] export failed', expect.any(Error));
    errorSpy.mockRestore();
    restore();
  });
});
