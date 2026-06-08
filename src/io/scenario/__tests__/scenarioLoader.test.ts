import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApolloMapStore } from '@/store/apolloMapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import { useScenarioStore } from '@/store/scenarioStore';
import { parseScenario } from '../parse';
import { loadScenariosFromPicker, newScenarioFromUI, saveActiveScenario } from '../scenarioLoader';

const fileIOMock = vi.hoisted(() => ({
  pickFiles: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock('@/io/fileIO', () => fileIOMock);

type FakeFile = Pick<File, 'name' | 'size' | 'text'>;

function openRaw(id = 'scenario-loader-open') {
  return {
    id,
    scenario: {
      autoCarInfo: { start: { x: 1, y: 2 }, end: { x: 3, y: 4 } },
      entities: { scenarioObjects: [] },
      storyboard: { init: { actions: { privates: [] } } },
    },
  };
}

function textFile(name: string, body: string, size = body.length) {
  const textSpy = vi.fn(async () => body);
  return {
    file: { name, size, text: textSpy } satisfies FakeFile,
    textSpy,
  };
}

function jsonFile(name: string, json: unknown) {
  return textFile(name, JSON.stringify(json));
}

function resetStores() {
  useScenarioStore.setState({
    loaded: [],
    activeKey: null,
    projString: null,
    selectedObstacleUid: null,
    selectedTrafficLightUid: null,
    selectedKind: null,
  });
  useScenarioStore.temporal.getState().clear();
  useApolloMapStore.getState().clear();
  useProjDialogStore.setState({ pending: false, resolver: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

describe('scenarioLoader: loadScenariosFromPicker', () => {
  it('returns null without resolving projection when the picker is cancelled', async () => {
    const requestSpy = vi.spyOn(useProjDialogStore.getState(), 'request').mockResolvedValue('proj');
    fileIOMock.pickFiles.mockResolvedValue([]);

    await expect(loadScenariosFromPicker()).resolves.toBeNull();

    expect(fileIOMock.pickFiles).toHaveBeenCalledWith('application/json,.json');
    expect(requestSpy).not.toHaveBeenCalled();
    expect(useScenarioStore.getState().loaded).toHaveLength(0);
  });

  it('cancels before reading files when projection selection is cancelled', async () => {
    const picked = jsonFile('valid.json', openRaw('cancelled'));
    vi.spyOn(useProjDialogStore.getState(), 'request').mockResolvedValue(null);
    fileIOMock.pickFiles.mockResolvedValue([picked.file]);

    await expect(loadScenariosFromPicker()).resolves.toBeNull();

    expect(picked.textSpy).not.toHaveBeenCalled();
    expect(useScenarioStore.getState().loaded).toHaveLength(0);
  });

  it('loads recognized scenarios and reports malformed, unknown, and oversized files', async () => {
    useApolloMapStore.getState().setImported(
      {
        filename: 'base_map.bin',
        counts: {},
        projString: '+proj=utm +zone=50',
        importedAt: 1,
      },
      null,
    );
    const valid = jsonFile('valid.json', openRaw('valid-load'));
    const malformed = textFile('malformed.json', '{');
    const unknown = jsonFile('unknown.json', { scenario: { nope: true } });
    const huge = textFile('huge.json', JSON.stringify(openRaw('huge')), 17 * 1024 * 1024);
    fileIOMock.pickFiles.mockResolvedValue([valid.file, malformed.file, unknown.file, huge.file]);

    const result = await loadScenariosFromPicker();

    expect(result?.loaded).toBe(1);
    expect(result?.failed.map((f) => f.filename)).toEqual([
      'malformed.json',
      'unknown.json',
      'huge.json',
    ]);
    expect(result?.failed[0]!.reason).toEqual(expect.any(String));
    expect(result?.failed[1]!.reason).toBe('not a recognized scenario file');
    expect(result?.failed[2]!.reason).toBe('file too large (17.0 MB > 16 MB)');
    expect(huge.textSpy).not.toHaveBeenCalled();

    const state = useScenarioStore.getState();
    expect(state.projString).toBe('+proj=utm +zone=50');
    expect(state.loaded).toHaveLength(1);
    expect(state.loaded[0]).toMatchObject({
      filename: 'valid.json',
      doc: { format: 'openscenario', meta: { id: 'valid-load' } },
    });
    expect(state.activeKey).toBe(state.loaded[0]!.key);
  });

  it('reuses an existing scenario projection without opening the projection dialog', async () => {
    const requestSpy = vi
      .spyOn(useProjDialogStore.getState(), 'request')
      .mockResolvedValue('dialog');
    useScenarioStore.getState().setProjString('stored-proj');
    fileIOMock.pickFiles.mockResolvedValue([jsonFile('valid.json', openRaw()).file]);

    await expect(loadScenariosFromPicker()).resolves.toMatchObject({ loaded: 1, failed: [] });

    expect(requestSpy).not.toHaveBeenCalled();
    expect(useScenarioStore.getState().projString).toBe('stored-proj');
  });
});

describe('scenarioLoader: save/new flows', () => {
  it('returns false without an active scenario and downloads the active one when present', async () => {
    expect(saveActiveScenario()).toBe(false);
    expect(fileIOMock.downloadBlob).not.toHaveBeenCalled();

    const doc = parseScenario(openRaw('save-me'));
    useScenarioStore.getState().addLoaded({ key: 'scenario-key', filename: 'save-me.json', doc });

    expect(saveActiveScenario()).toBe(true);
    expect(fileIOMock.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'save-me.json');
    const blob = fileIOMock.downloadBlob.mock.calls[0]![0] as Blob;
    await expect(blob.text().then(JSON.parse)).resolves.toMatchObject({ id: 'save-me' });
  });

  it('creates a new scenario with the resolved projection and cancels cleanly without one', async () => {
    vi.spyOn(useProjDialogStore.getState(), 'request').mockResolvedValueOnce(null);
    await expect(newScenarioFromUI('openscenario')).resolves.toBe(false);
    expect(useScenarioStore.getState().loaded).toHaveLength(0);

    useApolloMapStore.getState().setImported(
      {
        filename: 'base_map.bin',
        counts: {},
        projString: '+proj=utm +zone=49',
        importedAt: 1,
      },
      null,
    );

    await expect(newScenarioFromUI('classic')).resolves.toBe(true);

    const state = useScenarioStore.getState();
    expect(state.projString).toBe('+proj=utm +zone=49');
    expect(state.loaded).toHaveLength(1);
    expect(state.loaded[0]).toMatchObject({
      filename: 'untitled-classic.json',
      doc: { format: 'classic' },
    });
    expect(state.activeKey).toBe(state.loaded[0]!.key);
  });
});
