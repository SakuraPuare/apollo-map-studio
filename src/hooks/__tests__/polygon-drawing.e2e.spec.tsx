import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NodeApi, NodeRendererProps } from 'react-arborist';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { getSourceRect, type ApolloEntity } from '@/types/apollo';
import { entityCounts } from '@/io/proto/adapter';
import { entitiesToApolloMap } from '@/io/proto/entityBridge';
import { InspectorPanelContent } from '@/components/layout/WorkspaceLayout/lazyPanels';
import { LayerTree } from '@/components/layout/panels/LayerTree';
import { Node as LayerTreeNode } from '@/components/layout/panels/LayerTree/Node';
import { buildTree } from '@/components/layout/panels/LayerTree/treeBuilder';
import type { TreeNode } from '@/components/layout/panels/LayerTree/types';
import { MapOutline } from '@/components/layout/panels/MapOutline';
import { StatusBar } from '@/components/layout/StatusBar';
import { EditorProvider } from '@/context/EditorContext';
import { editorMachine, type DrawTool } from '@/core/fsm/editorMachine';
import { createBlankApolloMap } from '@/io/proto/blankApolloMap';
import { UTM_PRESETS } from '@/io/proto/projection';
import { resetSharedSpatialIndex } from '@/core/elements/overlap';
import { useApolloMapStore } from '@/store/apolloMapStore';
import { useLicenseStore } from '@/store/licenseStore';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { LicenseState } from '@/lib/license-bridge';
import type { MapEntity } from '@/types/entities';
import { installDrawCommitSubscription } from '../useDrawCommit';

const initialUIState = useUIStore.getState();

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

type PolygonElementCase = {
  element: 'junction' | 'pncJunction' | 'parkingSpace' | 'crosswalk' | 'clearArea' | 'area';
  label: string;
  pluralLabel: string;
  outlineSection: string;
  outlineLabel: string;
  protoField: string;
  expectedId: string;
  inspectorTitle: string;
  extraInspectorText: readonly string[];
};

type PolygonElementType = PolygonElementCase['element'];
type PolygonApolloEntity = Extract<ApolloEntity, { entityType: PolygonElementType }>;

const POLYGON_ELEMENTS: readonly PolygonElementCase[] = [
  {
    element: 'junction',
    label: '路口',
    pluralLabel: 'Junctions',
    outlineSection: '路网结构',
    outlineLabel: '路口',
    protoField: 'junction',
    expectedId: 'J_1',
    inspectorTitle: 'Junction',
    extraInspectorText: ['Type', 'Crossroad'],
  },
  {
    element: 'pncJunction',
    label: 'PNC 路口',
    pluralLabel: 'PNC Junctions',
    outlineSection: '区域与设施',
    outlineLabel: 'PNC 路口',
    protoField: 'pnc_junction',
    expectedId: 'PNCJ_1',
    inspectorTitle: 'PncJunction',
    extraInspectorText: ['Passage Groups', 'no groups yet', '+ Passage Group'],
  },
  {
    element: 'parkingSpace',
    label: '车位',
    pluralLabel: 'Parking Spaces',
    outlineSection: '区域与设施',
    outlineLabel: '车位',
    protoField: 'parking_space',
    expectedId: 'parkingspace_1',
    inspectorTitle: 'ParkingSpace',
    extraInspectorText: ['Heading (°)', 'type="number"', 'name="heading"'],
  },
  {
    element: 'crosswalk',
    label: '人行横道',
    pluralLabel: 'Crosswalks',
    outlineSection: '区域与设施',
    outlineLabel: '人行横道',
    protoField: 'crosswalk',
    expectedId: 'CW_1',
    inspectorTitle: 'Crosswalk',
    extraInspectorText: ['Vertices'],
  },
  {
    element: 'clearArea',
    label: '禁停区',
    pluralLabel: 'Clear Areas',
    outlineSection: '区域与设施',
    outlineLabel: '禁停区',
    protoField: 'clear_area',
    expectedId: 'cleararea_1',
    inspectorTitle: 'ClearArea',
    extraInspectorText: ['Vertices'],
  },
  {
    element: 'area',
    label: '区域',
    pluralLabel: 'Areas',
    outlineSection: '区域与设施',
    outlineLabel: '区域',
    protoField: 'ad_area',
    expectedId: 'area_1',
    inspectorTitle: 'Area',
    extraInspectorText: ['Type', 'Driveable', 'Name'],
  },
] as const;

