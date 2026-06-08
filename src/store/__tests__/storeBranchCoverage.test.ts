import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicenseState } from '@/lib/license-bridge';
import { licenseBridge } from '@/lib/license-bridge';
import {
  makeBlankScenario,
  makeObstacle,
  makeTrafficLight,
  nextApolloId,
} from '@/io/scenario/factory';
import {
  DEFAULT_HISTORY_LIMIT,
  readGridEnabled,
  readHistoryLimit,
  readLaneBoundaryType,
  readSnapEnabled,
  persistSetting,
  setSettingsStorageForTests,
  SETTINGS_STORAGE_KEYS,
  useSettingsStore,
} from '../settingsStore';
import { useLicenseStore } from '../licenseStore';
import type { LoadedScenario } from '../scenarioStore';
import { useScenarioStore } from '../scenarioStore';
import {
  isEntityTypeInteractive,
  isEntityTypeLocked,
  isEntityTypeVisible,
  useUIStore,
  type LayerStates,
} from '../uiStore';

const initialUIState = useUIStore.getState();
const initialSettingsState = useSettingsStore.getState();
const initialLicenseState = useLicenseStore.getState();
const setSettingsStorageOverride = setSettingsStorageForTests as (
  storage: Parameters<typeof setSettingsStorageForTests>[0] | undefined,
) => void;

function resetScenarioStore() {
  useScenarioStore.setState({
    loaded: [],
    activeKey: null,
    projString: null,
    selectedObstacleUid: null,
    selectedTrafficLightUid: null,
    selectedKind: null,
  });
  useScenarioStore.temporal.getState().clear();
}

function loadedScenario(key: string): LoadedScenario {
  return {
    key,
    filename: `${key}.json`,
    doc: makeBlankScenario('openscenario', { mapDir: 'maps/demo' }),
  };
}

function makeLicenseState(overrides: Partial<LicenseState> = {}): LicenseState {
  return {
    status: 'trial',
    canEdit: true,
    machineCode: 'machine',
    trialStart: 1,
    trialEnd: 2,
    daysRemaining: 1,
    hoursRemaining: 24,
    license: null,
    checkedAt: 3,
    reason: 'test',
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setSettingsStorageOverride(undefined);
  useUIStore.setState(initialUIState, true);
  useSettingsStore.setState(initialSettingsState, true);
  useLicenseStore.setState(initialLicenseState, true);
  resetScenarioStore();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setSettingsStorageOverride(undefined);
  useUIStore.setState(initialUIState, true);
  useSettingsStore.setState(initialSettingsState, true);
  useLicenseStore.setState(initialLicenseState, true);
  resetScenarioStore();
});

describe('uiStore uncovered branch behavior', () => {
  it('computes direct layer visibility, lock, and interactivity fallbacks', () => {
    const states: LayerStates = {
      lane: { visible: false, locked: false },
      signal: { visible: true, locked: true },
    };

    expect(isEntityTypeVisible(states, 'lane')).toBe(false);
    expect(isEntityTypeLocked(states, 'lane')).toBe(false);
    expect(isEntityTypeInteractive(states, 'lane')).toBe(false);
    expect(isEntityTypeInteractive(states, 'signal')).toBe(false);
    expect(isEntityTypeVisible(states, 'crosswalk')).toBe(true);
    expect(isEntityTypeLocked(states, 'crosswalk')).toBe(false);
    expect(isEntityTypeInteractive(states, 'crosswalk')).toBe(true);
  });

  it('patches unknown layer types from default state', () => {
    const store = useUIStore.getState();

    store.setLayerLocked('custom-layer', true);

    expect(useUIStore.getState().layerStates['custom-layer']).toEqual({
      visible: true,
      locked: true,
    });
  });

  it('does not notify when setting the same snap target again', () => {
    const target = {
      kind: 'vertex' as const,
      entityId: 'lane_1',
      entityType: 'lane',
      point: { x: 1, y: 2 },
    };
    let notifications = 0;
    const unsubscribe = useUIStore.subscribe(() => {
      notifications += 1;
    });

    useUIStore.getState().setSnapTarget(target);
    useUIStore.getState().setSnapTarget({
      ...target,
      point: { x: 1, y: 2 },
    });
    useUIStore.getState().setSnapTarget(null);
    useUIStore.getState().setSnapTarget(null);
    unsubscribe();

    expect(notifications).toBe(2);
  });

  it('resets connect mode and boundary brush from both active and inactive states', () => {
    const store = useUIStore.getState();

    store.setBoundaryBrushType('CURB');
    store.toggleConnectMode();
    store.setConnectFirstLane('lane_1');
    expect(useUIStore.getState().connectMode).toEqual({ active: true, firstLaneId: 'lane_1' });
    expect(useUIStore.getState().boundaryBrush.active).toBe(false);

    useUIStore.getState().toggleConnectMode();
    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });

    useUIStore.getState().setBoundaryBrushType('DOUBLE_YELLOW');
    useUIStore.getState().exitBoundaryBrush();
    expect(useUIStore.getState().boundaryBrush).toEqual({
      active: false,
      type: 'DOUBLE_YELLOW',
    });

    useUIStore.getState().toggleConnectMode();
    useUIStore.getState().setConnectFirstLane('lane_2');
    useUIStore.getState().exitConnectMode();
    expect(useUIStore.getState().connectMode).toEqual({ active: false, firstLaneId: null });
  });
});

