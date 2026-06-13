import type { MouseEvent } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import {
  FaChevronRight,
  FaEye,
  FaEyeSlash,
  FaLink,
  FaLock,
  FaLockOpen,
  FaTrash,
} from 'react-icons/fa6';
import { clsx } from 'clsx';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { getEntityIcon } from './constants';
import type { TreeNode } from './types';

export function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const data = node.data;

  const toggleLayerVisible = useUIStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useUIStore((s) => s.toggleLayerLocked);
  const groupKey = data.kind === 'group' ? (data.entityType ?? '') : '';
  const layerKey = data.entityType ?? '';
  const isVisible = useUIStore((s) => s.layerStates[layerKey]?.visible ?? true);
  const isLocked = useUIStore((s) => s.layerStates[layerKey]?.locked ?? false);
  const removeEntity = useMapStore((s) => s.removeEntity);
  const reparentEntity = useMapStore((s) => s.reparentEntity);

  const isGroup = data.kind === 'group';
  const isSection = data.kind === 'section';
  const isEntity = data.kind === 'entity';

  const selectOrToggle = () => {
    selectOrToggleLayerTreeNode(node);
  };

  const handleVisibilityToggle = (e: MouseEvent) => {
    e.stopPropagation();
    toggleLayerTreeGroupVisible(data, toggleLayerVisible);
  };

  const handleLockToggle = (e: MouseEvent) => {
    e.stopPropagation();
    toggleLayerTreeGroupLocked(data, toggleLayerLocked);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    deleteLayerTreeEntity(data, isLocked, removeEntity);
  };

  const handleUnparent = (e: MouseEvent) => {
    e.stopPropagation();
    detachLayerTreeEntity(data, isLocked, reparentEntity);
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      role="treeitem"
      tabIndex={0}
      data-testid={`layer-tree-node-${data.kind}-${data.entityType ?? data.id}`}
      data-entity-id={data.kind === 'entity' ? (data.entityId ?? undefined) : undefined}
      data-entity-type={data.entityType}
      onClick={selectOrToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectOrToggle();
        }
      }}
      className={nodeRowClass({
        selected: node.isSelected && isEntity,
        dimmed: isGroup && !isVisible,
        willReceiveDrop: node.willReceiveDrop,
      })}
    >
      <NodeChevron isInternal={node.isInternal} isOpen={node.isOpen} />
      <NodeIcon data={data} />
      <NodeLabel data={data} isGroup={isGroup} isSection={isSection} isEntity={isEntity} />
      <NodeChildCount data={data} isCountable={isGroup || isSection} />
      <NodeActions
        kind={data.kind}
        isVisible={isVisible}
        isLocked={isLocked}
        onVisibilityToggle={handleVisibilityToggle}
        onLockToggle={handleLockToggle}
        onUnparent={handleUnparent}
        onDelete={handleDelete}
      />
    </div>
  );
}

type NodeControlApi = Pick<
  NodeRendererProps<TreeNode>['node'],
  'data' | 'isInternal' | 'select' | 'toggle'
>;

export function selectOrToggleLayerTreeNode(node: NodeControlApi) {
  if (node.data.kind === 'entity') {
    node.select();
    if (node.isInternal) node.toggle();
    return;
  }
  if (node.isInternal) node.toggle();
}

export function toggleLayerTreeGroupVisible(
  data: TreeNode,
  toggleLayerVisible: (type: string) => void,
) {
  if (data.kind === 'group' && data.entityType) toggleLayerVisible(data.entityType);
}

export function toggleLayerTreeGroupLocked(
  data: TreeNode,
  toggleLayerLocked: (type: string) => void,
) {
  if (data.kind === 'group' && data.entityType) toggleLayerLocked(data.entityType);
}

export function deleteLayerTreeEntity(
  data: TreeNode,
  isLocked: boolean,
  removeEntity: (entityId: string) => void,
) {
  if (isLocked) return;
  if (data.kind === 'entity' && data.entityId) removeEntity(data.entityId);
}

export function detachLayerTreeEntity(
  data: TreeNode,
  isLocked: boolean,
  reparentEntity: (entityId: string, target: { kind: 'none' }) => void,
) {
  if (isLocked) return;
  if (data.kind === 'entity' && data.entityId) reparentEntity(data.entityId, { kind: 'none' });
}

function nodeRowClass({
  selected,
  dimmed,
  willReceiveDrop,
}: {
  selected: boolean;
  dimmed: boolean;
  willReceiveDrop: boolean;
}) {
  return clsx(
    'flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none group',
    'hover:bg-white/5 rounded',
    selected && 'bg-cyan-500/15',
    dimmed && 'opacity-50',
    willReceiveDrop && 'bg-cyan-500/10 ring-1 ring-cyan-500/30',
  );
}

