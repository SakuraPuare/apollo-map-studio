import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NodeApi, NodeRendererProps } from 'react-arborist';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { Curve, JunctionEntity, LaneEntity, RoadEntity, RSUEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity, PolylineEntity } from '@/types/entities';
import {
  createLayerTreeRoad,
  createLayerTreeRSU,
  layerTreeDisableDrag,
  layerTreeDisableDrop,
  LayerTree,
  moveLayerTreeEntity,
  selectLayerTreeNode,
} from '../LayerTree';
import {
  deleteLayerTreeEntity,
  detachLayerTreeEntity,
  Node,
  selectOrToggleLayerTreeNode,
  toggleLayerTreeGroupLocked,
  toggleLayerTreeGroupVisible,
} from '../LayerTree/Node';
import { buildTree } from '../LayerTree/treeBuilder';
import type { TreeNode } from '../LayerTree/types';

const initialUIState = useUIStore.getState();

const P0: GeoPoint = { x: 116.1, y: 39.1 };
const P1: GeoPoint = { x: 116.2, y: 39.2 };
const LINE: Curve = { segments: [{ lineSegment: { points: [P0, P1] } }] };

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
  vi.spyOn(React, 'useDebugValue').mockImplementation(() => undefined);
}

function resetStores() {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
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

function lane(id: string, junctionId: string | null = null): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: LINE,
    leftBoundary: { curve: LINE, length: 10, boundaryType: [] },
    rightBoundary: { curve: LINE, length: 10, boundaryType: [] },
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
    junctionId,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function road(id: string, laneIds: string[] = [], junctionId: string | null = null): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [
      { id: `${id}-section-a`, laneIds },
      { id: `${id}-section-b`, laneIds: [] },
    ],
    junctionId,
    type: 'CITY_ROAD',
  };
}

function junction(id: string): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: { points: [P0, P1] },
    overlapIds: [],
  };
}

function rsu(id: string, junctionId: string | null = null): RSUEntity {
  return { id, entityType: 'rsu', junctionId, overlapIds: [] };
}

function polyline(id: string): PolylineEntity {
  return { id, entityType: 'polyline', points: [P0, P1] };
}

interface RegistryUnknownEntity {
  id: string;
  entityType: 'experimental';
}

type TestEntity = MapEntity | RegistryUnknownEntity;

function mapOf(entities: TestEntity[]): Map<string, MapEntity> {
  return new Map(entities.map((entity) => [entity.id, entity])) as Map<string, MapEntity>;
}

function unknownEntity(id: string): RegistryUnknownEntity {
  return { id, entityType: 'experimental' };
}

function findNode(nodes: TreeNode[] | undefined, id: string): TreeNode {
  const node = nodes?.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`missing tree node ${id}`);
  return node;
}

function nodeApi(data: TreeNode): NodeApi<TreeNode> {
  return { data } as NodeApi<TreeNode>;
}

function entityTreeNode(entityId: string, entityType: string): TreeNode {
  return {
    id: `entity:${entityId}`,
    name: entityId,
    kind: 'entity',
    entityType,
    entityId,
    dropKind: 'none',
  };
}

function groupTreeNode(entityType: string): TreeNode {
  return {
    id: `group:${entityType}`,
    name: entityType,
    kind: 'group',
    entityType,
    dropKind: 'unparented',
    parentTarget: { kind: 'none' },
    children: [],
  };
}

function roadSectionTreeNode(roadId: string, sectionId: string): TreeNode {
  return {
    id: `section:${roadId}:${sectionId}`,
    name: `Section ${sectionId}`,
    kind: 'section',
    dropKind: 'roadSection',
    parentTarget: { kind: 'roadSection', roadId, sectionId },
    children: [],
  };
}

