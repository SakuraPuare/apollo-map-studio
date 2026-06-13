import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Tree, type NodeApi, type TreeApi } from 'react-arborist';
import { FaPlus } from 'react-icons/fa6';
import { clsx } from 'clsx';
import { scrollAreaClassName } from '@/components/ui/scroll-area-classes';
import { canReparent, type ParentTarget } from '@/lib/entityOps';
import { nextEntityId, nextSubId, SUB_PREFIX } from '@/lib/idGenerator';
import { useMapStore } from '@/store/mapStore';
import { isEntityTypeLocked, useUIStore, type LayerStates } from '@/store/uiStore';
import type { LaneEntity, RoadEntity, RSUEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { Node } from './LayerTree/Node';
import { buildTree } from './LayerTree/treeBuilder';
import type { TreeNode } from './LayerTree/types';

interface LayerTreeProps {
  onSelect?: (entityId: string | null) => void;
  selectedId?: string | null;
}

export function LayerTree({ onSelect, selectedId }: LayerTreeProps) {
  const entities = useMapStore((s) => s.entities);
  const reparentEntity = useMapStore((s) => s.reparentEntity);
  const addEntity = useMapStore((s) => s.addEntity);
  const layerStates = useUIStore((s) => s.layerStates);
  const treeRef = useRef<TreeApi<TreeNode>>(null);

  const treeData = useMemo(() => buildTree(entities), [entities]);

  const createRoad = useCallback(() => {
    createLayerTreeRoad(entities, layerStates, addEntity, onSelect);
  }, [addEntity, entities, layerStates, onSelect]);

  const createRSU = useCallback(() => {
    createLayerTreeRSU(entities, layerStates, addEntity, onSelect);
  }, [addEntity, entities, layerStates, onSelect]);

  const handleSelect = useCallback(
    (nodes: NodeApi<TreeNode>[]) => selectLayerTreeNode(nodes, onSelect),
    [onSelect],
  );

  const checkDisableDrop = useCallback(
    (args: { parentNode: NodeApi<TreeNode> | null; dragNodes: NodeApi<TreeNode>[] }) =>
      layerTreeDisableDrop(args, entities, layerStates),
    [entities, layerStates],
  );

  const handleMove = useCallback(
    (args: {
      dragIds: string[];
      dragNodes: NodeApi<TreeNode>[];
      parentId: string | null;
      parentNode: NodeApi<TreeNode> | null;
    }) => {
      moveLayerTreeEntity(args, entities, layerStates, reparentEntity);
    },
    [entities, layerStates, reparentEntity],
  );

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="layer-tree">
      <LayerTreeActions
        roadLocked={isEntityTypeLocked(layerStates, 'road')}
        rsuLocked={isEntityTypeLocked(layerStates, 'rsu')}
        onCreateRoad={createRoad}
        onCreateRSU={createRSU}
      />
      {treeData.length === 0 ? (
        <LayerTreeEmpty />
      ) : (
        <LayerTreeView
          treeRef={treeRef}
          treeData={treeData}
          selectedId={selectedId}
          onSelect={handleSelect}
          onMove={handleMove}
          disableDrag={(node) => layerTreeDisableDrag(node, layerStates)}
          disableDrop={checkDisableDrop}
        />
      )}
    </div>
  );
}

export function createLayerTreeRoad(
  entities: ReadonlyMap<string, MapEntity>,
  layerStates: LayerStates,
  addEntity: (entity: MapEntity) => void,
  onSelect?: (entityId: string | null) => void,
) {
  if (isEntityTypeLocked(layerStates, 'road')) return;
  const road = makeRoad(entities);
  addEntity(road);
  onSelect?.(road.id);
}

export function createLayerTreeRSU(
  entities: ReadonlyMap<string, MapEntity>,
  layerStates: LayerStates,
  addEntity: (entity: MapEntity) => void,
  onSelect?: (entityId: string | null) => void,
) {
  if (isEntityTypeLocked(layerStates, 'rsu')) return;
  const rsu = makeRSU(entities);
  addEntity(rsu);
  onSelect?.(rsu.id);
}