const DRAW_CASES: readonly {
  tool: Extract<DrawTool, 'drawRotatedRect' | 'drawPolygon'>;
  expectedVertices: number;
  hasSourceRect: boolean;
  statusMode: string;
}[] = [
  {
    tool: 'drawRotatedRect',
    expectedVertices: 5,
    hasSourceRect: true,
    statusMode: 'drawRotatedRect',
  },
  {
    tool: 'drawPolygon',
    expectedVertices: 4,
    hasSourceRect: false,
    statusMode: 'drawPolygon',
  },
];

const POLYGON_PROTO_FIELDS = [
  'junction',
  'pnc_junction',
  'parking_space',
  'crosswalk',
  'clear_area',
  'ad_area',
] as const;

const LINE_PROTO_FIELDS = [
  'lane',
  'signal',
  'stop_sign',
  'speed_bump',
  'yield',
  'barrier_gate',
] as const;

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

async function settleLazyRender() {
  await import('@/components/layout/panels/InspectorForms');
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  useApolloMapStore.getState().clear();
  useUIStore.setState(initialUIState, true);
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: vi.fn(),
  });
  resetSharedSpatialIndex();
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetStores();
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

function drawEntity(testCase: PolygonElementCase, tool: DrawTool): PolygonApolloEntity {
  const actor = createActor(editorMachine).start();
  const cleanup = installDrawCommitSubscription(actor);
  try {
    actor.send({ type: 'SELECT_TOOL', tool, element: testCase.element });
    if (tool === 'drawRotatedRect') {
      actor.send({ type: 'MOUSE_DOWN', point: [-122.025, 37.37] });
      actor.send({ type: 'MOUSE_DOWN', point: [-122.0245, 37.3702] });
      actor.send({ type: 'MOUSE_DOWN', point: [-122.0247, 37.37055] });
    } else {
      actor.send({ type: 'MOUSE_DOWN', point: [-122.025, 37.37] });
      actor.send({ type: 'MOUSE_DOWN', point: [-122.0245, 37.37] });
      actor.send({ type: 'MOUSE_DOWN', point: [-122.02445, 37.37035] });
      actor.send({ type: 'MOUSE_DOWN', point: [-122.02505, 37.37045] });
      actor.send({ type: 'CONFIRM' });
    }

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('idle');
    expect(snapshot.context.activeElement).toBeNull();
    expect(snapshot.context.drawPoints).toEqual([]);
  } finally {
    cleanup();
    actor.stop();
  }

  const entities = Array.from(useMapStore.getState().entities.values());
  expect(entities).toHaveLength(1);
  expect(entities[0]?.entityType).toBe(testCase.element);
  return entities[0] as PolygonApolloEntity;
}

function selectWithEditorMachine(entity: MapEntity) {
  const actor = createActor(editorMachine).start();
  try {
    actor.send({ type: 'SELECT_ENTITY', id: entity.id });
    expect(actor.getSnapshot().value).toBe('selected');
    expect(actor.getSnapshot().context.selectedEntityId).toBe(entity.id);
  } finally {
    actor.stop();
  }
}

async function renderInspectorPanel(entity: PolygonApolloEntity) {
  const actor = createActor(editorMachine).start();
  useUIStore.setState({ appMode: 'drawing' });
  try {
    actor.send({ type: 'SELECT_ENTITY', id: entity.id });
    expect(actor.getSnapshot().value).toBe('selected');
    expect(actor.getSnapshot().context.selectedEntityId).toBe(entity.id);

    const panel = (
      <EditorProvider actorRef={actor}>
        <InspectorPanelContent />
      </EditorProvider>
    );
    render(panel);
    await settleLazyRender();
    return render(panel);
  } finally {
    actor.stop();
  }
}

function findNode(nodes: readonly TreeNode[] | undefined, id: string): TreeNode {
  const node = nodes?.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`missing tree node ${id}`);
  return node;
}

type LayerTreeNodeFake = Pick<
  NodeApi<TreeNode>,
  'data' | 'isInternal' | 'isOpen' | 'isSelected' | 'willReceiveDrop' | 'select' | 'toggle'
>;