describe('LayerTree buildTree', () => {
  it('groups entities into junction, road section, and unparented drop targets', () => {
    const tree = buildTree(
      mapOf([
        road('road-main', ['lane-road'], 'junction-1'),
        road('road-free'),
        junction('junction-1'),
        lane('lane-junction', 'junction-1'),
        lane('lane-road'),
        lane('lane-free'),
        rsu('rsu-junction', 'junction-1'),
        rsu('rsu-free'),
        polyline('draft-line'),
      ]),
    );

    expect(tree.map((node) => node.id)).toEqual([
      'group:road',
      'group:junction',
      'group:lane',
      'group:rsu',
      'group:polyline',
    ]);

    const roads = findNode(tree, 'group:road');
    expect(roads).toMatchObject({
      name: 'Roads',
      dropKind: 'unparented',
      parentTarget: { kind: 'none' },
    });
    expect(roads.children?.map((node) => node.id)).toEqual(['entity:road-free']);

    const roadFree = findNode(roads.children, 'entity:road-free');
    expect(roadFree).toMatchObject({
      entityId: 'road-free',
      dropKind: 'road',
      parentTarget: { kind: 'road', id: 'road-free' },
    });

    const junctions = findNode(tree, 'group:junction');
    const junctionNode = findNode(junctions.children, 'entity:junction-1');
    expect(junctionNode).toMatchObject({
      dropKind: 'junction',
      parentTarget: { kind: 'junction', id: 'junction-1' },
    });
    expect(junctionNode.children?.map((node) => node.id)).toEqual([
      'entity:road-main',
      'entity:lane-junction',
      'entity:rsu-junction',
    ]);

    const roadMain = findNode(junctionNode.children, 'entity:road-main');
    expect(roadMain.children?.map((node) => node.id)).toEqual([
      'section:road-main:road-main-section-a',
      'section:road-main:road-main-section-b',
    ]);
    const section = findNode(roadMain.children, 'section:road-main:road-main-section-a');
    expect(section).toMatchObject({
      name: 'Section road-main-section-a',
      dropKind: 'roadSection',
      parentTarget: {
        kind: 'roadSection',
        roadId: 'road-main',
        sectionId: 'road-main-section-a',
      },
    });
    expect(section.children?.map((node) => node.id)).toEqual(['entity:lane-road']);

    const lanes = findNode(tree, 'group:lane');
    expect(lanes).toMatchObject({
      name: 'Lanes',
      dropKind: 'unparented',
      parentTarget: { kind: 'none' },
    });
    expect(lanes.children?.map((node) => node.id)).toEqual(['entity:lane-free']);

    const rsus = findNode(tree, 'group:rsu');
    expect(rsus.children?.map((node) => node.id)).toEqual(['entity:rsu-free']);
    expect(findNode(tree, 'group:polyline').children?.map((node) => node.id)).toEqual([
      'entity:draft-line',
    ]);
  });

  it('keeps the first road section assignment and appends registry-unknown groups', () => {
    const longLaneId = 'lane-with-a-very-long-stable-identifier-1234567890';
    const tree = buildTree(
      mapOf([
        road('road-a', [longLaneId]),
        road('road-b', [longLaneId]),
        lane(longLaneId),
        unknownEntity('experimental-1'),
      ]),
    );

    const roads = findNode(tree, 'group:road');
    const roadASection = findNode(
      findNode(roads.children, 'entity:road-a').children,
      'section:road-a:road-a-section-a',
    );
    const roadBSection = findNode(
      findNode(roads.children, 'entity:road-b').children,
      'section:road-b:road-b-section-a',
    );

    expect(roadASection.children?.map((node) => node.id)).toEqual([`entity:${longLaneId}`]);
    expect(roadBSection.children).toEqual([]);

    const laneNode = findNode(roadASection.children, `entity:${longLaneId}`);
    expect(laneNode.name.charCodeAt(0)).toBe(0x2026);
    expect(laneNode.name.endsWith(longLaneId.slice(-12))).toBe(true);

    const unknownGroup = tree.at(-1);
    expect(unknownGroup).toMatchObject({
      id: 'group:experimental',
      name: 'experimental',
      dropKind: 'none',
    });
  });
});

interface NodeOptions {
  internal?: boolean;
  open?: boolean;
  selected?: boolean;
  willReceiveDrop?: boolean;
}

