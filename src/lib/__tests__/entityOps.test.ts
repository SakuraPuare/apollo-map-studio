/**
 * entityOps — Apollo proto 反腐层（R2 closed risk）。
 *
 * 这个 module 是 UI 层与 `@/core/geometry/apolloCompile` 之间的唯一接缝。
 * 一旦它的契约松动（类型守卫漏判、setter 不复制、coords 拿错形状），
 * 上层 7 个 import 此模块的 UI 文件就会在 proto v2 升级时一齐爆炸。
 *
 * 测试策略：
 *   - 不 mock apolloCompile，跑真实代码
 *   - DrawingEntity（polyline/bezier/arc/rect/polygon）走 entityOps 自己的分支
 *   - ApolloEntity（lane）由 createApolloEntity 真实工厂产出 fixture
 */
import { describe, it, expect } from 'vitest';
import {
  isDrawingEntity,
  isApolloEntityType,
  isAreaEntity,
  getEditPoints,
  setEditPoint,
  setAllEditPoints,
  moveEntity,
  deleteVertex,
  compileEntity,
  createEntity,
  entityCoords,
  reparent,
  canReparent,
  cascadeDeleteRefsFull,
} from '../entityOps';
import type {
  JunctionEntity,
  OverlapEntity,
  PNCJunctionEntity,
  RoadEntity,
  RSUEntity,
  LaneEntity as ApolloLaneEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import type {
  PolylineEntity,
  BezierEntity,
  ArcEntity,
  RectEntity,
  PolygonEntity,
  CatmullRomEntity,
} from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';

// ── Fixtures ───────────────────────────────────────────────────

function polyline(): PolylineEntity {
  return {
    id: 'pl-1',
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ],
  };
}

function bezier(): BezierEntity {
  return {
    id: 'bz-1',
    entityType: 'bezier',
    anchors: [
      { point: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 0.5, y: 0.5 } },
      { point: { x: 1, y: 1 }, handleIn: { x: 0.5, y: 1 }, handleOut: null },
    ],
  };
}

function arc(): ArcEntity {
  return {
    id: 'ar-1',
    entityType: 'arc',
    start: { x: 0, y: 0 },
    mid: { x: 1, y: 1 },
    end: { x: 2, y: 0 },
  };
}

function rect(): RectEntity {
  return {
    id: 'rc-1',
    entityType: 'rect',
    p1: { x: 0, y: 0 },
    p2: { x: 2, y: 1 },
    rotation: 0,
  };
}

function polygon(): PolygonEntity {
  return {
    id: 'pg-1',
    entityType: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  };
}

