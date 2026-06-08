import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useApolloMapStore, type ApolloMapBounds } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import { reconcileOverlaps } from '@/core/elements/overlap';
import { SpatialIndex } from '@/core/elements/overlap/spatialIndex';
import { reconcileLaneTopology } from '@/core/geometry/laneTopology';
import { decodeMapBin, encodeMapBin } from '../proto/binCodec';
import { decodeMapText, encodeMapText } from '../proto/textCodec';
import {
  apolloMapFromLonLat,
  apolloMapToLonLat,
  entityCounts,
  readHeaderProjString,
} from '../proto/adapter';
import { computeApolloMapBounds } from '../proto/apolloGeoJson';
import { createBlankApolloMap, setApolloMapBounds } from '../proto/blankApolloMap';
import { apolloMapToEntities, entitiesToApolloMap, isApolloMapEntity } from '../proto/entityBridge';
import {
  hydrateEntitySourcesFromEditorMeta,
  writeEntitySourcesToEditorMeta,
} from '../proto/editorMeta';
import { UTM_PRESETS, sanitizeProjString } from '../proto/projection';
import type { ApolloImportWorkerResult } from '../apolloIOBridge';
import type { ApolloExportBaseMapSource, ApolloIOProgress } from '../apolloIOProtocol';
import type { CrosswalkEntity, MapEntity, PolylineEntity } from '@/types/entities';

type PickFileFn = (accept: string) => Promise<File | null>;
type ReadFileAsBytesFn = (file: Blob) => Promise<Uint8Array>;
type DownloadBlobFn = (blob: Blob, filename: string) => void;

const fileIOMock = vi.hoisted(() => ({
  pickFile: vi.fn<PickFileFn>(),
  readFileAsBytes: vi.fn<ReadFileAsBytesFn>(),
  downloadBlob: vi.fn<DownloadBlobFn>(),
}));

vi.mock('../fileIO', () => fileIOMock);

const now = new Date('2026-06-08T12:34:56.000Z');
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const BIN_FIXTURE = path.resolve(
  import.meta.dirname,
  '../__fixtures__/apollo/borregas_ave/base_map.bin',
);
const TXT_FIXTURE = path.resolve(import.meta.dirname, '../__fixtures__/apollo/demo/base_map.txt');
const JSON_FIXTURE = path.resolve(
  import.meta.dirname,
  '../__fixtures__/apollo/invalid/not_apollo_map.json',
);
const TEXT_FIXTURE_HEADER_PROJ =
  '+proj=tmerc +lat_0={37.413082} +lon_0={-122.013332} +k={0.9999999996} +ellps=WGS84 +no_defs';
const TEXT_FIXTURE_SANITIZED_PROJ = sanitizeProjString(TEXT_FIXTURE_HEADER_PROJ);
const BIN_FIXTURE_COUNTS = {
  crosswalk: 6,
  junction: 2,
  lane: 60,
  overlap: 143,
  road: 37,
  signal: 15,
  stop_sign: 2,
};
const BIN_EXPORTED_COUNTS = {
  crosswalk: 6,
  junction: 2,
  lane: 60,
  road: 37,
  signal: 15,
  stop_sign: 2,
};
const TXT_FIXTURE_COUNTS = {
  lane: 1,
  overlap: 1,
  stop_sign: 1,
};
const TXT_EXPORTED_COUNTS = {
  lane: 1,
  stop_sign: 1,
};
const TXT_ENTITY_COUNTS = {
  lane: 1,
  stopSign: 1,
};
const EXISTING_BOUNDS: ApolloMapBounds = [
  [-122.025, 37.37],
  [-122.024, 37.371],
];
const originalProjDialogRequest = useProjDialogStore.getState().request;

type ImportFn = (
  filename: string,
  bytes: Uint8Array,
  onProgress?: (progress: ApolloIOProgress) => void,
) => Promise<ApolloImportWorkerResult>;

type ExportFn = (
  entities: MapEntity[],
  projString: string,
  onProgress?: (progress: ApolloIOProgress) => void,
  options?: { baseMapSource?: ApolloExportBaseMapSource },
) => Promise<Uint8Array>;

