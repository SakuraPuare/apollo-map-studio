import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { registerBuiltinSettingsTabs } from '../builtinSettingsTabs';
import {
  getSettingsTabs,
  registerSettingsTab,
  type BooleanSettingEntryDef,
  type NumberSettingEntryDef,
  type SelectSettingEntryDef,
  type SettingsStoreSnapshot,
} from '../settingsRegistry';

vi.mock('@/components/layout/WorkspaceLayout/dockviewLayout', () => ({
  clearAllSavedLayouts: vi.fn(),
}));

registerBuiltinSettingsTabs();

const initialUIState = useUIStore.getState();

function entryById(id: string) {
  const entry = getSettingsTabs()
    .flatMap((tab) => tab.sections)
    .flatMap((section) => section.entries)
    .find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`setting entry not found: ${id}`);
  return entry;
}

function numberEntry(id: string): NumberSettingEntryDef {
  const entry = entryById(id);
  if (entry.kind !== 'number') throw new Error(`${id} is not a number entry`);
  return entry;
}

function booleanEntry(id: string): BooleanSettingEntryDef {
  const entry = entryById(id);
  if (entry.kind !== 'boolean') throw new Error(`${id} is not a boolean entry`);
  return entry;
}

function selectEntry(id: string): SelectSettingEntryDef {
  const entry = entryById(id);
  if (entry.kind !== 'select') throw new Error(`${id} is not a select entry`);
  return entry;
}

function fakeSettings(overrides: Partial<SettingsStoreSnapshot> = {}): SettingsStoreSnapshot {
  return {
    ...useSettingsStore.getState(),
    setHistoryLimit: vi.fn(),
    setMapCenter: vi.fn(),
    setMapZoom: vi.fn(),
    setGridEnabled: vi.fn(),
    setSnapEnabled: vi.fn(),
    setLaneHalfWidth: vi.fn(),
    setLaneArrowSpacing: vi.fn(),
    setLaneSpeedLimit: vi.fn(),
    setLaneBoundaryType: vi.fn(),
    setSnapRadius: vi.fn(),
    setClickThreshold: vi.fn(),
    setHitBboxPadding: vi.fn(),
    setHitTestRadius: vi.fn(),
    setLaneFillOpacity: vi.fn(),
    setLaneEdgeLineWidth: vi.fn(),
    setLaneEdgeLineOpacity: vi.fn(),
    setLaneCenterLineWidth: vi.fn(),
    setLaneCenterLineOpacity: vi.fn(),
    setLaneArrowSize: vi.fn(),
    setLaneArrowOpacity: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useUIStore.setState(initialUIState, true);
  vi.unstubAllGlobals();
});

afterEach(() => {
  useUIStore.setState(initialUIState, true);
  vi.unstubAllGlobals();
});

