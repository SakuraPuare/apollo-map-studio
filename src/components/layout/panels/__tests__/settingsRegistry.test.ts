import { describe, expect, it } from 'vitest';
import { registerBuiltinSettingsTabs } from '../builtinSettingsTabs';
import { getSettingsTabs } from '../settingsRegistry';

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
});
