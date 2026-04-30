import { useMemo, useRef, useCallback } from 'react';
import { nanoid } from 'nanoid';
import { Tree, NodeRendererProps, TreeApi, NodeApi } from 'react-arborist';
import {
  FaChevronRight,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaLockOpen,
  FaLayerGroup,
  FaTrash,
  FaLink,
  FaPlus,
} from 'react-icons/fa6';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { MapEntity } from '@/types/entities';
import type { LaneEntity, RoadEntity, RSUEntity } from '@/types/apollo';
import { canReparent, type ParentTarget } from '@/lib/entityOps';
import { clsx } from 'clsx';

// ─── Tree node model ──────────────────────────────────────
//
// Three node kinds:
//   - 'group'    top-level type folder (Lanes/Junctions/Roads/...)
//   - 'section'  virtual node for a Road's RoadSection
//   - 'entity'   real entity node (id maps 1:1 to an entity in mapStore)
//
// `parentTarget` (when present) is the ParentTarget that drops onto
// this node should become — e.g. dropping a Lane onto a Junction node
// resolves to { kind: 'junction', id }.

type DropKind = 'junction' | 'road' | 'roadSection' | 'unparented' | 'none';

interface TreeNode {
  id: string;
  name: string;
  kind: 'group' | 'section' | 'entity';
  entityType?: string;
  entityId?: string;
  parentTarget?: ParentTarget;
  /** What kind of children we accept; 'none' = leaf. */
  dropKind: DropKind;
  children?: TreeNode[];
}

const TYPE_LABELS: Record<string, string> = {
  road: 'Roads',
  junction: 'Junctions',
  lane: 'Lanes',
  signal: 'Signals',
  crosswalk: 'Crosswalks',
  stopSign: 'Stop Signs',
  yieldSign: 'Yield Signs',
  speedBump: 'Speed Bumps',
  clearArea: 'Clear Areas',
  parkingSpace: 'Parking Spaces',
  parkingLot: 'Parking Lots',
  pncJunction: 'PNC Junctions',
  rsu: 'RSUs',
  area: 'Areas',
  barrierGate: 'Barrier Gates',
  overlap: 'Overlaps',
  speedControl: 'Speed Controls',
  // drawing primitives
  polyline: 'Polylines',
  bezier: 'Bezier Curves',
  arc: 'Arcs',
  rect: 'Rectangles',
  polygon: 'Polygons',
  catmullRom: 'CatmullRom Curves',
};

// Order of top-level groups. Apollo HD-Map structure first, drawing primitives last.
const TOP_LEVEL_ORDER = [
  'road',
  'junction',
  'lane',
  'signal',
  'crosswalk',
  'stopSign',
  'yieldSign',
  'speedBump',
  'clearArea',
  'parkingSpace',
  'parkingLot',
  'pncJunction',
  'rsu',
  'area',
  'barrierGate',
  'overlap',
  'speedControl',
  // drawings
  'polyline',
  'bezier',
  'arc',
  'rect',
  'polygon',
  'catmullRom',
];

const ENTITY_GLYPH: Record<string, string> = {
  lane: '🛣️',
  junction: '🔀',
  road: '🛤️',
  signal: '🚦',
  crosswalk: '🚶',
  stopSign: '🛑',
  speedBump: '⚠️',
  yieldSign: '⚠',
  clearArea: '⛔',
  parkingSpace: '🅿️',
  parkingLot: '🅿️',
  pncJunction: '🔀',
  rsu: '📡',
  area: '⬡',
  barrierGate: '🚧',
  overlap: '⊕',
  speedControl: '🐌',
  polyline: '📏',
  bezier: '〰️',
  arc: '⌒',
  rect: '▭',
  polygon: '⬡',
  catmullRom: '🔄',
};

function entityIcon(entityType: string): string {
  return ENTITY_GLYPH[entityType] ?? '📄';
}

function entityDisplayId(id: string): string {
  return id.length > 16 ? `…${id.slice(-12)}` : id;
}

// ─── Node renderer ────────────────────────────────────────