type FixtureBridge = {
  importBin: ReturnType<typeof vi.fn<ImportFn>>;
  importText: ReturnType<typeof vi.fn<ImportFn>>;
  exportBin: ReturnType<typeof vi.fn<ExportFn>>;
  exportText: ReturnType<typeof vi.fn<ExportFn>>;
};

function fixtureFile(name: string, bytes: Uint8Array): File {
  return new File([bytes.slice()], name);
}

function crosswalk(id = 'created_crosswalk'): CrosswalkEntity {
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

function polyline(id = 'drawing_polyline'): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

function setEntities(entities: Map<string, MapEntity>): void {
  useMapStore.getState().replaceImportedEntityMap(entities);
}

function resetStores(): void {
  useApolloMapStore.getState().clear();
  setEntities(new Map<string, MapEntity>());
  useMapStore.temporal.getState().clear();
  useTaskProgressStore.setState({ activeTask: null });
  useProjDialogStore.setState({
    pending: false,
    resolver: null,
    request: originalProjDialogRequest,
  });
}

function cloneHeader(map: Record<string, unknown>): Record<string, unknown> | null {
  const header = map.header;
  if (!header || typeof header !== 'object') return null;
  return structuredClone(header) as Record<string, unknown>;
}

function processEntities(entities: MapEntity[]): MapEntity[] {
  const entityMap = new Map<string, MapEntity>();
  for (const entity of entities) entityMap.set(entity.id, entity);

  const { changes: topologyChanges } = reconcileLaneTopology(entityMap);
  for (const [id, entity] of topologyChanges) entityMap.set(id, entity);

  const patch = reconcileOverlaps(entityMap, { mode: 'full' }, new SpatialIndex());
  for (const id of patch.removedOverlapIds) entityMap.delete(id);
  for (const [id, entity] of patch.changes) entityMap.set(id, entity);

  return Array.from(entityMap.values());
}

async function importFixture(
  filename: string,
  decode: () => Promise<Record<string, unknown>>,
  onProgress?: (progress: ApolloIOProgress) => void,
): Promise<ApolloImportWorkerResult & { rawLonLatMap: Record<string, unknown> }> {
  onProgress?.({ label: 'Importing Apollo map', detail: `Decoding ${filename}`, progress: 0.1 });
  const decodedEnu = await decode();
  const projString = readHeaderProjString(decodedEnu) ?? UTM_PRESETS.beijing;

  onProgress?.({
    label: 'Importing Apollo map',
    detail: 'Projecting coordinates',
    progress: 0.3,
  });
  const { map: lonLatMap, projString: usedProj } = await apolloMapToLonLat(decodedEnu, projString);

  const baseEntities = hydrateEntitySourcesFromEditorMeta(
    lonLatMap,
    apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]),
  );
  const entities = processEntities(baseEntities);
  const bounds = computeApolloMapBounds(
    lonLatMap as Parameters<typeof computeApolloMapBounds>[0],
  ) as ApolloMapBounds | null;

  onProgress?.({ label: 'Importing Apollo map', detail: 'Applying result', progress: 0.98 });

  return {
    rawLonLatMap: lonLatMap,
    info: {
      filename,
      counts: entityCounts(lonLatMap),
      projString: usedProj,
      importedAt: Date.now(),
    },
    header: cloneHeader(lonLatMap),
    bounds,
    entities,
    stats: {
      decodeMs: 1,
      projectMs: 1,
      bridgeMs: 1,
      topologyMs: 1,
      overlapMs: 1,
      totalMs: 5,
    },
  };
}

