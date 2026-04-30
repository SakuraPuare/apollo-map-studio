import { useCallback, useMemo, useRef } from 'react';
import { nanoid } from 'nanoid';
import { Tree, type NodeApi, type TreeApi } from 'react-arborist';
import { FaPlus } from 'react-icons/fa6';
import { canReparent } from '@/lib/entityOps';
import { useMapStore } from '@/store/mapStore';
import type { RoadEntity, RSUEntity } from '@/types/apollo';
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
    const id = `road_${nanoid(12)}`;
    const road: RoadEntity = {
      id,
      entityType: 'road',
      sections: [{ id: `sec_${nanoid(8)}`, laneIds: [] }],
      junctionId: null,
      type: 'CITY_ROAD',
    };
    addEntity(road);
    onSelect?.(id);
  }, [addEntity, onSelect]);

  const createRSU = useCallback(() => {
    const id = `rsu_${nanoid(12)}`;
    const rsu: RSUEntity = {
      id,
      entityType: 'rsu',
      junctionId: null,
      overlapIds: [],
    };
    addEntity(rsu);
    onSelect?.(id);
  }, [addEntity, onSelect]);

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
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800/60">
        <button
          onClick={createRoad}
          className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/5"
          title="新建 Road（之后拖 lane 进 Section 完成 assign）"
        >
          <FaPlus className="w-2.5 h-2.5" /> Road
        </button>
        <button
          onClick={createRSU}
          className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/5"
          title="新建 RSU（之后拖到某个 Junction 下完成 assign）"
        >
          <FaPlus className="w-2.5 h-2.5" /> RSU
        </button>
      </div>
      {treeData.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
          No entities yet. Start drawing!
        </div>
      ) : (
        <Tree<TreeNode>
          ref={treeRef}
          data={treeData}
          openByDefault={false}
          width="100%"
          height={600}
          indent={16}
          rowHeight={26}
          overscanCount={10}
          selection={selectedId ? `entity:${selectedId}` : undefined}
          onSelect={handleSelect}
          onMove={handleMove}
          disableDrag={(node) => node.kind !== 'entity'}
          disableDrop={checkDisableDrop}
        >
          {Node}
        </Tree>
      )}
    </div>
  );
}
