import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicenseState } from '@/lib/license-bridge';
import { useLicenseStore } from '@/store/licenseStore';
import { useMapStore } from '@/store/mapStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';
import type { Curve, LaneEntity, RoadEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity, PolylineEntity } from '@/types/entities';
import { SearchPanel } from '../SearchPanel';
import { ToolboxPanel } from '../ToolboxPanel';

const sidebarMock = vi.hoisted(() => ({
  state: {
    activeTab: 'search',
    setActiveTab: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
  },
}));

vi.mock('@/context/SidebarContext', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
  useSidebar: () => sidebarMock.state,
}));

const editableLicenseState: LicenseState = {
  status: 'trial',
  canEdit: true,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 7,
  hoursRemaining: 7 * 24,
  license: null,
  checkedAt: 0,
  reason: '',
};

const readOnlyLicenseState: LicenseState = {
  ...editableLicenseState,
  status: 'expired_trial',
  canEdit: false,
  daysRemaining: 0,
  hoursRemaining: 0,
  reason: 'trial expired',
};

const P0: GeoPoint = { x: 116.1, y: 39.1 };
const P1: GeoPoint = { x: 116.2, y: 39.2 };
const P2: GeoPoint = { x: 116.3, y: 39.3 };
const P3: GeoPoint = { x: 116.4, y: 39.4 };

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function resetStores() {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useTaskProgressStore.setState({ activeTask: null });
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: () => {},
  });
  sidebarMock.state.searchQuery = '';
  sidebarMock.state.setActiveTab.mockReset();
  sidebarMock.state.setSearchQuery.mockReset();
}

beforeEach(() => {
  resetStores();
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

function curve(points: GeoPoint[]): Curve {
  return { segments: [{ lineSegment: { points } }] };
}

function lane(id: string, centerPoints: GeoPoint[] = [P0, P1, P2]): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: curve(centerPoints),
    leftBoundary: { curve: curve([P0, P1]), length: 10, boundaryType: [] },
    rightBoundary: { curve: curve([P2, P3]), length: 10, boundaryType: [] },
    length: 10,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 13.89,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function road(id: string): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [
      {
        id: `${id}-section`,
        laneIds: [],
        boundary: {
          outerPolygon: {
            edges: [{ type: 'NORMAL', curve: curve([P0, P1, P2, P3]) }],
          },
          holes: [
            {
              edges: [{ type: 'NORMAL', curve: curve([P1, P2]) }],
            },
          ],
        },
      },
    ],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function polyline(id: string): PolylineEntity {
  return { id, entityType: 'polyline', points: [P0, P1, P2] };
}

function setEntities(entities: MapEntity[]) {
  useMapStore.setState({
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  });
}

function setReadOnlyLicense() {
  useLicenseStore.setState({
    state: readOnlyLicenseState,
    initialized: true,
    promptActivation: () => {},
  });
}

function expectMetric(html: string, label: string, value: string) {
  expect(html).toMatch(new RegExp(`${label}</div><div[^>]*>${value}</div>`));
}

function expectToolboxActions(html: string) {
  expect(html).toContain('应用下采样');
  expect(html).toContain('重算派生字段');
  expect(html).toContain('重算 Overlap');
}

describe('ToolboxPanel SSR rendering', () => {
  it('renders empty map metrics and editable action controls', () => {
    const html = render(<ToolboxPanel />);

    expect(html).toContain('工具箱');
    expectMetric(html, '实体', '0');
    expectMetric(html, '曲线', '0');
    expectMetric(html, '点数', '0');
    expectToolboxActions(html);
    expect(html.match(/<button/g) ?? []).toHaveLength(3);
    expect(html).not.toContain('disabled=""');
  });

  it('renders populated geometry metrics while ignoring non-road drawing entities', () => {
    setEntities([lane('lane-main'), road('road-main'), polyline('draft-polyline')]);

    const html = render(<ToolboxPanel />);

    expectMetric(html, '实体', '2');
    expectMetric(html, '曲线', '5');
    expectMetric(html, '点数', '13');
    expectToolboxActions(html);
  });

  it('keeps toolbox actions visible in read-only store state', () => {
    setReadOnlyLicense();

    const html = render(<ToolboxPanel />);

    expect(useLicenseStore.getState().state.canEdit).toBe(false);
    expectToolboxActions(html);
    expectMetric(html, '实体', '0');
  });
});

describe('SearchPanel SSR rendering', () => {
  it('renders matching entities and selected result state', () => {
    const longLaneId = 'lane-with-a-very-long-stable-identifier-1234567890';
    sidebarMock.state.searchQuery = 'lane';
    setEntities([lane(longLaneId), lane('lane-short'), road('road-main')]);

    const html = render(<SearchPanel selectedId={longLaneId} />);

    expect(html).toContain('value="lane"');
    expect(html).toContain('2 matches');
    expect(html).toContain(`title="${longLaneId}"`);
    expect(html).toContain(`…${longLaneId.slice(-18)}`);
    expect(html).toContain('lane-short');
    expect(html).toContain('bg-cyan-500/15');
  });

  it('renders no-match state for a populated map query with no results', () => {
    sidebarMock.state.searchQuery = 'traffic-light';
    setEntities([lane('lane-main'), road('road-main')]);

    const html = render(<SearchPanel selectedId="lane-main" />);

    expect(html).toContain('value="traffic-light"');
    expect(html).toContain('0 matches');
    expect(html).toContain('No matches');
    expect(html).not.toContain('bg-cyan-500/15');
  });
});