describe('settingsRegistry', () => {
  it('registers settings by vertical tab category', () => {
    const tabs = getSettingsTabs();
    expect(tabs.map((tab) => tab.id)).toEqual(['general', 'map', 'editing', 'rendering']);
  });

  it('returns the live registry and replaces tabs by id without reordering them', () => {
    const tabs = getSettingsTabs();
    const originalGeneral = tabs.find((tab) => tab.id === 'general');
    if (!originalGeneral) throw new Error('general tab not found');

    const replacement = {
      ...originalGeneral,
      label: 'General replacement',
      sections: originalGeneral.sections,
    };

    registerSettingsTab(replacement);
    expect(getSettingsTabs()).toBe(tabs);
    expect(getSettingsTabs().map((tab) => tab.id)).toEqual([
      'general',
      'map',
      'editing',
      'rendering',
    ]);
    expect(getSettingsTabs()[0]).toBe(replacement);

    registerSettingsTab(originalGeneral);
  });

  it('exposes existing settings fields through registry entries', () => {
    const entryIds = getSettingsTabs().flatMap((tab) =>
      tab.sections.flatMap((section) => section.entries.map((entry) => entry.id)),
    );

    expect(entryIds).toEqual(
      expect.arrayContaining([
        'historyLimit',
        'resetWorkspaceLayout',
        'mapCenterLng',
        'mapCenterLat',
        'mapZoom',
        'gridEnabled',
        'snapEnabled',
        'laneHalfWidth',
        'laneSpeedLimit',
        'laneBoundaryType',
        'snapRadius',
        'clickThreshold',
        'hitBboxPadding',
        'hitTestRadius',
        'laneArrowSize',
        'laneArrowSpacing',
        'laneArrowOpacity',
        'laneFillOpacity',
        'laneEdgeLineWidth',
        'laneEdgeLineOpacity',
        'laneCenterLineWidth',
        'laneCenterLineOpacity',
      ]),
    );
  });

  it('uses typed setting entry controls beyond number inputs', () => {
    const entries = getSettingsTabs().flatMap((tab) =>
      tab.sections.flatMap((section) => section.entries),
    );

    expect(entries.some((entry) => entry.kind === 'boolean')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'select')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'number')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'action')).toBe(true);
  });

  it('publishes labels, notes, ranges, and step metadata consumed by the settings panel', () => {
    expect(numberEntry('historyLimit')).toMatchObject({
      label: 'History limit',
      min: 10,
      max: 1000,
    });
    expect(numberEntry('laneHalfWidth')).toMatchObject({
      label: 'Default half-width (m)',
      step: 0.25,
    });
    expect(numberEntry('laneSpeedLimit')).toMatchObject({
      label: 'Default speed limit (km/h)',
      step: 5,
    });
    expect(numberEntry('laneArrowSpacing')).toMatchObject({ step: 10 });
    expect(numberEntry('laneCenterLineWidth')).toMatchObject({ step: 0.25 });
    expect(numberEntry('laneFillOpacity')).toMatchObject({ step: 0.05 });

    const sections = getSettingsTabs().flatMap((tab) => tab.sections);
    expect(sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'undo', note: 'Applies after restart' }),
        expect.objectContaining({ id: 'viewport', note: 'Applies after restart' }),
      ]),
    );
  });

  it('formats and commits lane speed limit with one km/h conversion', () => {
    const entry = numberEntry('laneSpeedLimit');
    const settings = fakeSettings({
      laneSpeedLimit: 60 / 3.6,
    });

    expect(entry.format?.(entry.value(settings))).toBe('60');

    entry.commit(settings, 90);
    expect(settings.setLaneSpeedLimit).toHaveBeenCalledWith(90 / 3.6);
  });

  it('commits general viewport and history entries to their settings actions', () => {
    const settings = fakeSettings({ mapCenterLng: 116.4, mapCenterLat: 39.9 });

    numberEntry('historyLimit').commit(settings, 250);
    numberEntry('mapCenterLng').commit(settings, 117.1);
    numberEntry('mapCenterLat').commit(settings, 40.2);
    numberEntry('mapZoom').commit(settings, 18.5);

    expect(settings.setHistoryLimit).toHaveBeenCalledWith(250);
    expect(settings.setMapCenter).toHaveBeenCalledWith(117.1, 39.9);
    expect(settings.setMapCenter).toHaveBeenCalledWith(116.4, 40.2);
    expect(settings.setMapZoom).toHaveBeenCalledWith(18.5);
    expect(numberEntry('mapZoom').format?.(18.5)).toBe('18.5');
  });

  it('commits boolean map-tool defaults through the UI store bridge', () => {
    booleanEntry('gridEnabled').commit(fakeSettings({ gridEnabled: false }), true);
    expect(useUIStore.getState().gridEnabled).toBe(true);

    booleanEntry('snapEnabled').commit(fakeSettings({ snapEnabled: true }), false);
    expect(useUIStore.getState().snapEnabled).toBe(false);
  });

  it('commits editing defaults, interaction tolerances, and boundary select entries', () => {
    const settings = fakeSettings({
      laneHalfWidth: 2,
      laneBoundaryType: 'SOLID_WHITE',
      snapRadius: 10,
      clickThreshold: 4,
      hitBboxPadding: 6,
      hitTestRadius: 8,
    });

    numberEntry('laneHalfWidth').commit(settings, 2.25);
    selectEntry('laneBoundaryType').commit(settings, 'DOTTED_YELLOW');
    numberEntry('snapRadius').commit(settings, 14);
    numberEntry('clickThreshold').commit(settings, 5);
    numberEntry('hitBboxPadding').commit(settings, 9);
    numberEntry('hitTestRadius').commit(settings, 11);

    expect(settings.setLaneHalfWidth).toHaveBeenCalledWith(2.25);
    expect(settings.setLaneBoundaryType).toHaveBeenCalledWith('DOTTED_YELLOW');
    expect(settings.setSnapRadius).toHaveBeenCalledWith(14);
    expect(settings.setClickThreshold).toHaveBeenCalledWith(5);
    expect(settings.setHitBboxPadding).toHaveBeenCalledWith(9);
    expect(settings.setHitTestRadius).toHaveBeenCalledWith(11);
    expect(selectEntry('laneBoundaryType').options).toContainEqual({
      value: 'SOLID_WHITE',
      label: 'Solid White',
    });
  });

  it('commits every lane rendering number entry to the matching setter', () => {
    const settings = fakeSettings();

    numberEntry('laneArrowSize').commit(settings, 16);
    numberEntry('laneArrowSpacing').commit(settings, 80);
    numberEntry('laneArrowOpacity').commit(settings, 0.6);
    numberEntry('laneFillOpacity').commit(settings, 0.25);
    numberEntry('laneEdgeLineWidth').commit(settings, 3);
    numberEntry('laneEdgeLineOpacity').commit(settings, 0.7);
    numberEntry('laneCenterLineWidth').commit(settings, 1.5);
    numberEntry('laneCenterLineOpacity').commit(settings, 0.45);

    expect(settings.setLaneArrowSize).toHaveBeenCalledWith(16);
    expect(settings.setLaneArrowSpacing).toHaveBeenCalledWith(80);
    expect(settings.setLaneArrowOpacity).toHaveBeenCalledWith(0.6);
    expect(settings.setLaneFillOpacity).toHaveBeenCalledWith(0.25);
    expect(settings.setLaneEdgeLineWidth).toHaveBeenCalledWith(3);
    expect(settings.setLaneEdgeLineOpacity).toHaveBeenCalledWith(0.7);
    expect(settings.setLaneCenterLineWidth).toHaveBeenCalledWith(1.5);
    expect(settings.setLaneCenterLineOpacity).toHaveBeenCalledWith(0.45);
    expect(numberEntry('laneArrowOpacity').format?.(0.6)).toBe('0.6');
  });

  it('reads current values for all built-in editable settings entries', () => {
    const settings = fakeSettings({
      historyLimit: 42,
      mapCenterLng: 116.4,
      mapCenterLat: 39.9,
      mapZoom: 18,
      gridEnabled: true,
      snapEnabled: false,
      laneHalfWidth: 1.75,
      laneSpeedLimit: 12.5,
      laneBoundaryType: 'CURB',
      snapRadius: 9,
      clickThreshold: 4,
      hitBboxPadding: 6,
      hitTestRadius: 8,
      laneArrowSize: 14,
      laneArrowSpacing: 70,
      laneArrowOpacity: 0.7,
      laneFillOpacity: 0.3,
      laneEdgeLineWidth: 2,
      laneEdgeLineOpacity: 0.8,
      laneCenterLineWidth: 1.25,
      laneCenterLineOpacity: 0.5,
    });

    expect(numberEntry('historyLimit').value(settings)).toBe(42);
    expect(numberEntry('mapCenterLng').value(settings)).toBe(116.4);
    expect(numberEntry('mapCenterLat').value(settings)).toBe(39.9);
    expect(numberEntry('mapZoom').value(settings)).toBe(18);
    expect(booleanEntry('gridEnabled').value(settings)).toBe(true);
    expect(booleanEntry('snapEnabled').value(settings)).toBe(false);
    expect(numberEntry('laneHalfWidth').value(settings)).toBe(1.75);
    expect(numberEntry('laneSpeedLimit').value(settings)).toBe(12.5);
    expect(selectEntry('laneBoundaryType').value(settings)).toBe('CURB');
    expect(numberEntry('snapRadius').value(settings)).toBe(9);
    expect(numberEntry('clickThreshold').value(settings)).toBe(4);
    expect(numberEntry('hitBboxPadding').value(settings)).toBe(6);
    expect(numberEntry('hitTestRadius').value(settings)).toBe(8);
    expect(numberEntry('laneArrowSize').value(settings)).toBe(14);
    expect(numberEntry('laneArrowSpacing').value(settings)).toBe(70);
    expect(numberEntry('laneArrowOpacity').value(settings)).toBe(0.7);
    expect(numberEntry('laneFillOpacity').value(settings)).toBe(0.3);
    expect(numberEntry('laneEdgeLineWidth').value(settings)).toBe(2);
    expect(numberEntry('laneEdgeLineOpacity').value(settings)).toBe(0.8);
    expect(numberEntry('laneCenterLineWidth').value(settings)).toBe(1.25);
    expect(numberEntry('laneCenterLineOpacity').value(settings)).toBe(0.5);
  });

  it('runs the reset layout action and reloads the page even if layout clearing throws', async () => {
    const dockviewLayout = await import('@/components/layout/WorkspaceLayout/dockviewLayout');
    vi.mocked(dockviewLayout.clearAllSavedLayouts).mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });

    const entry = entryById('resetWorkspaceLayout');
    if (entry.kind !== 'action') throw new Error('resetWorkspaceLayout is not an action entry');
    entry.run();

    expect(dockviewLayout.clearAllSavedLayouts).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });
});