function catmull(): CatmullRomEntity {
  return {
    id: 'cm-1',
    entityType: 'catmullRom',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

/** 用真实工厂建一个 lane（避免手写厚重 fixture） */
function makeLane(): LaneEntity {
  const lane = createEntity(
    'lane',
    'drawPolyline',
    [
      [116.0, 30.0],
      [116.001, 30.0],
      [116.002, 30.0],
    ],
    [],
  ) as LaneEntity;
  return lane;
}

// ── Type guards ────────────────────────────────────────────────

describe('类型守卫', () => {
  it('isDrawingEntity 识别 6 种 drawing 类型', () => {
    expect(isDrawingEntity(polyline())).toBe(true);
    expect(isDrawingEntity(catmull())).toBe(true);
    expect(isDrawingEntity(bezier())).toBe(true);
    expect(isDrawingEntity(arc())).toBe(true);
    expect(isDrawingEntity(rect())).toBe(true);
    expect(isDrawingEntity(polygon())).toBe(true);
  });

  it('isApolloEntityType 是 isDrawingEntity 的补集（lane 是 Apollo）', () => {
    expect(isApolloEntityType(makeLane())).toBe(true);
    expect(isApolloEntityType(polyline())).toBe(false);
  });

  it('isAreaEntity：rect/polygon/lane = true; polyline/arc/bezier/catmull = false', () => {
    expect(isAreaEntity(rect())).toBe(true);
    expect(isAreaEntity(polygon())).toBe(true);
    expect(isAreaEntity(makeLane())).toBe(true); // lane hitTest 走面检测
    expect(isAreaEntity(polyline())).toBe(false);
    expect(isAreaEntity(catmull())).toBe(false);
    expect(isAreaEntity(arc())).toBe(false);
    expect(isAreaEntity(bezier())).toBe(false);
  });
});

// ── getEditPoints ──────────────────────────────────────────────

describe('getEditPoints', () => {
  it('polyline / catmullRom / polygon 直接返回 .points', () => {
    expect(getEditPoints(polyline())).toEqual(polyline().points);
    expect(getEditPoints(catmull())).toEqual(catmull().points);
    expect(getEditPoints(polygon())).toEqual(polygon().points);
  });

  it('bezier 提取每个 anchor.point', () => {
    const b = bezier();
    expect(getEditPoints(b)).toEqual(b.anchors.map((a) => a.point));
  });

  it('arc 返回 [start, mid, end]', () => {
    const a = arc();
    expect(getEditPoints(a)).toEqual([a.start, a.mid, a.end]);
  });

  it('rect 返回 [p1, p2]', () => {
    const r = rect();
    expect(getEditPoints(r)).toEqual([r.p1, r.p2]);
  });

  it('lane 经 apolloCompile 取出 centralCurve 控制点', () => {
    const lane = makeLane();
    const pts = getEditPoints(lane);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    // 第一个点 ≈ 起点，最后一个点 ≈ 终点
    expect(pts[0]!.x).toBeCloseTo(116.0, 6);
    expect(pts[pts.length - 1]!.x).toBeCloseTo(116.002, 6);
  });
});

// ── Apollo-only mutators (drawing entities are no-op) ──────────

describe('Apollo entity 编辑代理', () => {
  it('setEditPoint 对 lane 修改单点（不可变 / 返回新对象）', () => {
    const lane = makeLane();
    const before = getEditPoints(lane);
    const next = setEditPoint(lane, 0, { x: 999, y: 999 });
    const after = getEditPoints(next);
    expect(next).not.toBe(lane);
    expect(after[0]).toEqual({ x: 999, y: 999 });
    // 原对象不被修改
    expect(getEditPoints(lane)).toEqual(before);
  });

  it('setAllEditPoints 对 lane 整体替换控制点', () => {
    const lane = makeLane();
    const newPts = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
    ];
    const next = setAllEditPoints(lane, newPts);
    expect(getEditPoints(next)).toEqual(newPts);
  });

  it('setEditPoint 对 drawing entity 返回不变（按设计约定）', () => {
    const p = polyline();
    expect(setEditPoint(p, 0, { x: 99, y: 99 })).toBe(p);
  });

  it('moveEntity 对 lane 平移所有点', () => {
    const lane = makeLane();
    const moved = moveEntity(lane, 0.01, 0.02);
    const movedPts = getEditPoints(moved);
    const orig = getEditPoints(lane);
    for (let i = 0; i < orig.length; i++) {
      expect(movedPts[i]!.x).toBeCloseTo(orig[i]!.x + 0.01, 9);
      expect(movedPts[i]!.y).toBeCloseTo(orig[i]!.y + 0.02, 9);
    }
  });

  it('moveEntity 对 drawing entity 返回不变', () => {
    const p = polyline();
    expect(moveEntity(p, 1, 1)).toBe(p);
  });

  it('deleteVertex 对 lane：超过最小点数时删除（4 → 3 点）', () => {
    // lane 的 editPoints 是中心线（折线），min=2。4 点 → 删一个 → 3 点
    const lane = createEntity(
      'lane',
      'drawPolyline',
      [
        [116.0, 30.0],
        [116.001, 30.0],
        [116.002, 30.0],
        [116.003, 30.0],
      ],
      [],
    ) as LaneEntity;
    const before = getEditPoints(lane);
    const next = deleteVertex(lane, 1);
    expect(next).not.toBeNull();
    expect(getEditPoints(next!).length).toBe(before.length - 1);
  });

  it('deleteVertex 对 lane：3 → 2 点允许（lane 是折线，min=2 不是 3）', () => {
    // 旧行为把 lane 当 area，min=3；2026-04 修复后 lane 的 editPoints
    // 是 centralCurve 折线，min=2 才是正确语义。
    const lane = makeLane(); // 3 点
    const next = deleteVertex(lane, 1);
    expect(next).not.toBeNull();
    expect(getEditPoints(next!).length).toBe(2);
  });

  it('deleteVertex 对 lane 在最小点数时返回 null（2 点不能再删）', () => {
    const lane = createEntity(
      'lane',
      'drawPolyline',
      [
        [116.0, 30.0],
        [116.001, 30.0],
      ],
      [],
    ) as LaneEntity;
    expect(deleteVertex(lane, 0)).toBeNull();
  });
});

// ── compileEntity / entityCoords ───────────────────────────────

describe('compileEntity / entityCoords', () => {
  it('compileEntity 对 lane 产出非空 GeoJSON features', () => {
    const features = compileEntity(makeLane());
    expect(features.length).toBeGreaterThan(0);
    for (const f of features) {
      expect(f.type).toBe('Feature');
      expect(['LineString', 'Polygon', 'Point']).toContain(f.geometry.type);
    }
  });

  it('compileEntity 对 drawing entity 返回 [] (按反腐层契约)', () => {
    expect(compileEntity(polyline())).toEqual([]);
    expect(compileEntity(rect())).toEqual([]);
  });

  it('entityCoords 对 lane 包含左右边界（≥ 2 × 中心点数）', () => {
    const lane = makeLane();
    const center = getEditPoints(lane);
    const coords = entityCoords(lane);
    // lane 的 entityCoords 拼接 left + right，所以总数 = 2 × center
    expect(coords.length).toBe(2 * center.length);
  });

  it('entityCoords 对 drawing entity 退化为 [x, y] 列表', () => {
    const p = polyline();
    expect(entityCoords(p)).toEqual(p.points.map((pt) => [pt.x, pt.y]));
  });
});

// ── createEntity 工厂 ──────────────────────────────────────────

describe('createEntity', () => {
  it('用 drawPolyline 产出可编辑的 lane', () => {
    const lane = createEntity(
      'lane',
      'drawPolyline',
      [
        [116, 30],
        [116.0005, 30],
        [116.001, 30],
      ],
      [],
    ) as LaneEntity;
    expect(lane.entityType).toBe('lane');
    expect(lane.id.length).toBeGreaterThan(0);
    expect(getEditPoints(lane).length).toBeGreaterThanOrEqual(2);
    expect(lane.length).toBeGreaterThan(0);
  });
});

// ── reparent / canReparent ─────────────────────────────────────
//
// 这些测试围绕 LayerTree 的拖拽闭环，把 Apollo 1:N 外键的不变量锁住：
//   - Lane 同时只能挂一个父（junctionId XOR 唯一一个 RoadSection.laneIds）
//   - Road/RSU 的 junctionId 是单值，不需要反向清理
//   - 拒绝跨语义拖拽（如 lane → road（unparent group）以外的非法 target）

function makeJunction(id: string): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: { points: [] },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

function makeRoad(id: string, junctionId: string | null = null): RoadEntity {
  return {
    id,
    entityType: 'road',
    sections: [{ id: `${id}_s0`, laneIds: [] }],
    junctionId,
    type: 'CITY_ROAD',
  };
}

function makeRSU(id: string, junctionId: string | null = null): RSUEntity {
  return { id, entityType: 'rsu', junctionId, overlapIds: [] };
}

function asMap(...entities: MapEntity[]): Map<string, MapEntity> {
  return new Map(entities.map((e) => [e.id, e]));
}

describe('reparent: Lane → Junction', () => {
  it('设置 junctionId，并把 lane 从所有 RoadSection 中移除', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = null;
    const j = makeJunction('j_1');
    const road = makeRoad('r_1');
    road.sections[0]!.laneIds = [lane.id, 'other_lane'];

    const all = asMap(lane, j, road);
    const result = reparent(lane, { kind: 'junction', id: 'j_1' }, all);

    expect(result.rejected).toBeUndefined();
    expect(result.changes.size).toBe(2);
    const newLane = result.changes.get(lane.id) as ApolloLaneEntity;
    const newRoad = result.changes.get(road.id) as RoadEntity;
    expect(newLane.junctionId).toBe('j_1');
    expect(newRoad.sections[0]!.laneIds).toEqual(['other_lane']);
  });

  it('已经在目标 junction 下时是 no-op', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = 'j_1';
    const j = makeJunction('j_1');
    const result = reparent(lane, { kind: 'junction', id: 'j_1' }, asMap(lane, j));
    expect(result.changes.size).toBe(0);
    expect(result.rejected).toBeUndefined();
  });

  it('target 不存在 / 类型错则拒绝', () => {
    const lane = makeLane();
    const result = reparent(lane, { kind: 'junction', id: 'j_missing' }, asMap(lane));
    expect(result.rejected).toBeTruthy();
  });
});

