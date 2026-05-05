import { describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';
import { registerBuiltinSettingsTabs } from '../builtinSettingsTabs';
import {
  getSettingsTabs,
  type NumberSettingEntryDef,
  type SettingsStoreSnapshot,
} from '../settingsRegistry';

registerBuiltinSettingsTabs();

describe('settingsRegistry', () => {
  it('registers settings by vertical tab category', () => {
    const tabs = getSettingsTabs();
    expect(tabs.map((tab) => tab.id)).toEqual(['general', 'map', 'editing', 'rendering']);
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

  it('formats and commits lane speed limit with one km/h conversion', () => {
    const entry = getSettingsTabs()
      .flatMap((tab) => tab.sections)
      .flatMap((section) => section.entries)
      .find(
        (candidate): candidate is NumberSettingEntryDef =>
          candidate.kind === 'number' && candidate.id === 'laneSpeedLimit',
      );
    const settings: SettingsStoreSnapshot = {
      ...useSettingsStore.getState(),
      laneSpeedLimit: 60 / 3.6,
      setLaneSpeedLimit: vi.fn(),
    };

    if (!entry) throw new Error('laneSpeedLimit setting entry not found');

    expect(entry.format?.(entry.value(settings))).toBe('60');

    entry.commit(settings, 90);
    expect(settings.setLaneSpeedLimit).toHaveBeenCalledWith(90 / 3.6);
  });
});
