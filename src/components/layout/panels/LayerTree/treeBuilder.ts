import type { ParentTarget } from '@/lib/entityOps';
import type { LaneEntity, RoadEntity, RSUEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { TOP_LEVEL_ORDER, TYPE_LABELS, entityDisplayId } from './constants';
import type { DropKind, TreeNode } from './types';

export function buildTree(entities: ReadonlyMap<string, MapEntity>): TreeNode[] {
  const ctx = createBuildContext(entities);
  for (const entity of entities.values()) {
    addEntityNode(ctx, entity);
  }
  return orderedGroups(ctx.groupChildren);
}

interface BuildContext {
  junctions: ReadonlyMap<string, MapEntity>;
  laneSection: ReadonlyMap<string, { roadId: string; sectionId: string }>;
  junctionChildren: Map<string, TreeNode[]>;
  sectionChildren: Map<string, TreeNode[]>;
  groupChildren: Map<string, TreeNode[]>;
}

function createBuildContext(entities: ReadonlyMap<string, MapEntity>): BuildContext {
  const roads: RoadEntity[] = [];
  const junctions = new Map<string, MapEntity>();
  for (const e of entities.values()) {
    if (e.entityType === 'road') roads.push(e);
    else if (e.entityType === 'junction') junctions.set(e.id, e);
  }

  return {
    junctions,
    laneSection: collectLaneSections(roads),
    junctionChildren: new Map(),
    sectionChildren: new Map(),
    groupChildren: new Map(),
  };
}

function collectLaneSections(roads: RoadEntity[]) {
  const sections = new Map<string, { roadId: string; sectionId: string }>();
  for (const r of roads) {
    for (const s of r.sections) {
      for (const lid of s.laneIds) {
        if (!sections.has(lid)) sections.set(lid, { roadId: r.id, sectionId: s.id });
      }
    }
  }
  return sections;
}

function addEntityNode(ctx: BuildContext, entity: MapEntity): void {
  switch (entity.entityType) {
    case 'lane':
      addLaneNode(ctx, entity);
      return;
    case 'road':
      addRoadNode(ctx, entity);
      return;
    case 'junction':
      addJunctionNode(ctx, entity);
      return;
    case 'rsu':
      addRSUNode(ctx, entity);
      return;
    default:
      ensureGroup(ctx, entity.entityType).push(baseEntityNode(entity, {}));
  }
}

function addLaneNode(ctx: BuildContext, lane: LaneEntity): void {
  if (lane.junctionId && ctx.junctions.has(lane.junctionId)) {
    ensureJunction(ctx, lane.junctionId).push(baseEntityNode(lane, {}));
    return;
  }

  const section = ctx.laneSection.get(lane.id);
  if (section) {
    ensureSection(ctx, section.roadId, section.sectionId).push(baseEntityNode(lane, {}));
    return;
  }

  ensureGroup(ctx, 'lane').push(baseEntityNode(lane, {}));
}

function addRoadNode(ctx: BuildContext, road: RoadEntity): void {
  const node = baseEntityNode(road, {
    children: road.sections.map((section) => sectionNode(ctx, road, section.id)),
    dropKind: 'road',
    parentTarget: { kind: 'road', id: road.id },
  });

  if (road.junctionId && ctx.junctions.has(road.junctionId)) {
    ensureJunction(ctx, road.junctionId).push(node);
  } else {
    ensureGroup(ctx, 'road').push(node);
  }
}

function addJunctionNode(ctx: BuildContext, entity: MapEntity): void {
  ensureGroup(ctx, 'junction').push(
    baseEntityNode(entity, {
      children: ensureJunction(ctx, entity.id),
      dropKind: 'junction',
      parentTarget: { kind: 'junction', id: entity.id },
    }),
  );
}

function addRSUNode(ctx: BuildContext, rsu: RSUEntity): void {
  if (rsu.junctionId && ctx.junctions.has(rsu.junctionId)) {
    ensureJunction(ctx, rsu.junctionId).push(baseEntityNode(rsu, {}));
    return;
  }
  ensureGroup(ctx, 'rsu').push(baseEntityNode(rsu, {}));
}

function baseEntityNode(entity: MapEntity, extra: Partial<TreeNode>): TreeNode {
  return {
    id: `entity:${entity.id}`,
    name: entityDisplayId(entity.id),
    kind: 'entity',
    entityType: entity.entityType,
    entityId: entity.id,
    dropKind: 'none',
    ...extra,
  };
}

function sectionNode(ctx: BuildContext, road: RoadEntity, sectionId: string): TreeNode {
  return {
    id: `section:${road.id}:${sectionId}`,
    name: `Section ${sectionId}`,
    kind: 'section',
    dropKind: 'roadSection',
    parentTarget: { kind: 'roadSection', roadId: road.id, sectionId },
    children: ensureSection(ctx, road.id, sectionId),
  };
}

function orderedGroups(groupChildren: Map<string, TreeNode[]>): TreeNode[] {
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

function ensureGroup(ctx: BuildContext, key: string): TreeNode[] {
  return ensureChildren(ctx.groupChildren, key);
}

function ensureJunction(ctx: BuildContext, junctionId: string): TreeNode[] {
  return ensureChildren(ctx.junctionChildren, junctionId);
}

function ensureSection(ctx: BuildContext, roadId: string, sectionId: string): TreeNode[] {
  return ensureChildren(ctx.sectionChildren, `${roadId}:${sectionId}`);
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