describe('reparent: Lane → RoadSection', () => {
  it('把 lane 加进目标 section、清空 junctionId、从其它 section 移除', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = 'j_1';
    const j = makeJunction('j_1');
    const r1 = makeRoad('r_1');
    const r2 = makeRoad('r_2');
    r2.sections[0]!.laneIds = [lane.id]; // 旧归属在 r_2

    const all = asMap(lane, j, r1, r2);
    const result = reparent(lane, { kind: 'roadSection', roadId: 'r_1', sectionId: 'r_1_s0' }, all);

    expect(result.rejected).toBeUndefined();
    const newLane = result.changes.get(lane.id) as ApolloLaneEntity;
    const newR1 = result.changes.get('r_1') as RoadEntity;
    const newR2 = result.changes.get('r_2') as RoadEntity;
    expect(newLane.junctionId).toBeNull();
    expect(newR1.sections[0]!.laneIds).toContain(lane.id);
    expect(newR2.sections[0]!.laneIds).not.toContain(lane.id);
  });

  it('section 不存在则自动创建一个', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = null;
    const r = makeRoad('r_1');
    r.sections = []; // 没 section
    const all = asMap(lane, r);
    const result = reparent(
      lane,
      { kind: 'roadSection', roadId: 'r_1', sectionId: 'auto_s0' },
      all,
    );
    expect(result.rejected).toBeUndefined();
    const newR = result.changes.get('r_1') as RoadEntity;
    expect(newR.sections.length).toBe(1);
    expect(newR.sections[0]!.id).toBe('auto_s0');
    expect(newR.sections[0]!.laneIds).toEqual([lane.id]);
  });

  it('目标 road 不存在时拒绝', () => {
    const lane = makeLane();

    const result = reparent(
      lane,
      { kind: 'roadSection', roadId: 'missing', sectionId: 's0' },
      asMap(lane),
    );

    expect(result.rejected).toBe('target road missing');
  });

  it('lane 已在目标 section 且无 junctionId 时是 no-op', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = null;
    const road = makeRoad('r_1');
    road.sections[0]!.laneIds = [lane.id];

    const result = reparent(
      lane,
      { kind: 'roadSection', roadId: 'r_1', sectionId: road.sections[0]!.id },
      asMap(lane, road),
    );

    expect(result.rejected).toBeUndefined();
    expect(result.changes.size).toBe(0);
  });
});