describe('settings persistence uncovered branch behavior', () => {
  it('falls back and skips writes when storage is unavailable', () => {
    setSettingsStorageForTests(null);

    expect(readHistoryLimit()).toBe(DEFAULT_HISTORY_LIMIT);
    expect(readGridEnabled()).toBe(true);
    expect(readSnapEnabled()).toBe(false);
    expect(readLaneBoundaryType()).toBe('DOTTED_WHITE');
    expect(() => persistSetting(SETTINGS_STORAGE_KEYS.historyLimit, 123)).not.toThrow();
  });

  it('falls back when window.localStorage access throws', () => {
    setSettingsStorageOverride(undefined);
    vi.stubGlobal('window', {
      document: {},
      get localStorage() {
        throw new Error('private mode');
      },
    });

    expect(readHistoryLimit()).toBe(DEFAULT_HISTORY_LIMIT);
  });

  it('ignores storage read/write exceptions and invalid boolean text', () => {
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error('read failed');
      }),
      setItem: vi.fn(() => {
        throw new Error('write failed');
      }),
    };
    setSettingsStorageForTests(throwingStorage);

    expect(readHistoryLimit()).toBe(DEFAULT_HISTORY_LIMIT);
    expect(readGridEnabled()).toBe(true);
    expect(readLaneBoundaryType()).toBe('DOTTED_WHITE');
    expect(() => persistSetting(SETTINGS_STORAGE_KEYS.mapZoom, 16)).not.toThrow();

    const invalidBoolStorage = {
      getItem: vi.fn(() => 'maybe'),
      setItem: vi.fn(),
    };
    setSettingsStorageForTests(invalidBoolStorage);
    expect(readSnapEnabled()).toBe(false);
  });

  it('coerces invalid persisted lane boundary setter values to the default', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };
    setSettingsStorageForTests(storage);

    useSettingsStore.getState().setLaneBoundaryType('BROKEN' as never);

    expect(useSettingsStore.getState().laneBoundaryType).toBe('DOTTED_WHITE');
    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEYS.laneBoundaryType,
      'DOTTED_WHITE',
    );
  });
});

describe('licenseStore uncovered branch behavior', () => {
  it('applies a current hydrate response', async () => {
    const hydrated = makeLicenseState({ status: 'activated', reason: 'fresh hydrate' });
    vi.spyOn(licenseBridge, 'getState').mockResolvedValue(hydrated);

    await useLicenseStore.getState().hydrate();

    expect(useLicenseStore.getState().state).toBe(hydrated);
    expect(useLicenseStore.getState().initialized).toBe(true);
  });

  it('registers and replaces the activation prompt callback', () => {
    const first = vi.fn();
    const second = vi.fn();

    expect(() => useLicenseStore.getState().promptActivation()).not.toThrow();

    useLicenseStore.getState().registerPromptActivation(first);
    useLicenseStore.getState().promptActivation();
    useLicenseStore.getState().registerPromptActivation(second);
    useLicenseStore.getState().promptActivation();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('scenarioStore uncovered branch behavior', () => {
  it('ignores edits when activeKey points at a missing loaded entry', () => {
    const entry = loadedScenario('a');
    useScenarioStore.getState().addLoaded(entry);
    useScenarioStore.getState().setActive('missing');

    useScenarioStore
      .getState()
      .addObstacle(makeObstacle('vehicle', { x: 0, y: 0 }, nextApolloId(entry.doc)));
    useScenarioStore.getState().addTrafficLight(makeTrafficLight({ x: 1, y: 1 }, 'Sig_1'));
    useScenarioStore.getState().addEgoWaypoint({ x: 2, y: 2 });

    expect(useScenarioStore.getState().loaded[0]!.doc.obstacles).toHaveLength(0);
    expect(useScenarioStore.getState().loaded[0]!.doc.trafficLights).toHaveLength(0);
    expect(useScenarioStore.getState().loaded[0]!.doc.ego.waypoints).toHaveLength(0);
  });

  it('removing an inactive scenario keeps active scenario and selection intact', () => {
    const first = loadedScenario('a');
    const second = loadedScenario('b');
    useScenarioStore.getState().addLoaded(first);
    useScenarioStore.getState().addLoaded(second);
    useScenarioStore.getState().selectTrafficLight('Sig_active');

    useScenarioStore.getState().removeLoaded('a');

    expect(useScenarioStore.getState().activeKey).toBe('b');
    expect(useScenarioStore.getState().loaded.map((entry) => entry.key)).toEqual(['b']);
    expect(useScenarioStore.getState().selectedTrafficLightUid).toBe('Sig_active');
    expect(useScenarioStore.getState().selectedKind).toBe('trafficLight');
  });

  it('ignores missing active obstacle position updates', () => {
    const entry = loadedScenario('a');
    const before = structuredClone(entry.doc);
    useScenarioStore.getState().addLoaded(entry);

    useScenarioStore.getState().updateObstaclePosition('missing', { x: 5, y: 6, h: 0.5 });

    expect(useScenarioStore.getState().loaded[0]!.doc).toEqual(before);
  });

  it('removing a different traffic light does not clear current traffic light selection', () => {
    const entry = loadedScenario('a');
    const selected = makeTrafficLight({ x: 0, y: 0 }, 'Sig_selected');
    const other = makeTrafficLight({ x: 1, y: 1 }, 'Sig_other');
    useScenarioStore.getState().addLoaded(entry);
    useScenarioStore.getState().addTrafficLight(selected);
    useScenarioStore.getState().addTrafficLight(other);
    useScenarioStore.getState().selectTrafficLight(selected.uid);

    useScenarioStore.getState().removeTrafficLight(other.uid);

    expect(useScenarioStore.getState().selectedTrafficLightUid).toBe(selected.uid);
    expect(useScenarioStore.getState().selectedKind).toBe('trafficLight');
    expect(useScenarioStore.getState().loaded[0]!.doc.trafficLights).toHaveLength(1);
  });
});