export function selectLayerTreeNode(
  nodes: NodeApi<TreeNode>[],
  onSelect?: (entityId: string | null) => void,
) {
  const first = nodes[0]?.data;
  if (first?.kind === 'entity' && first.entityId) {
    onSelect?.(first.entityId);
  } else {
    onSelect?.(null);
  }
}

export function layerTreeDisableDrag(node: TreeNode, layerStates: LayerStates): boolean {
  return node.kind !== 'entity' || isEntityTypeLocked(layerStates, node.entityType ?? '');
}

export function layerTreeDisableDrop(
  args: { parentNode: NodeApi<TreeNode> | null; dragNodes: NodeApi<TreeNode>[] },
  entities: ReadonlyMap<string, MapEntity>,
  layerStates: LayerStates,
): boolean {
  const drag = args.dragNodes[0]?.data;
  const parent = args.parentNode?.data;
  if (!drag || drag.kind !== 'entity' || !drag.entityId) return true;
  if (!parent) return true;

  const target = parent.parentTarget;
  if (!target) return true;

  const child = entities.get(drag.entityId);
  if (!child) return true;
  if (isReparentBlockedByLayerLocks(child, target, layerStates, entities)) return true;
  return !canReparent(child, target, entities);
}

export function moveLayerTreeEntity(
  args: {
    dragIds: string[];
    dragNodes: NodeApi<TreeNode>[];
    parentId: string | null;
    parentNode: NodeApi<TreeNode> | null;
  },
  entities: ReadonlyMap<string, MapEntity>,
  layerStates: LayerStates,
  reparentEntity: (childId: string, target: ParentTarget) => { rejected?: string },
) {
  const drag = args.dragNodes[0]?.data;
  const parent = args.parentNode?.data;
  if (!drag || drag.kind !== 'entity' || !drag.entityId) return;
  const target = parent?.parentTarget;
  if (!target) return;
  const child = entities.get(drag.entityId);
  if (!child || isReparentBlockedByLayerLocks(child, target, layerStates, entities)) return;
  const result = reparentEntity(drag.entityId, target);
  if (result.rejected) {
    console.warn('[LayerTree] reparent rejected:', result.rejected);
  }
}

function makeRoad(entities: ReadonlyMap<string, MapEntity>): RoadEntity {
  return {
    id: nextEntityId('road', entities),
    entityType: 'road',
    sections: [{ id: nextSubId(SUB_PREFIX.section, []), laneIds: [] }],
    junctionId: null,
    type: 'CITY_ROAD',
  };
}

function makeRSU(entities: ReadonlyMap<string, MapEntity>): RSUEntity {
  return {
    id: nextEntityId('rsu', entities),
    entityType: 'rsu',
    junctionId: null,
    overlapIds: [],
  };
}

function isReparentBlockedByLayerLocks(
  child: MapEntity,
  target: ParentTarget,
  layerStates: LayerStates,
  entities: ReadonlyMap<string, MapEntity>,
): boolean {
  if (isEntityTypeLocked(layerStates, child.entityType)) return true;
  if (targetLayerIsLocked(target, layerStates)) return true;
  if (child.entityType === 'lane') {
    return laneReparentTouchesLockedLayer(child, target, layerStates, entities);
  }
  return parentJunctionIsLocked(child, layerStates);
}

function targetLayerIsLocked(target: ParentTarget, layerStates: LayerStates): boolean {
  if (target.kind === 'junction') return isEntityTypeLocked(layerStates, 'junction');
  if (target.kind === 'road' || target.kind === 'roadSection') {
    return isEntityTypeLocked(layerStates, 'road');
  }
  return false;
}

function laneReparentTouchesLockedLayer(
  lane: LaneEntity,
  target: ParentTarget,
  layerStates: LayerStates,
  entities: ReadonlyMap<string, MapEntity>,
): boolean {
  if (laneTouchesLockedRoad(lane.id, target, layerStates, entities)) return true;
  return Boolean(lane.junctionId && isEntityTypeLocked(layerStates, 'junction'));
}