describe('reparent: Lane → Road（自动取首个 section）', () => {
  it('委派到 roadSection 落到 road.sections[0]', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = null;
    const r = makeRoad('r_1');
    const result = reparent(lane, { kind: 'road', id: 'r_1' }, asMap(lane, r));
    expect(result.rejected).toBeUndefined();
    const newR = result.changes.get('r_1') as RoadEntity;
    expect(newR.sections[0]!.laneIds).toEqual([lane.id]);
  });

  it('target road 不存在时拒绝', () => {
    const lane = makeLane();
    const result = reparent(lane, { kind: 'road', id: 'missing' }, asMap(lane));
    expect(result.rejected).toBe('target is not a road');
  });
});

describe('reparent: Lane → none（解除归属）', () => {
  it('清空 junctionId 并从所有 section 移除', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = 'j_1';
    const r = makeRoad('r_1');
    r.sections[0]!.laneIds = [lane.id];
    const all = asMap(lane, r);
    const result = reparent(lane, { kind: 'none' }, all);
    expect(result.rejected).toBeUndefined();
    const newLane = result.changes.get(lane.id) as ApolloLaneEntity;
    const newR = result.changes.get('r_1') as RoadEntity;
    expect(newLane.junctionId).toBeNull();
    expect(newR.sections[0]!.laneIds).not.toContain(lane.id);
  });

  it('lane 无 junctionId 且不在任何 road 下时是 no-op', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = null;

    const result = reparent(lane, { kind: 'none' }, asMap(lane));

    expect(result.rejected).toBeUndefined();
    expect(result.changes.size).toBe(0);
  });
});