function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const data = node.data;

  const toggleLayerVisible = useUIStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useUIStore((s) => s.toggleLayerLocked);
  const groupKey = data.kind === 'group' ? (data.entityType ?? '') : '';
  const isVisible = useUIStore((s) => s.layerStates[groupKey]?.visible ?? true);
  const isLocked = useUIStore((s) => s.layerStates[groupKey]?.locked ?? false);
  const removeEntity = useMapStore((s) => s.removeEntity);
  const reparentEntity = useMapStore((s) => s.reparentEntity);

  const isGroup = data.kind === 'group';
  const isSection = data.kind === 'section';
  const isEntity = data.kind === 'entity';
  const dimmed = isGroup && !isVisible;

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGroup && groupKey) toggleLayerVisible(groupKey);
  };

  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGroup && groupKey) toggleLayerLocked(groupKey);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEntity && data.entityId) removeEntity(data.entityId);
  };

  const handleUnparent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEntity && data.entityId) reparentEntity(data.entityId, { kind: 'none' });
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
        node.isSelected && isEntity && 'bg-cyan-500/15',
        dimmed && 'opacity-50',
        node.willReceiveDrop && 'bg-cyan-500/10 ring-1 ring-cyan-500/30',
      )}
    >
      {/* Expand caret */}
      {node.isInternal ? (
        <FaChevronRight
          className={clsx(
            'w-3.5 h-3.5 text-zinc-600 transition-transform shrink-0',
            node.isOpen && 'rotate-90',
          )}
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}

      {/* Icon */}
      <span className="text-xs shrink-0 w-4 text-center">
        {isGroup ? (
          <FaLayerGroup className="w-3.5 h-3.5 text-zinc-500 inline" />
        ) : isSection ? (
          <span className="text-zinc-500">§</span>
        ) : (
          entityIcon(data.entityType ?? '')
        )}
      </span>

      {/* Name */}
      <span
        className={clsx(
          'flex-1 text-xs truncate',
          isGroup && 'text-zinc-300 font-medium',
          isSection && 'text-zinc-400 font-mono italic',
          isEntity && 'text-zinc-400 font-mono',
        )}
        title={isEntity ? data.entityId : data.name}
      >
        {data.name}
      </span>

      {/* Count badge */}
      {(isGroup || isSection) && data.children && (
        <span className="text-[10px] font-mono text-zinc-600 px-1">{data.children.length}</span>
      )}

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {isGroup ? (
          <>
            <button
              onClick={handleVisibilityToggle}
              className="p-0.5 hover:bg-white/10 rounded"
              title={isVisible ? 'Hide layer' : 'Show layer'}
            >
              {isVisible ? (
                <FaEye className="w-3 h-3 text-zinc-500" />
              ) : (
                <FaEyeSlash className="w-3 h-3 text-zinc-600" />
              )}
            </button>
            <button
              onClick={handleLockToggle}
              className="p-0.5 hover:bg-white/10 rounded"
              title={isLocked ? 'Unlock layer' : 'Lock layer'}
            >
              {isLocked ? (
                <FaLock className="w-3 h-3 text-amber-500" />
              ) : (
                <FaLockOpen className="w-3 h-3 text-zinc-600" />
              )}
            </button>
          </>
        ) : isEntity ? (
          <>
            <button
              onClick={handleUnparent}
              className="p-0.5 hover:bg-white/10 rounded"
              title="Detach from parent"
            >
              <FaLink className="w-3 h-3 text-zinc-600 hover:text-amber-400" />
            </button>
            <button
              onClick={handleDelete}
              className="p-0.5 hover:bg-red-500/20 rounded"
              title="Delete entity"
            >
              <FaTrash className="w-3 h-3 text-zinc-600 hover:text-red-400" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Tree builder ─────────────────────────────────────────
//
// Strategy: every entity has ONE primary "home" in the tree.
//   - Lane:  if junctionId set → under that Junction
//            else if some RoadSection.laneIds contains it → under that Section
//            else → under "Lanes" group
//   - Road:  if junctionId set → under that Junction
//            else → under "Roads" group
//   - RSU:   if junctionId set → under that Junction
//            else → under "RSUs" group
//   - Everything else → under its own type group
//
// Tree-node ids are scoped so they're globally unique even though
// many composite paths reuse real entity ids:
//   group:<entityType>
//   section:<roadId>:<sectionId>
//   entity:<entityId>          (for primary home — keeps real id for selection)

function buildTree(entities: ReadonlyMap<string, MapEntity>): TreeNode[] {
  // First pass — index parents.
  const roads: RoadEntity[] = [];
  const junctions = new Map<string, MapEntity>();
  for (const e of entities.values()) {
    if (e.entityType === 'road') roads.push(e);
    else if (e.entityType === 'junction') junctions.set(e.id, e);
  }

  // Index: which RoadSection (roadId, sectionId) contains a given laneId.
  const laneSection = new Map<string, { roadId: string; sectionId: string }>();
  for (const r of roads) {
    for (const s of r.sections) {
      for (const lid of s.laneIds) {
        if (!laneSection.has(lid)) laneSection.set(lid, { roadId: r.id, sectionId: s.id });
      }
    }
  }

  // Container for children-by-junction-id and children-by-section.
  const junctionChildren = new Map<string, TreeNode[]>();
  const sectionChildren = new Map<string, TreeNode[]>(); // key = `${roadId}:${sectionId}`
  const groupChildren = new Map<string, TreeNode[]>();

  const ensureGroup = (k: string): TreeNode[] => {
    let arr = groupChildren.get(k);
    if (!arr) {
      arr = [];
      groupChildren.set(k, arr);
    }
    return arr;
  };
  const ensureJunction = (k: string): TreeNode[] => {
    let arr = junctionChildren.get(k);
    if (!arr) {
      arr = [];
      junctionChildren.set(k, arr);
    }
    return arr;
  };
  const ensureSection = (k: string): TreeNode[] => {
    let arr = sectionChildren.get(k);
    if (!arr) {
      arr = [];
      sectionChildren.set(k, arr);
    }
    return arr;
  };

  // Allocate primary homes for every entity.
  for (const e of entities.values()) {
    const baseNode = (extra: Partial<TreeNode>): TreeNode => ({
      id: `entity:${e.id}`,
      name: entityDisplayId(e.id),
      kind: 'entity',
      entityType: e.entityType,
      entityId: e.id,
      dropKind: 'none',
      ...extra,
    });

    if (e.entityType === 'lane') {
      const lane = e as LaneEntity;
      if (lane.junctionId && junctions.has(lane.junctionId)) {
        ensureJunction(lane.junctionId).push(baseNode({}));
        continue;
      }
      const sec = laneSection.get(e.id);
      if (sec) {
        ensureSection(`${sec.roadId}:${sec.sectionId}`).push(baseNode({}));
        continue;
      }
      ensureGroup('lane').push(baseNode({}));
      continue;
    }

    if (e.entityType === 'road') {
      const road = e as RoadEntity;
      const sectionNodes: TreeNode[] = road.sections.map((s) => ({
        id: `section:${road.id}:${s.id}`,
        name: `Section ${s.id}`,
        kind: 'section',
        dropKind: 'roadSection',
        parentTarget: { kind: 'roadSection', roadId: road.id, sectionId: s.id },
        children: ensureSection(`${road.id}:${s.id}`),
      }));
      const roadNode = baseNode({
        children: sectionNodes,
        dropKind: 'road',
        parentTarget: { kind: 'road', id: road.id },
      });
      if (road.junctionId && junctions.has(road.junctionId)) {
        ensureJunction(road.junctionId).push(roadNode);
      } else {
        ensureGroup('road').push(roadNode);
      }
      continue;
    }

    if (e.entityType === 'junction') {
      const jNode = baseNode({
        children: ensureJunction(e.id),
        dropKind: 'junction',
        parentTarget: { kind: 'junction', id: e.id },
      });
      ensureGroup('junction').push(jNode);
      continue;
    }

    if (e.entityType === 'rsu') {
      const rsu = e as RSUEntity;
      if (rsu.junctionId && junctions.has(rsu.junctionId)) {
        ensureJunction(rsu.junctionId).push(baseNode({}));
        continue;
      }
      ensureGroup('rsu').push(baseNode({}));
      continue;
    }

    // Default: top-level type folder, leaf node.
    ensureGroup(e.entityType).push(baseNode({}));
  }

  // Make sure section/junction children arrays are wired even when empty.
  // (They were created lazily above; nothing to do for them not present.)

  // Build the top-level groups in canonical order.
  const seen = new Set<string>();
  const groups: TreeNode[] = [];
  const pushGroup = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const children = groupChildren.get(key);
    if (!children || children.length === 0) return;
    groups.push({
      id: `group:${key}`,
      name: TYPE_LABELS[key] ?? key,
      kind: 'group',
      entityType: key,
      dropKind: dropKindForGroup(key),
      parentTarget: parentTargetForGroup(key),
      children,
    });
  };

  for (const k of TOP_LEVEL_ORDER) pushGroup(k);
  // Catch-all for any future type not in TOP_LEVEL_ORDER.
  for (const k of groupChildren.keys()) pushGroup(k);

  return groups;
}

function dropKindForGroup(entityType: string): DropKind {
  if (entityType === 'lane' || entityType === 'rsu' || entityType === 'road') return 'unparented';
  return 'none';
}

function parentTargetForGroup(entityType: string): ParentTarget | undefined {
  if (entityType === 'lane' || entityType === 'rsu' || entityType === 'road') {
    return { kind: 'none' };
  }
  return undefined;
}

// ─── Main component ───────────────────────────────────────

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

  // Validate drop: is the drag node (entity) compatible with target node?
  const checkDisableDrop = useCallback(
    (args: { parentNode: NodeApi<TreeNode> | null; dragNodes: NodeApi<TreeNode>[] }) => {
      const drag = args.dragNodes[0]?.data;
      const parent = args.parentNode?.data;
      if (!drag || drag.kind !== 'entity' || !drag.entityId) return true;
      if (!parent) return true; // dropping at root: ambiguous, refuse

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
      {/* Container-only entities (no canvas geometry) need a tree-side spawn affordance. */}
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