function NodeChevron({ isInternal, isOpen }: { isInternal: boolean; isOpen: boolean }) {
  if (!isInternal) return <span className="w-3.5 shrink-0" />;

  return (
    <FaChevronRight
      className={clsx(
        'size-3.5 text-zinc-600 transition-transform shrink-0',
        isOpen && 'rotate-90',
      )}
    />
  );
}

function NodeIcon({ data }: { data: TreeNode }) {
  const EntityIcon = data.entityType ? getEntityIcon(data.entityType) : null;

  return (
    <span className="text-xs shrink-0 w-4 text-center">
      {data.kind === 'group' && EntityIcon && (
        <EntityIcon className="size-3.5 text-zinc-500 inline" />
      )}
      {data.kind === 'section' && <span className="text-zinc-500">§</span>}
      {data.kind === 'entity' && EntityIcon && (
        <EntityIcon className="size-3.5 text-zinc-500 inline" />
      )}
    </span>
  );
}

function NodeLabel({
  data,
  isGroup,
  isSection,
  isEntity,
}: {
  data: TreeNode;
  isGroup: boolean;
  isSection: boolean;
  isEntity: boolean;
}) {
  return (
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
  );
}

function NodeChildCount({ data, isCountable }: { data: TreeNode; isCountable: boolean }) {
  if (!isCountable || !data.children) return null;
  return <span className="text-[10px] font-mono text-zinc-600 px-1">{data.children.length}</span>;
}

interface NodeActionsProps {
  kind: TreeNode['kind'];
  isVisible: boolean;
  isLocked: boolean;
  onVisibilityToggle: (e: MouseEvent) => void;
  onLockToggle: (e: MouseEvent) => void;
  onUnparent: (e: MouseEvent) => void;
  onDelete: (e: MouseEvent) => void;
}

function NodeActions(props: NodeActionsProps) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {props.kind === 'group' && (
        <GroupActions
          isVisible={props.isVisible}
          isLocked={props.isLocked}
          onVisibilityToggle={props.onVisibilityToggle}
          onLockToggle={props.onLockToggle}
        />
      )}
      {props.kind === 'entity' && (
        <EntityActions
          disabled={props.isLocked}
          onUnparent={props.onUnparent}
          onDelete={props.onDelete}
        />
      )}
    </div>
  );
}

function GroupActions({
  isVisible,
  isLocked,
  onVisibilityToggle,
  onLockToggle,
}: {
  isVisible: boolean;
  isLocked: boolean;
  onVisibilityToggle: (e: MouseEvent) => void;
  onLockToggle: (e: MouseEvent) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onVisibilityToggle}
        className="p-0.5 hover:bg-white/10 rounded"
        title={isVisible ? 'Hide layer' : 'Show layer'}
      >
        {isVisible ? (
          <FaEye className="size-3 text-zinc-500" />
        ) : (
          <FaEyeSlash className="size-3 text-zinc-600" />
        )}
      </button>
      <button
        type="button"
        onClick={onLockToggle}
        className="p-0.5 hover:bg-white/10 rounded"
        title={isLocked ? 'Unlock layer' : 'Lock layer'}
      >
        {isLocked ? (
          <FaLock className="size-3 text-amber-500" />
        ) : (
          <FaLockOpen className="size-3 text-zinc-600" />
        )}
      </button>
    </>
  );
}

function EntityActions({
  disabled,
  onUnparent,
  onDelete,
}: {
  disabled: boolean;
  onUnparent: (e: MouseEvent) => void;
  onDelete: (e: MouseEvent) => void;
}) {
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onUnparent}
        className={clsx('p-0.5 rounded', disabled ? 'cursor-not-allowed' : 'hover:bg-white/10')}
        title={disabled ? 'Layer is locked' : 'Detach from parent'}
      >
        <FaLink
          className={clsx(
            'size-3',
            disabled ? 'text-zinc-700' : 'text-zinc-600 hover:text-amber-400',
          )}
        />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        className={clsx('p-0.5 rounded', disabled ? 'cursor-not-allowed' : 'hover:bg-red-500/20')}
        title={disabled ? 'Layer is locked' : 'Delete entity'}
      >
        <FaTrash
          className={clsx(
            'size-3',
            disabled ? 'text-zinc-700' : 'text-zinc-600 hover:text-red-400',
          )}
        />
      </button>
    </>
  );
}