function createFixtureBridge(): FixtureBridge {
  let cachedRawLonLatMap: Record<string, unknown> | null = null;

  async function exportFixture(
    entities: MapEntity[],
    projString: string,
    format: 'bin' | 'txt',
    onProgress?: (progress: ApolloIOProgress) => void,
    options?: { baseMapSource?: ApolloExportBaseMapSource },
  ): Promise<Uint8Array> {
    const baseMapSource = options?.baseMapSource ?? 'cached';
    if (baseMapSource === 'cached' && !cachedRawLonLatMap) {
      throw new Error('No imported Apollo map is cached in the IO worker.');
    }

    onProgress?.({
      label: 'Exporting Apollo map',
      detail: 'Merging editor entities',
      progress: 0.4,
    });
    const processed = processEntities(entities);
    const baseMap =
      baseMapSource === 'blank' ? createBlankApolloMap(projString) : cachedRawLonLatMap!;
    const merged = entitiesToApolloMap(baseMap, processed);
    writeEntitySourcesToEditorMeta(merged, processed);

    onProgress?.({
      label: 'Exporting Apollo map',
      detail: 'Projecting coordinates',
      progress: 0.6,
    });
    const { map: enuMap } = await apolloMapFromLonLat(merged, projString);
    if (baseMapSource === 'blank') {
      const bounds = computeApolloMapBounds(
        enuMap as Parameters<typeof computeApolloMapBounds>[0],
      ) as ApolloMapBounds | null;
      setApolloMapBounds(merged, bounds);
      setApolloMapBounds(enuMap, bounds);
      cachedRawLonLatMap = merged;
    }

    onProgress?.({
      label: 'Exporting Apollo map',
      detail: format === 'bin' ? 'Encoding binary protobuf' : 'Encoding text protobuf',
      progress: 0.85,
    });
    if (format === 'bin') return encodeMapBin(enuMap);
    return textEncoder.encode(await encodeMapText(enuMap));
  }

  const bridge = {
    importBin: vi.fn<ImportFn>(async (filename, bytes, onProgress) => {
      const result = await importFixture(filename, () => decodeMapBin(bytes), onProgress);
      cachedRawLonLatMap = result.rawLonLatMap;
      return result;
    }),
    importText: vi.fn<ImportFn>(async (filename, bytes, onProgress) => {
      const result = await importFixture(
        filename,
        () => decodeMapText(textDecoder.decode(bytes)),
        onProgress,
      );
      cachedRawLonLatMap = result.rawLonLatMap;
      return result;
    }),
    exportBin: vi.fn<ExportFn>((entities, projString, onProgress, options) =>
      exportFixture(entities, projString, 'bin', onProgress, options),
    ),
    exportText: vi.fn<ExportFn>((entities, projString, onProgress, options) =>
      exportFixture(entities, projString, 'txt', onProgress, options),
    ),
  };

  return bridge;
}

async function importMapIOModule() {
  return import('../mapIO');
}

function readFixture(filePath: string): Uint8Array {
  return new Uint8Array(readFileSync(filePath));
}

function expectTaskCleared(): void {
  expect(useTaskProgressStore.getState().activeTask).toBeNull();
}

function entityTypeCounts(entities: Iterable<MapEntity>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    counts[entity.entityType] = (counts[entity.entityType] ?? 0) + 1;
  }
  return counts;
}

function positiveCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

