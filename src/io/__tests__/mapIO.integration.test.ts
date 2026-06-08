import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UTM_PRESETS } from '../proto/projection';
import { useApolloMapStore } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import type { ApolloImportWorkerResult } from '../apolloIOBridge';
import type { ApolloExportBaseMapSource, ApolloIOProgress } from '../apolloIOProtocol';
import type { ApolloMapBounds, ApolloMapHeader, ApolloMapImportInfo } from '@/store/apolloMapStore';
import type { CrosswalkEntity, MapEntity } from '@/types/entities';

const fileIOMock = vi.hoisted(() => ({
  pickFile: vi.fn(),
  readFileAsBytes: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('../fileIO', () => fileIOMock);

const now = new Date('2026-06-08T12:34:56.000Z');
const importStats = {
  decodeMs: 1,
  projectMs: 2,
  bridgeMs: 3,
  topologyMs: 4,
  overlapMs: 5,
  totalMs: 15,
};

type ImportFn = (
  filename: string,
  bytes: Uint8Array,
  onProgress?: (progress: ApolloIOProgress) => void,
) => Promise<ApolloImportWorkerResult>;

type ExportOptions = {
  baseMapSource?: ApolloExportBaseMapSource;
};

type ExportFn = (
  entities: MapEntity[],
  projString: string,
  onProgress?: (progress: ApolloIOProgress) => void,
  options?: ExportOptions,
) => Promise<Uint8Array>;

type BridgeLike = {
  importBin: ReturnType<typeof vi.fn<ImportFn>>;
  importText: ReturnType<typeof vi.fn<ImportFn>>;
  exportBin: ReturnType<typeof vi.fn<ExportFn>>;
  exportText: ReturnType<typeof vi.fn<ExportFn>>;
};

let restoreBridge: (() => void) | null = null;

function makeFile(name: string): File {
  return { name } as File;
}

function makeBridge(): BridgeLike {
  return {
    importBin: vi.fn<ImportFn>(),
    importText: vi.fn<ImportFn>(),
    exportBin: vi.fn<ExportFn>(),
    exportText: vi.fn<ExportFn>(),
  };
}

function crosswalk(id = 'cw_1'): CrosswalkEntity {
  return {
    id,
    entityType: 'crosswalk',
    polygon: {
      points: [
        { x: -122.025, y: 37.37 },
        { x: -122.024, y: 37.37 },
        { x: -122.024, y: 37.371 },
        { x: -122.025, y: 37.371 },
      ],
    },
    overlapIds: [],
  };
}

function importInfo(
  filename: string,
  counts: Record<string, number>,
  projString = UTM_PRESETS.sunnyvale,
): ApolloMapImportInfo {
  return {
    source: 'imported',
    filename,
    counts,
    projString,
    importedAt: now.getTime(),
  };
}

function importResult(args: {
  filename: string;
  entities: MapEntity[];
  header: ApolloMapHeader | null;
  bounds: ApolloMapBounds | null;
  projString?: string;
}): ApolloImportWorkerResult {
  return {
    info: importInfo(
      args.filename,
      { crosswalk: args.entities.filter((entity) => entity.entityType === 'crosswalk').length },
      args.projString,
    ),
    header: args.header,
    bounds: args.bounds,
    entities: args.entities,
    stats: importStats,
  };
}

function editFirstCrosswalkPoint(entity: CrosswalkEntity): CrosswalkEntity {
  return {
    ...entity,
    polygon: {
      points: entity.polygon.points.map((point, index) =>
        index === 0 ? { ...point, x: point.x + 0.00025, y: point.y + 0.0005 } : point,
      ),
    },
    overlapIds: [...entity.overlapIds],
  };
}

function expectProgressTask(id: string, progress: ApolloIOProgress): void {
  expect(useTaskProgressStore.getState().activeTask).toMatchObject({
    id,
    label: progress.label,
    detail: progress.detail,
    progress: progress.progress,
  });
}

async function importMapIOModule() {
  return import('../mapIO');
}

function resetStores(): void {
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  resetStores();
});

afterEach(() => {
  restoreBridge?.();
  restoreBridge = null;
  vi.useRealTimers();
  resetStores();
});

describe('mapIO workflow integration', () => {
  it('imports, records metadata, exports edited entities from the cached base, and reimports', async () => {
    const mapIO = await importMapIOModule();
    const bridge = makeBridge();
    restoreBridge = mapIO.setApolloIOBridgeForTests(bridge);
    const importedCrosswalk = crosswalk();
    const originalHeader: ApolloMapHeader = {
      projection: { proj: UTM_PRESETS.sunnyvale },
      version: new TextEncoder().encode('1.500000'),
      left: 586_000,
      right: 587_000,
      top: 4_137_500,
      bottom: 4_137_000,
      vendor_extension: { keep: 'raw-header-field' },
    };
    const originalBounds: ApolloMapBounds = [
      [-122.025, 37.37],
      [-122.024, 37.371],
    ];
    const exportedBytes = new Uint8Array([222, 173, 190, 239]);
    const downloadedBlobs: Blob[] = [];
    let exportedSnapshot: { header: ApolloMapHeader; entities: MapEntity[] } | null = null;

    fileIOMock.pickFile
      .mockResolvedValueOnce(makeFile('raw_base.bin'))
      .mockResolvedValueOnce(makeFile('raw_base-exported.bin'));
    fileIOMock.readFileAsBytes.mockImplementation(async (file: File) => {
      if (file.name === 'raw_base.bin') return new Uint8Array([1, 2, 3]);
      if (file.name === 'raw_base-exported.bin') {
        expect(downloadedBlobs).toHaveLength(1);
        return new Uint8Array(await downloadedBlobs[0]!.arrayBuffer());
      }
      throw new Error(`unexpected file read: ${file.name}`);
    });
    fileIOMock.downloadBlob.mockImplementation((blob: Blob) => {
      downloadedBlobs.push(blob);
    });

    bridge.importBin.mockImplementation(
      async (
        filename: string,
        bytes: Uint8Array,
        onProgress?: (progress: ApolloIOProgress) => void,
      ) => {
        onProgress?.({
          label: 'Importing Apollo map',
          detail: `Decoding ${filename}`,
          progress: 0.25,
        });
        expectProgressTask('apollo-import', {
          label: 'Importing Apollo map',
          detail: `Decoding ${filename}`,
          progress: 0.25,
        });

        if (filename === 'raw_base.bin') {
          expect([...bytes]).toEqual([1, 2, 3]);
          return importResult({
            filename,
            entities: [importedCrosswalk],
            header: originalHeader,
            bounds: originalBounds,
          });
        }

        expect(filename).toBe('raw_base-exported.bin');
        expect([...bytes]).toEqual([...exportedBytes]);
        expect(exportedSnapshot).not.toBeNull();
        return importResult({
          filename,
          entities: exportedSnapshot!.entities,
          header: exportedSnapshot!.header,
          bounds: originalBounds,
        });
      },
    );

    bridge.exportBin.mockImplementation(
      async (
        entities: MapEntity[],
        projString: string,
        onProgress?: (progress: ApolloIOProgress) => void,
        options?: { baseMapSource?: string },
      ) => {
        expect(projString).toBe(UTM_PRESETS.sunnyvale);
        expect(options).toEqual({ baseMapSource: 'cached' });
        onProgress?.({
          label: 'Exporting Apollo map',
          detail: 'Merging edited entities',
          progress: 0.5,
        });
        expectProgressTask('apollo-export', {
          label: 'Exporting Apollo map',
          detail: 'Merging edited entities',
          progress: 0.5,
        });
        exportedSnapshot = {
          header: structuredClone(originalHeader),
          entities: structuredClone(entities) as MapEntity[],
        };
        return exportedBytes;
      },
    );

    await expect(mapIO.pickAndImportApollo()).resolves.toMatchObject({
      filename: 'raw_base.bin',
      source: 'imported',
      counts: { crosswalk: 1 },
      projString: UTM_PRESETS.sunnyvale,
    });
    expect(useApolloMapStore.getState()).toMatchObject({
      info: expect.objectContaining({ filename: 'raw_base.bin', source: 'imported' }),
      bounds: originalBounds,
      lastError: null,
    });
    expect(useApolloMapStore.getState().header).toEqual(originalHeader);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();

    const editedCrosswalk = editFirstCrosswalkPoint(
      useMapStore.getState().entities.get('cw_1') as CrosswalkEntity,
    );
    useMapStore.getState().updateEntity('cw_1', editedCrosswalk);

    await mapIO.exportApolloBin();

    expect(bridge.exportBin).toHaveBeenCalledTimes(1);
    const [exportedEntities] = bridge.exportBin.mock.calls[0]!;
    expect(exportedEntities).toHaveLength(1);
    expect((exportedEntities[0] as CrosswalkEntity).polygon.points[0]).toEqual(
      editedCrosswalk.polygon.points[0],
    );
    expect(fileIOMock.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'raw_base-20260608123456.bin',
    );
    expect(new Uint8Array(await downloadedBlobs[0]!.arrayBuffer())).toEqual(exportedBytes);
    expect(useApolloMapStore.getState().header).toEqual(originalHeader);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();

    await expect(mapIO.pickAndImportApollo()).resolves.toMatchObject({
      filename: 'raw_base-exported.bin',
      source: 'imported',
      counts: { crosswalk: 1 },
    });

    const reimported = useMapStore.getState().entities.get('cw_1') as CrosswalkEntity;
    expect(reimported.polygon.points[0]).toEqual(editedCrosswalk.polygon.points[0]);
    expect(useApolloMapStore.getState().header).toEqual(originalHeader);
    expect(useApolloMapStore.getState().lastError).toBeNull();
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
    expect(bridge.importBin).toHaveBeenCalledTimes(2);
    expect(bridge.importText).not.toHaveBeenCalled();
    expect(bridge.exportText).not.toHaveBeenCalled();
  });

  it('stores the worker-selected fallback projection for text imports without a header', async () => {
    const mapIO = await importMapIOModule();
    const bridge = makeBridge();
    restoreBridge = mapIO.setApolloIOBridgeForTests(bridge);
    fileIOMock.pickFile.mockResolvedValue(makeFile('missing_projection.pb.txt'));
    fileIOMock.readFileAsBytes.mockResolvedValue(new TextEncoder().encode('header {}'));

    bridge.importText.mockResolvedValue(
      importResult({
        filename: 'missing_projection.pb.txt',
        entities: [],
        header: null,
        bounds: null,
        projString: UTM_PRESETS.beijing,
      }),
    );

    await expect(mapIO.pickAndImportApollo()).resolves.toMatchObject({
      filename: 'missing_projection.pb.txt',
      source: 'imported',
      projString: UTM_PRESETS.beijing,
    });

    expect(bridge.importText).toHaveBeenCalledWith(
      'missing_projection.pb.txt',
      expect.any(Uint8Array),
      expect.any(Function),
    );
    expect(bridge.importBin).not.toHaveBeenCalled();
    expect(useApolloMapStore.getState()).toMatchObject({
      header: null,
      bounds: null,
      lastError: null,
      info: expect.objectContaining({
        filename: 'missing_projection.pb.txt',
        projString: UTM_PRESETS.beijing,
      }),
    });
    expect(useMapStore.getState().entities.size).toBe(0);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
  });
});
