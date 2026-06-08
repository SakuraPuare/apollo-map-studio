import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ActorRefFrom } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorProvider } from '@/context/EditorContext';
import type { EditorContext, editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { useScenarioStore } from '@/store/scenarioStore';
import { useUIStore } from '@/store/uiStore';
import type { LaneEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';
import {
  InspectorPanelContent,
  MapPanelContent,
  OverlayFallback,
  TimelinePanelContent,
  ToolboxPanelContent,
  makeSidebarPanel,
} from '../lazyPanels';

const P0: GeoPoint = { x: 116.1, y: 39.1 };
const P1: GeoPoint = { x: 116.2, y: 39.2 };
const curve = { segments: [{ lineSegment: { points: [P0, P1] } }] };
const initialUIState = useUIStore.getState();
const initialScenarioState = useScenarioStore.getState();
let selectedEntityIdForSelector: string | null = null;

vi.mock('@xstate/react', () => ({
  useSelector: (_actor: unknown, selector: (snapshot: { context: EditorContext }) => unknown) =>
    selector({
      context: {
        drawPoints: [],
        previewPoint: null,
        bezierAnchors: [],
        isDraggingHandle: false,
        selectedEntityId: selectedEntityIdForSelector,
        dragPointIndex: -1,
        dragPointType: 'vertex',
        dragCurrentPoint: null,
        dragAltKey: false,
        activeElement: null,
      },
    }),
}));

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function makeActor(selectedEntityId: string | null = null): ActorRefFrom<typeof editorMachine> {
  selectedEntityIdForSelector = selectedEntityId;
  return {} as ActorRefFrom<typeof editorMachine>;
}

function renderWithEditor(node: React.ReactNode, selectedEntityId: string | null = null) {
  return renderToStaticMarkup(
    <EditorProvider actorRef={makeActor(selectedEntityId)}>{node}</EditorProvider>,
  );
}

function lane(id: string): LaneEntity {
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

function resetStores() {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUIState, true);
  useScenarioStore.setState(initialScenarioState, true);
}

beforeEach(() => {
  resetStores();
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

describe('WorkspaceLayout lazy panel SSR wrappers', () => {
  it('renders overlay and lazy panel fallbacks', () => {
    expect(renderToStaticMarkup(<OverlayFallback label="Loading overlay..." />)).toContain(
      'Loading overlay...',
    );
    expect(renderWithEditor(<MapPanelContent />)).toContain('Loading map...');
    expect(renderToStaticMarkup(createElement(makeSidebarPanel(vi.fn())))).toContain(
      'Loading sidebar...',
    );
    expect(renderToStaticMarkup(<TimelinePanelContent />)).toContain('Loading timeline...');
    expect(renderToStaticMarkup(<ToolboxPanelContent />)).toContain('Loading toolbox...');
  });

  it('renders the empty map inspector when no entity is selected', () => {
    useUIStore.setState({ appMode: 'drawing' });

    const html = renderWithEditor(<InspectorPanelContent />);

    expect(html).toContain('Select an entity to view properties');
  });

  it('renders selected map entity heading and lazy form fallback', () => {
    const entity = lane('lane-with-long-stable-id-000001');
    useMapStore.setState({
      entities: new Map<string, MapEntity>([[entity.id, entity]]),
    });
    useUIStore.setState({ appMode: 'drawing' });

    const html = renderWithEditor(<InspectorPanelContent />, entity.id);

    expect(html).toContain('Lane');
    expect(html).toContain('...le-id-000001');
    expect(html).toContain('Loading inspector...');
  });

  it('renders the empty scene inspector until a scene object is selected', () => {
    useUIStore.setState({ appMode: 'scene' });
    useScenarioStore.setState({
      loaded: [],
      activeKey: null,
      selectedKind: null,
      selectedObstacleUid: null,
      selectedTrafficLightUid: null,
    });

    const html = renderWithEditor(<InspectorPanelContent />);

    expect(html).toContain('选择障碍物 / 红绿灯 / 主车以查看属性');
  });
});
