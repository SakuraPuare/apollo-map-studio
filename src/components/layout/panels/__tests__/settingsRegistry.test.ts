import { describe, expect, it } from 'vitest';
import { getSettingsTabs } from '../settingsRegistry';

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
        'laneHalfWidth',
        'laneArrowSpacing',
      ]),
    );
  });
});
