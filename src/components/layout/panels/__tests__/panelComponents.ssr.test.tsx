import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import { SidebarProvider } from '@/context/SidebarContext';
import { useApolloMapStore } from '@/store/apolloMapStore';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { LaneEntity, RoadEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';
import { LayerTree } from '../LayerTree';
import { MapOutline } from '../MapOutline';
import { SearchPanel } from '../SearchPanel';
import { SettingsPanel } from '../SettingsPanel';
import { ToolboxPanel } from '../ToolboxPanel';

registerBuiltinWorkspaceContributions();

const initialUIState = useUIStore.getState();

const P0: GeoPoint = { x: 116.1, y: 39.1 };
const P1: GeoPoint = { x: 116.2, y: 39.2 };

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function lane(id: string): LaneEntity {
  const curve = { segments: [{ lineSegment: { points: [P0, P1] } }] };
  return {
    id,
    entityType: 'lane',
    centralCurve: curve,
    leftBoundary: { curve, length: 10, boundaryType: [] },
    rightBoundary: { curve, length: 10, boundaryType: [] },
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

function road(id: string, laneIds: string[] = []): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [{ id: `${id}-section`, laneIds }],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function drawing(id: string): MapEntity {
  return { id, entityType: 'polyline', points: [P0, P1] };
}

function resetStores() {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useApolloMapStore.getState().clear();
  useUIStore.setState(initialUIState, true);
}

beforeEach(() => {
  resetStores();
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

describe('panel SSR smoke coverage', () => {
  it('renders the settings modal with registered number, boolean, select, and action entries', () => {
    expect(render(<SettingsPanel open={false} onClose={() => {}} />)).toBe('');

    const html = render(<SettingsPanel open onClose={() => {}} />);

    expect(html).toContain('Settings');
    expect(html).toContain('General');
    expect(html).toContain('Map');
    expect(html).toContain('Editing');
    expect(html).toContain('Rendering');
    expect(html).toContain('History limit');
    expect(html).toContain('Undo History');
    expect(html).toContain('Layout');
    expect(html).toContain('Reset Layout to Default');
  });

  it('renders map outline empty state and imported metadata', () => {
    expect(render(<MapOutline />)).toContain('当前地图还没有实体');

    useMapStore.setState({
      entities: new Map<string, MapEntity>([
        ['road-1', road('road-1', ['lane-1'])],
        ['lane-1', lane('lane-1')],
        ['lane-unparented', lane('lane-unparented')],
        ['draft-1', drawing('draft-1')],
      ]),
    });
    useApolloMapStore.getState().setImported(
      {
        filename: 'apollo_map.bin',
        counts: { road: 1, lane: 2 },
        projString: '+proj=tmerc',
        importedAt: 1_700_000_000_000,
      },
      null,
      {
        version: 'v1',
        district: 'test-district',
        vendor: 'Apollo',
        projection: { proj: '+proj=tmerc' },
      },
    );

    const html = render(<MapOutline />);

    expect(html).toContain('路网结构');
    expect(html).toContain('道路');
    expect(html).toContain('车道');
    expect(html).toContain('临时绘制对象');
    expect(html).toContain('未归属车道');
    expect(html).toContain('apollo_map.bin');
    expect(html).toContain('test-district');
  });

  it('renders toolbox metrics and tool controls from map geometry stats', () => {
    useMapStore.setState({
      entities: new Map<string, MapEntity>([['lane-1', lane('lane-1')]]),
    });

    const html = render(<ToolboxPanel />);

    expect(html).toContain('工具箱');
    expect(html).toContain('实体');
    expect(html).toContain('曲线');
    expect(html).toContain('点数');
    expect(html).toContain('应用下采样');
    expect(html).toContain('重算派生字段');
    expect(html).toContain('重算 Overlap');
  });

  it('renders search panel and layer tree empty states through their providers', () => {
    const searchHtml = render(
      <SidebarProvider>
        <SearchPanel />
      </SidebarProvider>,
    );

    expect(searchHtml).toContain('Search entities by id or type');
    expect(searchHtml).toContain('Type to search');
    expect(searchHtml).toContain('Search across all entity ids and types.');

    const layerTreeHtml = render(<LayerTree />);

    expect(layerTreeHtml).toContain('Road');
    expect(layerTreeHtml).toContain('RSU');
    expect(layerTreeHtml).toContain('No entities yet. Start drawing!');
  });
});