type NodeFake = Pick<
  NodeApi<TreeNode>,
  'data' | 'isInternal' | 'isOpen' | 'isSelected' | 'willReceiveDrop' | 'select' | 'toggle'
>;

function renderNode(data: TreeNode, options: NodeOptions = {}) {
  const node: NodeFake = {
    data,
    isInternal: options.internal ?? Boolean(data.children),
    isOpen: options.open ?? false,
    isSelected: options.selected ?? false,
    willReceiveDrop: options.willReceiveDrop ?? false,
    select: vi.fn(),
    toggle: vi.fn(),
  };
  const props: NodeRendererProps<TreeNode> = {
    style: { paddingLeft: 4 },
    tree: {} as NodeRendererProps<TreeNode>['tree'],
    dragHandle: vi.fn(),
    node: node as NodeRendererProps<TreeNode>['node'],
  };
  return renderToStaticMarkup(<Node {...props} />);
}

describe('LayerTree Node SSR rendering', () => {
  it('renders hidden locked group state, open chevron, drop hint, actions, and child count', () => {
    useUIStore.getState().setLayerVisible('lane', false);
    useUIStore.getState().setLayerLocked('lane', true);

    const html = renderNode(
      {
        id: 'group:lane',
        name: 'Lanes',
        kind: 'group',
        entityType: 'lane',
        dropKind: 'unparented',
        parentTarget: { kind: 'none' },
        children: [
          { id: 'entity:lane-a', name: 'lane-a', kind: 'entity', dropKind: 'none' },
          { id: 'entity:lane-b', name: 'lane-b', kind: 'entity', dropKind: 'none' },
        ],
      },
      { internal: true, open: true, willReceiveDrop: true },
    );

    expect(html).toContain('Lanes');
    expect(html).toContain('opacity-50');
    expect(html).toContain('ring-1');
    expect(html).toContain('rotate-90');
    expect(html).toContain('title="Show layer"');
    expect(html).toContain('title="Unlock layer"');
    expect(html).toContain('>2</span>');
  });

  it('renders unlocked and locked entity actions from the owning layer state', () => {
    const entityNode: TreeNode = {
      id: 'entity:lane-action',
      name: 'lane-action',
      kind: 'entity',
      entityType: 'lane',
      entityId: 'lane-action',
      dropKind: 'none',
    };

    const unlockedHtml = renderNode(entityNode, { selected: true });
    expect(unlockedHtml).toContain('bg-cyan-500/15');
    expect(unlockedHtml).toContain('title="Detach from parent"');
    expect(unlockedHtml).toContain('title="Delete entity"');
    expect(unlockedHtml).not.toContain('disabled=""');

    useUIStore.getState().setLayerLocked('lane', true);
    const lockedHtml = renderNode(entityNode);
    expect(lockedHtml).toContain('title="Layer is locked"');
    expect(lockedHtml).toContain('disabled=""');
    expect(lockedHtml).toContain('cursor-not-allowed');
  });

  it('renders sections without layer actions and shows their child count', () => {
    const html = renderNode(
      {
        id: 'section:road-a:s-a',
        name: 'Section s-a',
        kind: 'section',
        dropKind: 'roadSection',
        parentTarget: { kind: 'roadSection', roadId: 'road-a', sectionId: 's-a' },
        children: [{ id: 'entity:lane-a', name: 'lane-a', kind: 'entity', dropKind: 'none' }],
      },
      { internal: true },
    );

    expect(html).toContain('Section s-a');
    expect(html).toContain('text-zinc-400 font-mono italic');
    expect(html).toContain('>1</span>');
    expect(html).not.toContain('Detach from parent');
    expect(html).not.toContain('Hide layer');
  });
});

