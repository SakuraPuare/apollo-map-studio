import type { ParentTarget } from '@/lib/entityOps';
import type { LaneEntity, RoadEntity, RSUEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { TOP_LEVEL_ORDER, TYPE_LABELS, entityDisplayId } from './constants';
import type { DropKind, TreeNode } from './types';

export function buildTree(entities: ReadonlyMap<string, MapEntity>): TreeNode[] {
  const roads: RoadEntity[] = [];
  const junctions = new Map<string, MapEntity>();
  for (const e of entities.values()) {
    if (e.entityType === 'road') roads.push(e);
    else if (e.entityType === 'junction') junctions.set(e.id, e);
  }

  const laneSection = new Map<string, { roadId: string; sectionId: string }>();
  for (const r of roads) {
    for (const s of r.sections) {
      for (const lid of s.laneIds) {
        if (!laneSection.has(lid)) laneSection.set(lid, { roadId: r.id, sectionId: s.id });
      }
    }
  }

  const junctionChildren = new Map<string, TreeNode[]>();
  const sectionChildren = new Map<string, TreeNode[]>();
  const groupChildren = new Map<string, TreeNode[]>();

  const ensureGroup = (k: string): TreeNode[] => ensureChildren(groupChildren, k);
  const ensureJunction = (k: string): TreeNode[] => ensureChildren(junctionChildren, k);
  const ensureSection = (k: string): TreeNode[] => ensureChildren(sectionChildren, k);

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

    ensureGroup(e.entityType).push(baseNode({}));
  }

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
  for (const k of groupChildren.keys()) pushGroup(k);

  return groups;
}

function ensureChildren(childrenByKey: Map<string, TreeNode[]>, key: string): TreeNode[] {
  let children = childrenByKey.get(key);
  if (!children) {
    children = [];
    childrenByKey.set(key, children);
  }
  return children;
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