describe('reparent: Road / RSU → Junction', () => {
  it('Road.junctionId 单字段更新', () => {
    const r = makeRoad('r_1', null);
    const j = makeJunction('j_1');
    const result = reparent(r, { kind: 'junction', id: 'j_1' }, asMap(r, j));
    expect((result.changes.get('r_1') as RoadEntity).junctionId).toBe('j_1');
  });

  it('Road 已经在目标 junction 下时是 no-op，解除 none 时清空', () => {
    const road = makeRoad('r_1', 'j_1');
    const j = makeJunction('j_1');

    expect(reparent(road, { kind: 'junction', id: 'j_1' }, asMap(road, j)).changes.size).toBe(0);

    const none = reparent(road, { kind: 'none' }, asMap(road));
    expect((none.changes.get('r_1') as RoadEntity).junctionId).toBeNull();
    expect(reparent(makeRoad('r_2'), { kind: 'none' }, asMap(makeRoad('r_2'))).changes.size).toBe(
      0,
    );
  });

  it('Road target 不是 junction 时拒绝', () => {
    const road = makeRoad('r_1');

    expect(reparent(road, { kind: 'junction', id: 'missing' }, asMap(road)).rejected).toBe(
      'target is not a junction',
    );
  });

  it('RSU.junctionId 单字段更新', () => {
    const rsu = makeRSU('rsu_1', null);
    const j = makeJunction('j_1');
    const result = reparent(rsu, { kind: 'junction', id: 'j_1' }, asMap(rsu, j));
    expect((result.changes.get('rsu_1') as RSUEntity).junctionId).toBe('j_1');
  });

  it('RSU 已经在目标 junction 下时是 no-op，解除 none 时清空', () => {
    const rsu = makeRSU('rsu_1', 'j_1');
    const j = makeJunction('j_1');

    expect(reparent(rsu, { kind: 'junction', id: 'j_1' }, asMap(rsu, j)).changes.size).toBe(0);

    const none = reparent(rsu, { kind: 'none' }, asMap(rsu));
    expect((none.changes.get('rsu_1') as RSUEntity).junctionId).toBeNull();
    expect(reparent(makeRSU('rsu_2'), { kind: 'none' }, asMap(makeRSU('rsu_2'))).changes.size).toBe(
      0,
    );
  });

  it('RSU target 不是 junction 时拒绝', () => {
    const rsu = makeRSU('rsu_1');

    expect(reparent(rsu, { kind: 'junction', id: 'missing' }, asMap(rsu)).rejected).toBe(
      'target is not a junction',
    );
  });
});

describe('reparent: 非法路径', () => {
  it('drawing primitive 不能 reparent', () => {
    const r = reparent(polyline(), { kind: 'junction', id: 'j_1' }, asMap(polyline()));
    expect(r.rejected).toBeTruthy();
  });

  it('canReparent 是 reparent 的 boolean shim', () => {
    const lane = makeLane();
    const j = makeJunction('j_1');
    expect(canReparent(lane, { kind: 'junction', id: 'j_1' }, asMap(lane, j))).toBe(true);
    expect(canReparent(lane, { kind: 'junction', id: 'j_X' }, asMap(lane))).toBe(false);
  });
});

// ── cascadeDeleteRefsFull ──────────────────────────────────────
//
// 删除一个对象时，所有指向它的外键都要被清掉，否则导出 map.bin
// 加载就 NPE。这里覆盖最常见的 5 条路径。