describe('LayerTree Node interaction helpers', () => {
  it('selects entity rows, toggles internal entity rows, and toggles non-entity groups', () => {
    const entityNodeFake: NodeFake = {
      data: entityTreeNode('lane-a', 'lane'),
      isInternal: true,
      isOpen: false,
      isSelected: false,
      willReceiveDrop: false,
      select: vi.fn(),
      toggle: vi.fn(),
    };

    selectOrToggleLayerTreeNode(entityNodeFake);
    expect(entityNodeFake.select).toHaveBeenCalledTimes(1);
    expect(entityNodeFake.toggle).toHaveBeenCalledTimes(1);

    const groupNodeFake: NodeFake = {
      data: groupTreeNode('lane'),
      isInternal: true,
      isOpen: false,
      isSelected: false,
      willReceiveDrop: false,
      select: vi.fn(),
      toggle: vi.fn(),
    };

    selectOrToggleLayerTreeNode(groupNodeFake);
    expect(groupNodeFake.select).not.toHaveBeenCalled();
    expect(groupNodeFake.toggle).toHaveBeenCalledTimes(1);
  });

  it('toggles group visibility and lock state', () => {
    const laneGroup = groupTreeNode('lane');

    toggleLayerTreeGroupVisible(laneGroup, useUIStore.getState().toggleLayerVisible);
    expect(useUIStore.getState().layerStates.lane?.visible).toBe(false);

    toggleLayerTreeGroupVisible(laneGroup, useUIStore.getState().toggleLayerVisible);
    expect(useUIStore.getState().layerStates.lane?.visible).toBe(true);

    toggleLayerTreeGroupLocked(laneGroup, useUIStore.getState().toggleLayerLocked);
    expect(useUIStore.getState().layerStates.lane?.locked).toBe(true);

    toggleLayerTreeGroupLocked(laneGroup, useUIStore.getState().toggleLayerLocked);
    expect(useUIStore.getState().layerStates.lane?.locked).toBe(false);
  });

  it('detaches and deletes entities, but locked layer actions are no-op', () => {
    useMapStore.setState({
      entities: mapOf([road('road-a', ['lane-a']), lane('lane-a'), lane('lane-locked')]),
    });

    detachLayerTreeEntity(
      entityTreeNode('lane-a', 'lane'),
      false,
      useMapStore.getState().reparentEntity,
    );
    expect(
      (useMapStore.getState().entities.get('road-a') as RoadEntity).sections[0]?.laneIds,
    ).toEqual([]);

    deleteLayerTreeEntity(
      entityTreeNode('lane-a', 'lane'),
      false,
      useMapStore.getState().removeEntity,
    );
    expect(useMapStore.getState().entities.has('lane-a')).toBe(false);

    detachLayerTreeEntity(
      entityTreeNode('lane-locked', 'lane'),
      true,
      useMapStore.getState().reparentEntity,
    );
    deleteLayerTreeEntity(
      entityTreeNode('lane-locked', 'lane'),
      true,
      useMapStore.getState().removeEntity,
    );
    expect(useMapStore.getState().entities.has('lane-locked')).toBe(true);
  });
});

describe('LayerTree panel SSR rendering', () => {
  it('renders locked create actions and the empty state', () => {
    useUIStore.getState().setLayerLocked('road', true);
    useUIStore.getState().setLayerLocked('rsu', true);

    const html = renderToStaticMarkup(<LayerTree />);

    expect(html).toContain('Road layer is locked');
    expect(html).toContain('RSU layer is locked');
    expect(html).toContain('disabled=""');
    expect(html).toContain('No entities yet. Start drawing!');
  });

  it('renders the tree viewport branch instead of the empty state when entities exist', () => {
    useMapStore.setState({
      entities: mapOf([road('road-a', ['lane-a']), lane('lane-a'), rsu('rsu-a')]),
    });

    const html = renderToStaticMarkup(<LayerTree selectedId="lane-a" />);

    expect(html).toContain('新建 Road');
    expect(html).toContain('新建 RSU');
    expect(html).toContain('min-h-0 flex-1');
    expect(html).not.toContain('No entities yet. Start drawing!');
  });
});

