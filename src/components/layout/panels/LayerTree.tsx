import { useMemo, useRef, useCallback } from 'react';
import { Tree, NodeRendererProps, TreeApi } from 'react-arborist';
import { ChevronRight, Eye, EyeOff, Lock, Unlock, Layers, Trash2, Copy } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { clsx } from 'clsx';

// ─── Types ─────────────────────────────────────────────────

interface TreeNode {
  id: string;
  name: string;
  entityType?: string;
  isGroup?: boolean;
  children?: TreeNode[];
}

const TYPE_LABELS: Record<string, string> = {
  lane: 'Lanes',
  junction: 'Junctions',
  parkingSpace: 'Parking Spaces',
  signal: 'Signals',
  crosswalk: 'Crosswalks',
  stopSign: 'Stop Signs',
  speedBump: 'Speed Bumps',
  polyline: 'Polylines',
  bezier: 'Bezier Curves',
  arc: 'Arcs',
  rect: 'Rectangles',
  polygon: 'Polygons',
  catmullRom: 'CatmullRom Curves',
};

const TYPE_ICONS: Record<string, string> = {
  lane: '🛣️', junction: '🔀', parkingSpace: '🅿️', signal: '🚦',
  crosswalk: '🚶', stopSign: '🛑', speedBump: '⚠️', polyline: '📏',
  bezier: '〰️', arc: '⌒', rect: '▭', polygon: '⬡', catmullRom: '🔄',
};

// ─── Node Renderer ─────────────────────────────────────────

function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const data = node.data;
  const isGroup = data.isGroup;
  const entityType = data.entityType || '';

  const toggleLayerVisible = useUIStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useUIStore((s) => s.toggleLayerLocked);
  const isVisible = useUIStore((s) => s.layerStates[entityType]?.visible ?? true);
  const isLocked = useUIStore((s) => s.layerStates[entityType]?.locked ?? false);
  const removeEntity = useMapStore((s) => s.removeEntity);

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGroup) {
      toggleLayerVisible(entityType);
    }
  };

  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGroup) {
      toggleLayerLocked(entityType);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isGroup) {
      removeEntity(data.id);
    }
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      onClick={() => {
        if (node.isInternal) node.toggle();
        else node.select();
      }}
      className={clsx(
        'flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none group',
        'hover:bg-white/5 rounded',
        node.isSelected && !isGroup && 'bg-cyan-500/15',
        isGroup && !isVisible && 'opacity-50'
      )}
    >
      {/* Expand arrow for groups */}
      {isGroup ? (
        <ChevronRight
          className={clsx(
            'w-3.5 h-3.5 text-zinc-600 transition-transform shrink-0',
            node.isOpen && 'rotate-90'
          )}
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}

      {/* Icon */}
      <span className="text-xs shrink-0">
        {isGroup ? (
          <Layers className="w-3.5 h-3.5 text-zinc-500" />
        ) : (
          TYPE_ICONS[entityType] || '📄'
        )}
      </span>

      {/* Name */}
      <span
        className={clsx(
          'flex-1 text-xs truncate',
          isGroup ? 'text-zinc-300 font-medium' : 'text-zinc-400 font-mono'
        )}
      >
        {data.name}
      </span>

      {/* Count badge for groups */}
      {isGroup && data.children && (
        <span className="text-[10px] font-mono text-zinc-600 px-1">
          {data.children.length}
        </span>
      )}

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {isGroup ? (
          <>
            {/* Visibility toggle */}
            <button
              onClick={handleVisibilityToggle}
              className="p-0.5 hover:bg-white/10 rounded"
              title={isVisible ? 'Hide layer' : 'Show layer'}
            >
              {isVisible ? (
                <Eye className="w-3 h-3 text-zinc-500" />
              ) : (
                <EyeOff className="w-3 h-3 text-zinc-600" />
              )}
            </button>

            {/* Lock toggle */}
            <button
              onClick={handleLockToggle}
              className="p-0.5 hover:bg-white/10 rounded"
              title={isLocked ? 'Unlock layer' : 'Lock layer'}
            >
              {isLocked ? (
                <Lock className="w-3 h-3 text-amber-500" />
              ) : (
                <Unlock className="w-3 h-3 text-zinc-600" />
              )}
            </button>
          </>
        ) : (
          <>
            {/* Delete entity */}
            <button
              onClick={handleDelete}
              className="p-0.5 hover:bg-red-500/20 rounded"
              title="Delete entity"
            >
              <Trash2 className="w-3 h-3 text-zinc-600 hover:text-red-400" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

interface LayerTreeProps {
  onSelect?: (entityId: string | null) => void;
  selectedId?: string | null;
}

export function LayerTree({ onSelect, selectedId }: LayerTreeProps) {
  const entities = useMapStore((s) => s.entities);
  const treeRef = useRef<TreeApi<TreeNode>>(null);

  // Build tree data from entities
  const treeData = useMemo(() => {
    const groups = new Map<string, TreeNode>();

    entities.forEach((entity) => {
      const type = entity.entityType;

      if (!groups.has(type)) {
        groups.set(type, {
          id: `group-${type}`,
          name: TYPE_LABELS[type] || type,
          entityType: type,
          isGroup: true,
          children: [],
        });
      }

      const group = groups.get(type)!;
      group.children!.push({
        id: entity.id,
        name: entity.id.length > 16 ? `...${entity.id.slice(-12)}` : entity.id,
        entityType: type,
        isGroup: false,
      });
    });

    return Array.from(groups.values()).sort(
      (a, b) => (b.children?.length || 0) - (a.children?.length || 0)
    );
  }, [entities]);

  // Handle selection
  const handleSelect = useCallback(
    (nodes: TreeNode[]) => {
      if (nodes.length > 0 && !nodes[0].isGroup) {
        onSelect?.(nodes[0].id);
      } else {
        onSelect?.(null);
      }
    },
    [onSelect]
  );

  return (
    <div className="h-full">
      {treeData.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
          No entities yet. Start drawing!
        </div>
      ) : (
        <Tree
          ref={treeRef}
          data={treeData}
          openByDefault={false}
          width="100%"
          height={600}
          indent={16}
          rowHeight={26}
          overscanCount={10}
          selection={selectedId || undefined}
          onSelect={handleSelect}
          disableDrag={false}
          disableDrop={false}
        >
          {Node}
        </Tree>
      )}
    </div>
  );
}