describe('cascadeDeleteRefsFull', () => {
  it('removedIds 为空时直接 no-op', () => {
    const lane = makeLane();
    const result = cascadeDeleteRefsFull(new Set(), asMap(lane)).changes;
    expect(result.size).toBe(0);
  });

  it('删除 Junction 时，所有指向它的 lane.junctionId / road.junctionId / rsu.junctionId 被置空', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).junctionId = 'j_1';
    const road = makeRoad('r_1', 'j_1');
    const rsu = makeRSU('rsu_1', 'j_1');
    const j = makeJunction('j_1');
    const result = cascadeDeleteRefsFull(new Set(['j_1']), asMap(lane, road, rsu, j)).changes;
    expect((result.get(lane.id) as ApolloLaneEntity).junctionId).toBeNull();
    expect((result.get('r_1') as RoadEntity).junctionId).toBeNull();
    expect((result.get('rsu_1') as RSUEntity).junctionId).toBeNull();
    // junction itself shouldn't appear in changes (it's the deletion target)
    expect(result.has('j_1')).toBe(false);
  });

  it('删除 Lane 时，所有 RoadSection.laneIds 中移除', () => {
    const lane = makeLane();
    const r1 = makeRoad('r_1');
    r1.sections[0]!.laneIds = [lane.id, 'other'];
    const r2 = makeRoad('r_2');
    r2.sections[0]!.laneIds = [lane.id];
    const result = cascadeDeleteRefsFull(new Set([lane.id]), asMap(lane, r1, r2)).changes;
    expect((result.get('r_1') as RoadEntity).sections[0]!.laneIds).toEqual(['other']);
    expect((result.get('r_2') as RoadEntity).sections[0]!.laneIds).toEqual([]);
  });

  it('删除 Lane 时，其它 Lane 的 topology 数组也被清理', () => {
    const target = makeLane();
    const other = makeLane();
    (other as ApolloLaneEntity).id = 'lane_other';
    (other as ApolloLaneEntity).predecessorIds = [target.id, 'keep'];
    (other as ApolloLaneEntity).successorIds = [target.id];
    const result = cascadeDeleteRefsFull(new Set([target.id]), asMap(target, other)).changes;
    const updated = result.get('lane_other') as ApolloLaneEntity;
    expect(updated.predecessorIds).toEqual(['keep']);
    expect(updated.successorIds).toEqual([]);
  });

  it('删除 Overlap 时，所有 entity.overlapIds 被清理', () => {
    const lane = makeLane();
    (lane as ApolloLaneEntity).overlapIds = ['ov_1', 'ov_2'];
    const j = makeJunction('j_1');
    j.overlapIds = ['ov_1'];
    const result = cascadeDeleteRefsFull(new Set(['ov_1']), asMap(lane, j)).changes;
    expect((result.get(lane.id) as ApolloLaneEntity).overlapIds).toEqual(['ov_2']);
    expect((result.get('j_1') as JunctionEntity).overlapIds).toEqual([]);
  });

  it('删除 overlap participant 后仍有两个以上对象时只 patch overlap.objects', () => {
    const target = makeLane();
    const keepLane = makeLane();
    (keepLane as ApolloLaneEntity).id = 'lane_keep';
    const j = makeJunction('j_keep');
    const overlap: OverlapEntity = {
      id: 'ov_keep',
      entityType: 'overlap',
      objects: [
        { objectType: 'lane', objectId: target.id, laneOverlapInfo: { startS: 0, endS: 1 } },
        { objectType: 'lane', objectId: keepLane.id, laneOverlapInfo: { startS: 1, endS: 2 } },
        { objectType: 'junction', objectId: j.id },
      ],
      regionOverlaps: [],
    };

    const result = cascadeDeleteRefsFull(new Set([target.id]), asMap(target, keepLane, j, overlap));

    expect(result.cascadeRemoved.size).toBe(0);
    expect((result.changes.get('ov_keep') as OverlapEntity).objects.map((o) => o.objectId)).toEqual(
      [keepLane.id, j.id],
    );
  });

  it('删除 overlap participant 后不足两个对象时级联删除 overlap 并清理其它 overlapIds', () => {
    const target = makeLane();
    const survivor = makeJunction('j_survivor');
    survivor.overlapIds = ['ov_remove', 'ov_other'];
    const overlap: OverlapEntity = {
      id: 'ov_remove',
      entityType: 'overlap',
      objects: [
        { objectType: 'lane', objectId: target.id, laneOverlapInfo: { startS: 0, endS: 1 } },
        { objectType: 'junction', objectId: survivor.id },
      ],
      regionOverlaps: [],
    };

    const result = cascadeDeleteRefsFull(new Set([target.id]), asMap(target, survivor, overlap));

    expect(result.cascadeRemoved).toEqual(new Set(['ov_remove']));
    expect(result.changes.has('ov_remove')).toBe(false);
    expect((result.changes.get('j_survivor') as JunctionEntity).overlapIds).toEqual(['ov_other']);
  });

  it('删除 PNC passage 引用目标时清理 lane/signal/yield/stopSign 数组', () => {
    const pnc: PNCJunctionEntity = {
      id: 'pnc_1',
      entityType: 'pncJunction',
      polygon: { points: [] },
      overlapIds: [],
      passageGroups: [
        {
          id: 'pg_1',
          passages: [
            {
              id: 'passage_1',
              laneIds: ['lane_gone', 'lane_keep'],
              signalIds: ['signal_gone', 'signal_keep'],
              yieldIds: ['yield_gone', 'yield_keep'],
              stopSignIds: ['stop_gone', 'stop_keep'],
              type: 'ENTRANCE',
            },
          ],
        },
      ],
    };

    const result = cascadeDeleteRefsFull(
      new Set(['lane_gone', 'signal_gone', 'yield_gone', 'stop_gone']),
      asMap(pnc),
    );

    const passage = (result.changes.get('pnc_1') as PNCJunctionEntity).passageGroups[0]!
      .passages[0]!;
    expect(passage.laneIds).toEqual(['lane_keep']);
    expect(passage.signalIds).toEqual(['signal_keep']);
    expect(passage.yieldIds).toEqual(['yield_keep']);
    expect(passage.stopSignIds).toEqual(['stop_keep']);
  });
});