function expectLonLatBounds(bounds: ApolloMapBounds | null): void {
  expect(bounds).not.toBeNull();
  const [[west, south], [east, north]] = bounds!;
  for (const value of [west, south, east, north]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(west).toBeLessThan(east);
  expect(south).toBeLessThan(north);
  expect(west).toBeGreaterThanOrEqual(-180);
  expect(east).toBeLessThanOrEqual(180);
  expect(south).toBeGreaterThanOrEqual(-90);
  expect(north).toBeLessThanOrEqual(90);
}

function expectSunnyvaleBounds(bounds: ApolloMapBounds | null): void {
  expectLonLatBounds(bounds);
  const [[west, south], [east, north]] = bounds!;
  expect(west).toBeGreaterThan(-123);
  expect(east).toBeLessThan(-121);
  expect(south).toBeGreaterThan(36);
  expect(north).toBeLessThan(39);
}

function firstLanePoint(entities: Iterable<MapEntity>): { x: number; y: number } {
  for (const entity of entities) {
    if (entity.entityType === 'lane')
      return entity.centralCurve.segments[0]!.lineSegment.points[0]!;
  }
  throw new Error('No lane entity found');
}

async function readSelectedFile(selected: Blob): Promise<Uint8Array> {
  return new Uint8Array(await selected.arrayBuffer());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  resetStores();
  fileIOMock.readFileAsBytes.mockImplementation(readSelectedFile);
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe('apollo-io fixture-backed import/export E2E', () => {
  it('imports a mocked .bin fixture selection, updates entities and metadata, then downloads bin and text exports', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const binBytes = readFixture(BIN_FIXTURE);
    const file = fixtureFile('base_map.bin', binBytes);
    fileIOMock.pickFile.mockResolvedValue(file);

    try {
      const info = await mapIO.pickAndImportApollo();

      expect(fileIOMock.pickFile).toHaveBeenCalledWith(
        '.bin,.txt,.pb.txt,application/octet-stream,text/plain',
      );
      expect(fileIOMock.readFileAsBytes).toHaveBeenCalledWith(file);
      expect(bridge.importBin).toHaveBeenCalledWith('base_map.bin', binBytes, expect.any(Function));
      expect(bridge.importText).not.toHaveBeenCalled();
      expect(info).toMatchObject({
        source: 'imported',
        filename: 'base_map.bin',
        counts: BIN_FIXTURE_COUNTS,
        projString: expect.stringContaining('+proj=utm'),
      });
      expect(info?.importedAt).toBe(now.getTime());

      const apolloState = useApolloMapStore.getState();
      expect(apolloState.info).toEqual(info);
      expect(apolloState.lastError).toBeNull();
      expect(apolloState.header).toMatchObject({
        projection: { proj: expect.stringContaining('+proj=utm') },
      });
      expect(readHeaderProjString({ header: apolloState.header! })).toBe(info!.projString);
      expectSunnyvaleBounds(apolloState.bounds);

      const importedEntities = useMapStore.getState().entities;
      expect(importedEntities.size).toBeGreaterThan(0);
      expect([...importedEntities.values()].every(isApolloMapEntity)).toBe(true);
      expect(entityTypeCounts(importedEntities.values())).toMatchObject({
        crosswalk: 6,
        junction: 2,
        lane: 60,
        road: 37,
        signal: 15,
        stopSign: 2,
      });
      const lanePoint = firstLanePoint(importedEntities.values());
      expect(lanePoint.x).toBeGreaterThan(-123);
      expect(lanePoint.x).toBeLessThan(-121);
      expect(lanePoint.y).toBeGreaterThan(36);
      expect(lanePoint.y).toBeLessThan(39);
      useMapStore.temporal.getState().undo();
      expect(useMapStore.getState().entities.size).toBe(importedEntities.size);
      expectTaskCleared();

      await mapIO.exportApolloBin();
      await mapIO.exportApolloText();

      expect(bridge.exportBin).toHaveBeenCalledWith(
        [...importedEntities.values()],
        info!.projString,
        expect.any(Function),
        { baseMapSource: 'cached' },
      );
      expect(bridge.exportText).toHaveBeenCalledWith(
        [...importedEntities.values()],
        info!.projString,
        expect.any(Function),
        { baseMapSource: 'cached' },
      );
      expect(fileIOMock.downloadBlob).toHaveBeenCalledTimes(2);

      const [binBlob, binFilename] = fileIOMock.downloadBlob.mock.calls[0]!;
      expect(binFilename).toBe('base_map-20260608123456.bin');
      expect((binBlob as Blob).type).toBe('application/octet-stream');
      const exportedBin = new Uint8Array(await (binBlob as Blob).arrayBuffer());
      expect(exportedBin.byteLength).toBeGreaterThan(0);
      const decodedBin = await decodeMapBin(exportedBin);
      expect(entityCounts(decodedBin)).toMatchObject(BIN_EXPORTED_COUNTS);
      expect(readHeaderProjString(decodedBin)).toBe(info!.projString);

      const [textBlob, textFilename] = fileIOMock.downloadBlob.mock.calls[1]!;
      expect(textFilename).toBe('base_map-20260608123456.txt');
      expect((textBlob as Blob).type).toBe('text/plain');
      const exportedText = await (textBlob as Blob).text();
      expect(exportedText).toContain('header {');
      expect(exportedText).toMatch(/\nlane\s*\{/);
      const decodedText = await decodeMapText(exportedText);
      expect(entityCounts(decodedText)).toMatchObject(BIN_EXPORTED_COUNTS);
      expect(readHeaderProjString(decodedText)).toBe(info!.projString);
      expect(positiveCounts(entityCounts(decodedText))).toEqual(
        positiveCounts(entityCounts(decodedBin)),
      );
      expect(readHeaderProjString(decodedText)).toBe(readHeaderProjString(decodedBin));
      expectTaskCleared();
    } finally {
      restore();
    }
  });

  it('imports a mocked .txt fixture selection through the text route and replaces previous metadata', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const txtBytes = readFixture(TXT_FIXTURE);
    const staleEntity = crosswalk('stale_crosswalk');
    const staleDrawing = polyline('stale_polyline');
    useApolloMapStore.getState().setImported(
      {
        source: 'imported',
        filename: 'stale.bin',
        counts: { crosswalk: 1 },
        projString: 'old',
        importedAt: 1,
      },
      EXISTING_BOUNDS,
      { projection: { proj: 'old' }, stale: true },
    );
    useApolloMapStore.getState().setError('stale error');
    setEntities(
      new Map<string, MapEntity>([
        [staleEntity.id, staleEntity],
        [staleDrawing.id, staleDrawing],
      ]),
    );
    fileIOMock.pickFile.mockResolvedValue(fixtureFile('base_map.txt', txtBytes));

    try {
      const info = await mapIO.pickAndImportApollo();

      expect(bridge.importText).toHaveBeenCalledWith(
        'base_map.txt',
        txtBytes,
        expect.any(Function),
      );
      expect(bridge.importBin).not.toHaveBeenCalled();
      expect(info).toMatchObject({
        source: 'imported',
        filename: 'base_map.txt',
        counts: TXT_FIXTURE_COUNTS,
        importedAt: now.getTime(),
        projString: TEXT_FIXTURE_SANITIZED_PROJ,
      });
      expect(info?.importedAt).toBe(now.getTime());
      expect(useApolloMapStore.getState()).toMatchObject({
        info,
        lastError: null,
      });
      expect(useApolloMapStore.getState().header).toMatchObject({
        version: new TextEncoder().encode('03/10/17_22.46.20'),
        date: new TextEncoder().encode('20161124'),
        projection: { proj: TEXT_FIXTURE_HEADER_PROJ },
      });
      expect(useApolloMapStore.getState().header).not.toHaveProperty('stale');
      expect(readHeaderProjString({ header: useApolloMapStore.getState().header! })).toBe(
        TEXT_FIXTURE_HEADER_PROJ,
      );
      expectLonLatBounds(useApolloMapStore.getState().bounds);
      expect(useApolloMapStore.getState().bounds).not.toEqual(EXISTING_BOUNDS);
      expect(useMapStore.getState().entities.has('stale_crosswalk')).toBe(false);
      expect(useMapStore.getState().entities.has('stale_polyline')).toBe(false);
      expect(entityTypeCounts(useMapStore.getState().entities.values())).toEqual(TXT_ENTITY_COUNTS);
      const lanePoint = firstLanePoint(useMapStore.getState().entities.values());
      expect(lanePoint.x).toBeGreaterThanOrEqual(-180);
      expect(lanePoint.x).toBeLessThanOrEqual(180);
      expect(lanePoint.y).toBeGreaterThanOrEqual(-90);
      expect(lanePoint.y).toBeLessThanOrEqual(90);
      useMapStore.temporal.getState().undo();
      expect(useMapStore.getState().entities.has('stale_crosswalk')).toBe(false);
      expect(useMapStore.getState().entities.has('stale_polyline')).toBe(false);
      expect(entityTypeCounts(useMapStore.getState().entities.values())).toEqual(TXT_ENTITY_COUNTS);

      await mapIO.exportApolloText();
      await mapIO.exportApolloBin();
      expect(fileIOMock.downloadBlob).toHaveBeenCalledTimes(2);
      const [textBlob, textFilename] = fileIOMock.downloadBlob.mock.calls[0]!;
      expect(textFilename).toBe('base_map-20260608123456.txt');
      const exportedText = await (textBlob as Blob).text();
      const decodedExport = await decodeMapText(exportedText);
      expect(entityCounts(decodedExport)).toMatchObject(TXT_EXPORTED_COUNTS);
      expect(decodedExport.header).toMatchObject({
        version: new TextEncoder().encode('03/10/17_22.46.20'),
        date: new TextEncoder().encode('20161124'),
      });
      expect(readHeaderProjString(decodedExport)).toBe(TEXT_FIXTURE_HEADER_PROJ);
      const [binBlob, binFilename] = fileIOMock.downloadBlob.mock.calls[1]!;
      expect(binFilename).toBe('base_map-20260608123456.bin');
      const decodedBinExport = await decodeMapBin(
        new Uint8Array(await (binBlob as Blob).arrayBuffer()),
      );
      expect(entityCounts(decodedBinExport)).toMatchObject(TXT_EXPORTED_COUNTS);
      expect(readHeaderProjString(decodedBinExport)).toBe(TEXT_FIXTURE_HEADER_PROJ);
      expectTaskCleared();
    } finally {
      restore();
    }
  });

  it('surfaces an import error for a mocked JSON fixture without changing existing map state', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const jsonBytes = readFixture(JSON_FIXTURE);
    const existing = crosswalk('existing_crosswalk');
    const existingInfo = {
      source: 'imported' as const,
      filename: 'existing.bin',
      counts: { crosswalk: 1 },
      projString: UTM_PRESETS.sunnyvale,
      importedAt: 123,
    };
    const existingHeader = { projection: { proj: UTM_PRESETS.sunnyvale } };
    useApolloMapStore.getState().setImported(existingInfo, EXISTING_BOUNDS, existingHeader);
    setEntities(new Map<string, MapEntity>([[existing.id, existing]]));
    fileIOMock.pickFile.mockResolvedValue(fixtureFile('not_apollo_map.json', jsonBytes));

    try {
      await expect(mapIO.pickAndImportApollo()).resolves.toBeNull();

      expect(fileIOMock.pickFile).toHaveBeenCalledWith(
        '.bin,.txt,.pb.txt,application/octet-stream,text/plain',
      );
      expect(fileIOMock.pickFile.mock.calls[0]![0]).not.toContain('.json');
      expect(fileIOMock.readFileAsBytes).toHaveBeenCalledTimes(1);
      expect(bridge.importBin).toHaveBeenCalledWith(
        'not_apollo_map.json',
        jsonBytes,
        expect.any(Function),
      );
      expect(bridge.importBin).toHaveBeenCalledTimes(1);
      expect(bridge.importText).not.toHaveBeenCalled();
      const importError = useApolloMapStore.getState().lastError;
      expect(importError).toMatch(/^Import failed: .+/);
      expect(useApolloMapStore.getState().info).toEqual(existingInfo);
      expect(useApolloMapStore.getState().header).toEqual(existingHeader);
      expect(useApolloMapStore.getState().bounds).toEqual(EXISTING_BOUNDS);
      expect([...useMapStore.getState().entities.values()]).toEqual([existing]);
      expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('[mapIO] import failed', expect.any(Error));
      expectTaskCleared();
    } finally {
      errorSpy.mockRestore();
      restore();
    }
  });

  it('records selected-file read failures before starting bridge import work', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const existing = crosswalk('existing_crosswalk');
    const existingInfo = {
      source: 'imported' as const,
      filename: 'existing.bin',
      counts: { crosswalk: 1 },
      projString: UTM_PRESETS.sunnyvale,
      importedAt: 123,
    };
    const existingHeader = { projection: { proj: UTM_PRESETS.sunnyvale } };
    useApolloMapStore.getState().setImported(existingInfo, EXISTING_BOUNDS, existingHeader);
    setEntities(new Map<string, MapEntity>([[existing.id, existing]]));
    fileIOMock.pickFile.mockResolvedValue(fixtureFile('unreadable.bin', new Uint8Array([1])));
    fileIOMock.readFileAsBytes.mockRejectedValueOnce(new Error('read failed'));

    try {
      await expect(mapIO.pickAndImportApollo()).resolves.toBeNull();

      expect(fileIOMock.readFileAsBytes).toHaveBeenCalledTimes(1);
      expect(bridge.importBin).not.toHaveBeenCalled();
      expect(bridge.importText).not.toHaveBeenCalled();
      expect(useApolloMapStore.getState().lastError).toBe('Import failed: read failed');
      expect(useApolloMapStore.getState().info).toEqual(existingInfo);
      expect(useApolloMapStore.getState().header).toEqual(existingHeader);
      expect(useApolloMapStore.getState().bounds).toEqual(EXISTING_BOUNDS);
      expect([...useMapStore.getState().entities.values()]).toEqual([existing]);
      expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('[mapIO] import failed', expect.any(Error));
      expectTaskCleared();
    } finally {
      errorSpy.mockRestore();
      restore();
    }
  });

  it('exports a created map after projection selection and records created metadata', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const created = crosswalk('created_crosswalk');
    useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(UTM_PRESETS.sunnyvale) });
    setEntities(new Map<string, MapEntity>([[created.id, created]]));

    try {
      await mapIO.exportApolloBin();

      expect(useProjDialogStore.getState().request).toHaveBeenCalledTimes(1);
      expect(bridge.exportBin).toHaveBeenCalledWith(
        [created],
        UTM_PRESETS.sunnyvale,
        expect.any(Function),
        { baseMapSource: 'blank' },
      );
      expect(fileIOMock.downloadBlob).toHaveBeenCalledTimes(1);
      const [blob, filename] = fileIOMock.downloadBlob.mock.calls[0]!;
      expect(filename).toBe('apollo-map-20260608123456.bin');
      expect((blob as Blob).type).toBe('application/octet-stream');
      const decoded = await decodeMapBin(new Uint8Array(await (blob as Blob).arrayBuffer()));
      expect(decoded.crosswalk).toHaveLength(1);
      expect(useApolloMapStore.getState()).toMatchObject({
        info: {
          source: 'created',
          filename: 'apollo-map',
          counts: { crosswalk: 1 },
          projString: UTM_PRESETS.sunnyvale,
        },
        header: { projection: { proj: UTM_PRESETS.sunnyvale } },
        lastError: null,
      });
      expectTaskCleared();
    } finally {
      restore();
    }
  });

  it('does not remember a created map when the created export download fails', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const created = crosswalk('created_crosswalk');
    useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(UTM_PRESETS.sunnyvale) });
    setEntities(new Map<string, MapEntity>([[created.id, created]]));
    fileIOMock.downloadBlob.mockImplementationOnce(() => {
      throw new Error('download failed');
    });

    try {
      await mapIO.exportApolloBin();

      expect(useProjDialogStore.getState().request).toHaveBeenCalledTimes(1);
      expect(bridge.exportBin).toHaveBeenCalledWith(
        [created],
        UTM_PRESETS.sunnyvale,
        expect.any(Function),
        { baseMapSource: 'blank' },
      );
      expect(useApolloMapStore.getState().lastError).toBe('Export failed: download failed');
      expect(useApolloMapStore.getState().info).toBeNull();
      expect(useApolloMapStore.getState().header).toBeNull();
      expect(useApolloMapStore.getState().bounds).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith('[mapIO] export failed', expect.any(Error));
      expectTaskCleared();
    } finally {
      errorSpy.mockRestore();
      restore();
    }
  });

  it('does not export or download when there is no Apollo data', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(UTM_PRESETS.sunnyvale) });
    setEntities(new Map<string, MapEntity>([[polyline().id, polyline()]]));

    try {
      await mapIO.exportApolloBin();
      await mapIO.exportApolloText();

      expect(useProjDialogStore.getState().request).not.toHaveBeenCalled();
      expect(bridge.exportBin).not.toHaveBeenCalled();
      expect(bridge.exportText).not.toHaveBeenCalled();
      expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
      expect(useApolloMapStore.getState().lastError).toBe(
        'Nothing to export - draw or import Apollo map elements first.',
      );
      expect(useApolloMapStore.getState().info).toBeNull();
      expect(useApolloMapStore.getState().bounds).toBeNull();
      expectTaskCleared();
    } finally {
      restore();
    }
  });

  it('cancels file selection and created-map export without starting IO work', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const existing = crosswalk('existing_crosswalk');
    const existingInfo = {
      source: 'imported' as const,
      filename: 'existing.bin',
      counts: { crosswalk: 1 },
      projString: UTM_PRESETS.sunnyvale,
      importedAt: 123,
    };
    const existingHeader = { projection: { proj: UTM_PRESETS.sunnyvale } };
    useApolloMapStore.getState().setImported(existingInfo, EXISTING_BOUNDS, existingHeader);
    setEntities(new Map<string, MapEntity>([[existing.id, existing]]));
    fileIOMock.pickFile.mockResolvedValue(null);

    try {
      await expect(mapIO.pickAndImportApollo()).resolves.toBeNull();

      expect(fileIOMock.readFileAsBytes).not.toHaveBeenCalled();
      expect(bridge.importBin).not.toHaveBeenCalled();
      expect(bridge.importText).not.toHaveBeenCalled();
      expect(useApolloMapStore.getState().info).toEqual(existingInfo);
      expect(useApolloMapStore.getState().header).toEqual(existingHeader);
      expect(useApolloMapStore.getState().bounds).toEqual(EXISTING_BOUNDS);
      expect([...useMapStore.getState().entities.values()]).toEqual([existing]);
      expectTaskCleared();

      useApolloMapStore.getState().clear();
      const drawn = crosswalk('drawn_crosswalk');
      setEntities(new Map<string, MapEntity>([[drawn.id, drawn]]));
      useProjDialogStore.setState({ request: vi.fn().mockResolvedValue(null) });

      await mapIO.exportApolloBin();
      await mapIO.exportApolloText();

      expect(useProjDialogStore.getState().request).toHaveBeenCalledTimes(2);
      expect(bridge.exportBin).not.toHaveBeenCalled();
      expect(bridge.exportText).not.toHaveBeenCalled();
      expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
      expect(useApolloMapStore.getState().lastError).toBeNull();
      expect(useApolloMapStore.getState().info).toBeNull();
      expect(useApolloMapStore.getState().header).toBeNull();
      expect([...useMapStore.getState().entities.values()]).toEqual([drawn]);
      expectTaskCleared();
    } finally {
      restore();
    }
  });

  it('records export failures without downloading or replacing existing import metadata', async () => {
    const mapIO = await importMapIOModule();
    const bridge = createFixtureBridge();
    const restore = mapIO.setApolloIOBridgeForTests(bridge);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const existing = crosswalk('existing_crosswalk');
    const existingInfo = {
      source: 'imported' as const,
      filename: 'existing.bin',
      counts: { crosswalk: 1 },
      projString: UTM_PRESETS.sunnyvale,
      importedAt: 123,
    };
    const existingHeader = { projection: { proj: UTM_PRESETS.sunnyvale } };
    useApolloMapStore.getState().setImported(existingInfo, null, existingHeader);
    setEntities(new Map<string, MapEntity>([[existing.id, existing]]));
    bridge.exportText.mockRejectedValueOnce(new Error('encode failed'));

    try {
      await mapIO.exportApolloText();

      expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();
      expect(useApolloMapStore.getState().lastError).toBe('Export failed: encode failed');
      expect(useApolloMapStore.getState().info).toEqual(existingInfo);
      expect(useApolloMapStore.getState().header).toEqual(existingHeader);
      expect([...useMapStore.getState().entities.values()]).toEqual([existing]);
      expect(errorSpy).toHaveBeenCalledWith('[mapIO] export failed', expect.any(Error));
      expectTaskCleared();
    } finally {
      errorSpy.mockRestore();
      restore();
    }
  });
});
