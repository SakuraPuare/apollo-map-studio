import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaGear } from 'react-icons/fa6';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';
import { SettingsPanel } from '../SettingsPanel';
import {
  getSettingsTabs,
  registerSettingsTab,
  type SettingsStoreSnapshot,
  type SettingsTabDef,
} from '../settingsRegistry';

const initialSettingsState = useSettingsStore.getState();
const builtinGeneralTab = getRequiredTab('general');

function getRequiredTab(id: string): SettingsTabDef {
  const tab = getSettingsTabs().find((candidate) => candidate.id === id);
  if (!tab) throw new Error(`settings tab not found: ${id}`);
  return tab;
}

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function registerSsrTab() {
  registerSettingsTab({
    id: 'general',
    label: 'SSR Settings',
    icon: FaGear,
    sections: [
      {
        id: 'primary',
        title: 'SSR Primary',
        note: 'SSR note',
        entries: [
          {
            kind: 'number',
            id: 'formattedNumber',
            label: 'Formatted Number',
            min: -5,
            max: 50,
            step: 0.5,
            value: (settings: SettingsStoreSnapshot) => settings.historyLimit,
            commit: () => {},
            format: (value: number) => value.toFixed(1),
            rangeLabel: 'Custom number range',
          },
          {
            kind: 'boolean',
            id: 'customBoolean',
            label: 'Custom Boolean',
            value: (settings: SettingsStoreSnapshot) => settings.gridEnabled,
            commit: () => {},
          },
          {
            kind: 'select',
            id: 'customSelect',
            label: 'Custom Select',
            options: [
              { value: 'SOLID_WHITE', label: 'Solid White' },
              { value: 'DOTTED_YELLOW', label: 'Dotted Yellow' },
            ],
            value: (settings: SettingsStoreSnapshot) => settings.laneBoundaryType,
            commit: () => {},
          },
        ],
      },
      {
        id: 'actions',
        title: 'SSR Actions',
        entries: [
          {
            kind: 'action',
            id: 'dangerAction',
            label: 'Danger Action',
            tone: 'danger',
            run: () => {},
          },
        ],
      },
    ],
  });
}

beforeEach(() => {
  registerSettingsTab(builtinGeneralTab);
  useSettingsStore.setState(initialSettingsState, true);
  useSettingsStore.setState({
    historyLimit: 37,
    gridEnabled: true,
    laneBoundaryType: 'DOTTED_YELLOW',
  });
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  registerSettingsTab(builtinGeneralTab);
  useSettingsStore.setState(initialSettingsState, true);
});

describe('SettingsPanel SSR registry rendering', () => {
  it('renders alternate registry sections and number, boolean, select, and action controls', () => {
    expect(render(<SettingsPanel open={false} onClose={() => {}} />)).toBe('');

    registerSsrTab();

    const html = render(<SettingsPanel open onClose={() => {}} />);

    expect(html).toContain('SSR Settings');
    expect(html).toContain('SSR Primary');
    expect(html).toContain('SSR note');
    expect(html).toContain('SSR Actions');
    expect(html).not.toContain('Undo History');

    expect(html).toContain('Formatted Number');
    expect(html).toContain('value="37.0"');
    expect(html).toContain('min="-5"');
    expect(html).toContain('max="50"');
    expect(html).toContain('step="0.5"');
    expect(html).toContain('Custom number range');

    expect(html).toContain('Custom Boolean');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');

    expect(html).toContain('Custom Select');
    expect(html).toContain('Solid White');
    expect(html).toContain('Dotted Yellow');
    expect(html).toMatch(/<select[^>]*id="setting-customSelect"/);

    expect(html).toContain('Danger Action');
    expect(html).toContain('border-red-400/20');
  });
});