function renderLayerTreeNode(
  data: TreeNode,
  options: { internal?: boolean; open?: boolean; selected?: boolean } = {},
) {
  const node: LayerTreeNodeFake = {
    data,
    isInternal: options.internal ?? Boolean(data.children),
    isOpen: options.open ?? false,
    isSelected: options.selected ?? false,
    willReceiveDrop: false,
    select: vi.fn(),
    toggle: vi.fn(),
  };
  const props: NodeRendererProps<TreeNode> = {
    style: { paddingLeft: 4 },
    tree: {} as NodeRendererProps<TreeNode>['tree'],
    dragHandle: vi.fn(),
    node: node as NodeRendererProps<TreeNode>['node'],
  };
  return render(<LayerTreeNode {...props} />);
}

function assertLayerTree(entity: PolygonApolloEntity, testCase: PolygonElementCase) {
  const tree = buildTree(useMapStore.getState().entities);
  const group = findNode(tree, `group:${testCase.element}`);
  expect(group.name).toBe(testCase.pluralLabel);
  expect(group.children).toHaveLength(1);
  expect(group.children?.[0]).toMatchObject({
    id: `entity:${entity.id}`,
    name: entity.id,
    kind: 'entity',
    entityType: testCase.element,
    entityId: entity.id,
  });

  const panelHtml = render(<LayerTree selectedId={entity.id} />);
  expect(panelHtml).toContain('data-testid="layer-tree"');
  expect(panelHtml).toContain('新建 Road');
  expect(panelHtml).toContain('新建 RSU');
  expect(panelHtml).toContain('min-h-0 flex-1');
  expect(panelHtml).not.toContain('No entities yet. Start drawing!');

  const groupHtml = renderLayerTreeNode(group, { internal: true, open: true });
  expect(groupHtml).toContain(`layer-tree-node-group-${testCase.element}`);
  expect(groupHtml).toContain(testCase.pluralLabel);
  expect(groupHtml).toContain('>1</span>');

  const entityNode = group.children?.[0];
  expect(entityNode).toBeDefined();
  const entityHtml = renderLayerTreeNode(entityNode!, { selected: true });
  expect(entityHtml).toContain(`data-entity-id="${entity.id}"`);
  expect(entityHtml).toContain(`data-entity-type="${testCase.element}"`);
  expect(entityHtml).toContain(entity.id);
  expect(entityHtml).toContain('bg-cyan-500/15');
}

async function assertInspector(
  entity: PolygonApolloEntity,
  testCase: PolygonElementCase,
  vertices: number,
) {
  const inspectorHtml = await renderInspectorPanel(entity);
  expect(inspectorHtml).toContain('workspace-panel-inspector');
  expect(inspectorHtml).toContain('inspector-panel');
  expect(inspectorHtml).toContain('inspector-title');
  expect(inspectorHtml).toContain('inspector-entity-id');
  expect(inspectorHtml).toContain(testCase.inspectorTitle);
  expect(inspectorHtml).toContain(entity.id);
  expect(inspectorHtml).toContain('Attributes');
  expect(inspectorHtml).toContain('ID');
  expect(inspectorHtml).toContain('Overlaps');
  expect(inspectorHtml).toContain('—');
  expect(entity.polygon.points).toHaveLength(vertices);
  if (
    testCase.element !== 'junction' &&
    testCase.element !== 'parkingSpace' &&
    testCase.element !== 'area'
  ) {
    expect(inspectorHtml).toContain('Vertices');
    expect(inspectorHtml).toContain(`>${vertices}</span>`);
  }
  for (const text of testCase.extraInspectorText) {
    expect(inspectorHtml).toContain(text);
  }
}

function assertEntityDefaults(entity: PolygonApolloEntity) {
  expect(entity.overlapIds).toEqual([]);

  switch (entity.entityType) {
    case 'junction':
      expect(entity.type).toBe('CROSS_ROAD');
      return;
    case 'pncJunction':
      expect(entity.passageGroups).toEqual([]);
      return;
    case 'parkingSpace': {
      const sourceRect = getSourceRect(entity);
      if (sourceRect) {
        expect(Math.abs(sourceRect.rotation)).toBeGreaterThan(0.001);
        expect(entity.heading).toBeCloseTo(sourceRect.rotation, 12);
      } else {
        expect(entity.heading).toBe(0);
      }
      return;
    }
    case 'area':
      expect(entity.type).toBe('Driveable');
      expect(entity.name).toBeUndefined();
      return;
    case 'crosswalk':
    case 'clearArea':
      return;
  }
}