describe('LayerTree interaction helpers', () => {
  it('creates road and RSU entities, selects them, and honors layer locks', () => {
    const onSelect = vi.fn();
    createLayerTreeRoad(
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().addEntity,
      onSelect,
    );
    createLayerTreeRSU(
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().addEntity,
      onSelect,
    );

    expect([...useMapStore.getState().entities.keys()]).toEqual(['road_1', 'RSU_1']);
    expect(useMapStore.getState().entities.get('road_1')).toMatchObject({
      entityType: 'road',
      sections: [{ id: 'section_1', laneIds: [] }],
    });
    expect(useMapStore.getState().entities.get('RSU_1')).toMatchObject({
      entityType: 'rsu',
      junctionId: null,
    });
    expect(onSelect).toHaveBeenNthCalledWith(1, 'road_1');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'RSU_1');

    useUIStore.getState().setLayerLocked('road', true);
    useUIStore.getState().setLayerLocked('rsu', true);
    createLayerTreeRoad(
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().addEntity,
      onSelect,
    );
    createLayerTreeRSU(
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().addEntity,
      onSelect,
    );
    expect([...useMapStore.getState().entities.keys()]).toEqual(['road_1', 'RSU_1']);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('maps entity/group selection back to onSelect', () => {
    const onSelect = vi.fn();

    selectLayerTreeNode([nodeApi(entityTreeNode('lane-a', 'lane'))], onSelect);
    selectLayerTreeNode([nodeApi(groupTreeNode('lane'))], onSelect);
    selectLayerTreeNode([], onSelect);

    expect(onSelect).toHaveBeenNthCalledWith(1, 'lane-a');
    expect(onSelect).toHaveBeenNthCalledWith(2, null);
    expect(onSelect).toHaveBeenNthCalledWith(3, null);
  });

  it('configures drag and drop guards for locked layers and invalid targets', () => {
    useMapStore.setState({
      entities: mapOf([
        junction('junction-a'),
        road('road-a', ['lane-a'], 'junction-a'),
        road('road-b'),
        lane('lane-a'),
        rsu('rsu-a', 'junction-a'),
      ]),
    });

    const entities = useMapStore.getState().entities;
    let layerStates = useUIStore.getState().layerStates;

    expect(layerTreeDisableDrag(entityTreeNode('lane-a', 'lane'), layerStates)).toBe(false);
    expect(layerTreeDisableDrag(groupTreeNode('lane'), layerStates)).toBe(true);
    expect(
      layerTreeDisableDrop(
        {
          parentNode: nodeApi(roadSectionTreeNode('road-b', 'road-b-section-a')),
          dragNodes: [nodeApi(entityTreeNode('lane-a', 'lane'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(false);
    expect(
      layerTreeDisableDrop(
        {
          parentNode: nodeApi(groupTreeNode('lane')),
          dragNodes: [nodeApi(entityTreeNode('lane-a', 'lane'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(false);
    expect(
      layerTreeDisableDrop(
        {
          parentNode: null,
          dragNodes: [nodeApi(entityTreeNode('lane-a', 'lane'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(true);
    expect(
      layerTreeDisableDrop(
        {
          parentNode: nodeApi(roadSectionTreeNode('road-b', 'road-b-section-a')),
          dragNodes: [nodeApi(groupTreeNode('lane'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(true);

    useUIStore.getState().setLayerLocked('lane', true);
    layerStates = useUIStore.getState().layerStates;
    expect(layerTreeDisableDrag(entityTreeNode('lane-a', 'lane'), layerStates)).toBe(true);
    expect(
      layerTreeDisableDrop(
        {
          parentNode: nodeApi(roadSectionTreeNode('road-b', 'road-b-section-a')),
          dragNodes: [nodeApi(entityTreeNode('lane-a', 'lane'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(true);

    useUIStore.getState().setLayerLocked('lane', false);
    useUIStore.getState().setLayerLocked('road', true);
    layerStates = useUIStore.getState().layerStates;
    expect(
      layerTreeDisableDrop(
        {
          parentNode: nodeApi(roadSectionTreeNode('road-b', 'road-b-section-a')),
          dragNodes: [nodeApi(entityTreeNode('lane-a', 'lane'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(true);

    useUIStore.getState().setLayerLocked('road', false);
    useUIStore.getState().setLayerLocked('junction', true);
    layerStates = useUIStore.getState().layerStates;
    expect(
      layerTreeDisableDrop(
        {
          parentNode: nodeApi(groupTreeNode('road')),
          dragNodes: [nodeApi(entityTreeNode('road-a', 'road'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(true);
    expect(
      layerTreeDisableDrop(
        {
          parentNode: nodeApi(groupTreeNode('rsu')),
          dragNodes: [nodeApi(entityTreeNode('rsu-a', 'rsu'))],
        },
        entities,
        layerStates,
      ),
    ).toBe(true);
  });

  it('moves lanes, roads, and RSUs through LayerTree reparent callbacks', () => {
    useMapStore.setState({
      entities: mapOf([
        junction('junction-a'),
        road('road-a', ['lane-a']),
        road('road-b'),
        lane('lane-a'),
        rsu('rsu-a'),
      ]),
    });

    moveLayerTreeEntity(
      {
        dragIds: ['entity:lane-a'],
        dragNodes: [nodeApi(entityTreeNode('lane-a', 'lane'))],
        parentId: 'section:road-b:road-b-section-a',
        parentNode: nodeApi(roadSectionTreeNode('road-b', 'road-b-section-a')),
      },
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().reparentEntity,
    );
    expect(
      (useMapStore.getState().entities.get('road-a') as RoadEntity).sections[0]?.laneIds,
    ).toEqual([]);
    expect(
      (useMapStore.getState().entities.get('road-b') as RoadEntity).sections[0]?.laneIds,
    ).toEqual(['lane-a']);

    moveLayerTreeEntity(
      {
        dragIds: ['entity:road-b'],
        dragNodes: [nodeApi(entityTreeNode('road-b', 'road'))],
        parentId: 'entity:junction-a',
        parentNode: nodeApi({
          ...entityTreeNode('junction-a', 'junction'),
          dropKind: 'junction',
          parentTarget: { kind: 'junction', id: 'junction-a' },
        }),
      },
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().reparentEntity,
    );
    moveLayerTreeEntity(
      {
        dragIds: ['entity:rsu-a'],
        dragNodes: [nodeApi(entityTreeNode('rsu-a', 'rsu'))],
        parentId: 'entity:junction-a',
        parentNode: nodeApi({
          ...entityTreeNode('junction-a', 'junction'),
          dropKind: 'junction',
          parentTarget: { kind: 'junction', id: 'junction-a' },
        }),
      },
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().reparentEntity,
    );

    expect(useMapStore.getState().entities.get('road-b')).toMatchObject({
      junctionId: 'junction-a',
    });
    expect(useMapStore.getState().entities.get('rsu-a')).toMatchObject({
      junctionId: 'junction-a',
    });

    moveLayerTreeEntity(
      {
        dragIds: ['entity:road-b'],
        dragNodes: [nodeApi(entityTreeNode('road-b', 'road'))],
        parentId: 'group:road',
        parentNode: nodeApi(groupTreeNode('road')),
      },
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().reparentEntity,
    );
    expect(useMapStore.getState().entities.get('road-b')).toMatchObject({
      junctionId: null,
    });
  });

  it('does not move entities when layer locks block the callback', () => {
    useMapStore.setState({
      entities: mapOf([road('road-a', ['lane-a']), road('road-b'), lane('lane-a')]),
    });
    useUIStore.getState().setLayerLocked('road', true);

    moveLayerTreeEntity(
      {
        dragIds: ['entity:lane-a'],
        dragNodes: [nodeApi(entityTreeNode('lane-a', 'lane'))],
        parentId: 'section:road-b:road-b-section-a',
        parentNode: nodeApi(roadSectionTreeNode('road-b', 'road-b-section-a')),
      },
      useMapStore.getState().entities,
      useUIStore.getState().layerStates,
      useMapStore.getState().reparentEntity,
    );

    expect(
      (useMapStore.getState().entities.get('road-a') as RoadEntity).sections[0]?.laneIds,
    ).toEqual(['lane-a']);
    expect(
      (useMapStore.getState().entities.get('road-b') as RoadEntity).sections[0]?.laneIds,
    ).toEqual([]);
  });
});