function laneTouchesLockedRoad(
  laneId: string,
  target: ParentTarget,
  layerStates: LayerStates,
  entities: ReadonlyMap<string, MapEntity>,
): boolean {
  if (!isEntityTypeLocked(layerStates, 'road')) return false;
  if (target.kind === 'road' || target.kind === 'roadSection') return true;
  return laneIsAssignedToRoad(laneId, entities);
}

function parentJunctionIsLocked(child: MapEntity, layerStates: LayerStates): boolean {
  if (!isEntityTypeLocked(layerStates, 'junction')) return false;
  if (child.entityType === 'road') return Boolean(child.junctionId);
  if (child.entityType === 'rsu') return Boolean(child.junctionId);
  return false;
}

function laneIsAssignedToRoad(laneId: string, entities: ReadonlyMap<string, MapEntity>): boolean {
  for (const entity of entities.values()) {
    if (entity.entityType !== 'road') continue;
    // Fixed needle (laneId) over a per-section-varying haystack; runs once per
    // drag-drop validation on small laneIds arrays, not a hot path. A Set would
    // have to be rebuilt per section, so .includes() is the cheaper choice here.
    // react-doctor-disable-next-line react-doctor/js-set-map-lookups
    if (entity.sections.some((section) => section.laneIds.includes(laneId))) return true;
  }
  return false;
}

function LayerTreeActions({
  roadLocked,
  rsuLocked,
  onCreateRoad,
  onCreateRSU,
}: {
  roadLocked: boolean;
  rsuLocked: boolean;
  onCreateRoad: () => void;
  onCreateRSU: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 py-1 border-b border-zinc-800/60">
      <button
        type="button"
        disabled={roadLocked}
        onClick={onCreateRoad}
        className={createButtonClass(roadLocked)}
        title={
          roadLocked ? 'Road layer is locked' : '新建 Road（之后拖 lane 进 Section 完成 assign）'
        }
      >
        <FaPlus className="size-2.5" /> Road
      </button>
      <button
        type="button"
        disabled={rsuLocked}
        onClick={onCreateRSU}
        className={createButtonClass(rsuLocked)}
        title={
          rsuLocked ? 'RSU layer is locked' : '新建 RSU（之后拖到某个 Junction 下完成 assign）'
        }
      >
        <FaPlus className="size-2.5" /> RSU
      </button>
    </div>
  );
}

function createButtonClass(disabled: boolean) {
  return clsx(
    'flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded',
    disabled
      ? 'cursor-not-allowed text-zinc-600'
      : 'text-zinc-300 hover:text-white hover:bg-white/5',
  );
}

function LayerTreeEmpty() {
  return (
    <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
      No entities yet. Start drawing!
    </div>
  );
}

interface LayerTreeViewProps {
  treeRef: RefObject<TreeApi<TreeNode> | null>;
  treeData: TreeNode[];
  selectedId?: string | null;
  onSelect: (nodes: NodeApi<TreeNode>[]) => void;
  onMove: (args: {
    dragIds: string[];
    dragNodes: NodeApi<TreeNode>[];
    parentId: string | null;
    parentNode: NodeApi<TreeNode> | null;
  }) => void;
  disableDrag: (node: TreeNode) => boolean;
  disableDrop: (args: {
    parentNode: NodeApi<TreeNode> | null;
    dragNodes: NodeApi<TreeNode>[];
  }) => boolean;
}

function LayerTreeView({
  treeRef,
  treeData,
  selectedId,
  onSelect,
  onMove,
  disableDrag,
  disableDrop,
}: LayerTreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const treeHeight = useElementHeight(containerRef);

  return (
    <div ref={containerRef} className="min-h-0 flex-1">
      {treeHeight > 0 && (
        <Tree<TreeNode>
          ref={treeRef}
          data={treeData}
          className={scrollAreaClassName()}
          openByDefault={false}
          width="100%"
          height={treeHeight}
          indent={16}
          rowHeight={26}
          overscanCount={10}
          selection={selectedId ? `entity:${selectedId}` : undefined}
          onSelect={onSelect}
          onMove={onMove}
          disableDrag={disableDrag}
          disableDrop={disableDrop}
        >
          {Node}
        </Tree>
      )}
    </div>
  );
}

function useElementHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateHeight = () => setHeight(element.clientHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}