function assertOutlineAndStatus(testCase: PolygonElementCase) {
  const statsHtml = render(<MapOutline />);
  expectLabeledValue(statsHtml, '地图', 1);
  expectLabeledValue(statsHtml, '草图', 0);
  expectLabeledValue(statsHtml, '检查', 0);
  expect(statsHtml).toContain(testCase.outlineSection);
  expectLabeledValue(statsHtml, testCase.outlineLabel, 1);
  expect(statsHtml).toContain('结构检查');
  expect(statsHtml).toContain('正常');

  const statusHtml = render(
    <StatusBar mode="selected" entityCount={useMapStore.getState().entities.size} />,
  );
  expect(statusHtml).toContain('Selected');
  expect(statusHtml).toContain('Entities:');
  expect(statusHtml).toContain('>1</span>');
}

function expectLabeledValue(html: string, label: string, value: number) {
  const labelIndex = html.indexOf(`>${label}<`);
  expect(labelIndex).toBeGreaterThanOrEqual(0);
  const valueIndex = html.indexOf(`>${value}</`, labelIndex);
  expect(valueIndex).toBeGreaterThan(labelIndex);
}

function assertProtoCount(
  entity: PolygonApolloEntity,
  testCase: PolygonElementCase,
  expectedVertices: number,
) {
  const apolloMap = entitiesToApolloMap(createBlankApolloMap(UTM_PRESETS.sunnyvale), [entity]);
  const raw = apolloMap[testCase.protoField] as
    | Array<{
        id?: { id?: string };
        polygon?: { point?: unknown[] };
        overlap_id?: unknown[];
        type?: number;
        passage_group?: unknown[];
        heading?: number;
        name?: string;
      }>
    | undefined;

  expect(raw).toHaveLength(1);
  const rawEntity = raw?.[0];
  expect(rawEntity?.id?.id).toBe(entity.id);
  expect(rawEntity?.polygon?.point).toHaveLength(expectedVertices);
  expect(rawEntity?.overlap_id).toEqual([]);
  switch (entity.entityType) {
    case 'junction':
      expect(rawEntity?.type).toBe(2);
      break;
    case 'pncJunction':
      expect(rawEntity?.passage_group).toEqual([]);
      break;
    case 'parkingSpace':
      expect(rawEntity?.heading).toBeCloseTo(entity.heading, 12);
      break;
    case 'area':
      expect(rawEntity?.type).toBe(1);
      expect(rawEntity).not.toHaveProperty('name');
      break;
    case 'crosswalk':
    case 'clearArea':
      break;
  }
  expect(entityCounts(apolloMap)[testCase.protoField]).toBe(1);

  for (const field of POLYGON_PROTO_FIELDS) {
    if (field === testCase.protoField) continue;
    expect(entityCounts(apolloMap)[field] ?? 0).toBe(0);
  }
  for (const field of LINE_PROTO_FIELDS) {
    expect(entityCounts(apolloMap)[field] ?? 0).toBe(0);
  }
}

describe('Polygon Drawing E2E', () => {
  it.each(POLYGON_ELEMENTS.flatMap((element) => DRAW_CASES.map((draw) => ({ element, draw }))))(
    'draws, commits, selects, inspects, outlines, layers, and counts $element.element with $draw.tool',
    async ({ element, draw }) => {
      const preDrawStatus = render(<StatusBar mode={draw.statusMode} entityCount={0} />);
      expect(preDrawStatus).toContain(
        draw.tool === 'drawRotatedRect' ? 'Draw: Rectangle' : 'Draw: Polygon',
      );
      expect(preDrawStatus).toContain('Entities:');
      expect(preDrawStatus).toContain('>0</span>');

      const entity = drawEntity(element, draw.tool);

      expect(entity.id).toBe(element.expectedId);
      expect(entity.polygon.points).toHaveLength(draw.expectedVertices);
      expect(Boolean(getSourceRect(entity))).toBe(draw.hasSourceRect);
      assertEntityDefaults(entity);

      selectWithEditorMachine(entity);
      await assertInspector(entity, element, draw.expectedVertices);
      assertLayerTree(entity, element);
      assertOutlineAndStatus(element);
      assertProtoCount(entity, element, draw.expectedVertices);
    },
  );
});
