import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Tree, type NodeApi, type TreeApi } from 'react-arborist';
import { FaPlus } from 'react-icons/fa6';
import { scrollbarClassName } from '@/components/ui/scroll-area-classes';
import { canReparent } from '@/lib/entityOps';
import { nextEntityId, nextSubId, SUB_PREFIX } from '@/lib/idGenerator';
import { useMapStore } from '@/store/mapStore';
import type { RoadEntity, RSUEntity } from '@/types/apollo';
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
  const treeRef = useRef<TreeApi<TreeNode>>(null);

  const treeData = useMemo(() => buildTree(entities), [entities]);

  const createRoad = useCallback(() => {
    const road = makeRoad(entities);
    addEntity(road);
    onSelect?.(road.id);
  }, [addEntity, entities, onSelect]);

  const createRSU = useCallback(() => {
    const rsu = makeRSU(entities);
    addEntity(rsu);
    onSelect?.(rsu.id);
  }, [addEntity, entities, onSelect]);

  const handleSelect = useCallback(
    (nodes: NodeApi<TreeNode>[]) => {
      const first = nodes[0]?.data;
      if (first?.kind === 'entity' && first.entityId) {
        onSelect?.(first.entityId);
      } else {
        onSelect?.(null);
      }
    },
    [onSelect],
  );

  const checkDisableDrop = useCallback(
    (args: { parentNode: NodeApi<TreeNode> | null; dragNodes: NodeApi<TreeNode>[] }) => {
      const drag = args.dragNodes[0]?.data;
      const parent = args.parentNode?.data;
      if (!drag || drag.kind !== 'entity' || !drag.entityId) return true;
      if (!parent) return true;

      const target = parent.parentTarget;
      if (!target) return true;

      const child = entities.get(drag.entityId);
      if (!child) return true;
      return !canReparent(child, target, entities);
    },
    [entities],
  );

  const handleMove = useCallback(
    (args: {
      dragIds: string[];
      dragNodes: NodeApi<TreeNode>[];
      parentId: string | null;
      parentNode: NodeApi<TreeNode> | null;
    }) => {
      const drag = args.dragNodes[0]?.data;
      const parent = args.parentNode?.data;
      if (!drag || drag.kind !== 'entity' || !drag.entityId) return;
      const target = parent?.parentTarget;
      if (!target) return;
      const result = reparentEntity(drag.entityId, target);
      if (result.rejected) {
        console.warn('[LayerTree] reparent rejected:', result.rejected);
      }
    },
    [reparentEntity],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <LayerTreeActions onCreateRoad={createRoad} onCreateRSU={createRSU} />
      {treeData.length === 0 ? (
        <LayerTreeEmpty />
      ) : (
        <LayerTreeView
          treeRef={treeRef}
          treeData={treeData}
          selectedId={selectedId}
          onSelect={handleSelect}
          onMove={handleMove}
          disableDrop={checkDisableDrop}
        />
      )}
    </div>
  );
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

function LayerTreeActions({
  onCreateRoad,
  onCreateRSU,
}: {
  onCreateRoad: () => void;
  onCreateRSU: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 py-1 border-b border-zinc-800/60">
      <button
        onClick={onCreateRoad}
        className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/5"
        title="新建 Road（之后拖 lane 进 Section 完成 assign）"
      >
        <FaPlus className="w-2.5 h-2.5" /> Road
      </button>
      <button
        onClick={onCreateRSU}
        className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/5"
        title="新建 RSU（之后拖到某个 Junction 下完成 assign）"
      >
        <FaPlus className="w-2.5 h-2.5" /> RSU
      </button>
    </div>
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
          className={scrollbarClassName}
          openByDefault={false}
          width="100%"
          height={treeHeight}
          indent={16}
          rowHeight={26}
          overscanCount={10}
          selection={selectedId ? `entity:${selectedId}` : undefined}
          onSelect={onSelect}
          onMove={onMove}
          disableDrag={(node) => node.kind !== 'entity'}
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
