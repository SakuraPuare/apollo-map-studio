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
} from '../entityOps';
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
    // lane 在 isAreaEntity 下 min=3。需要 4 个起始点才能走删除分支
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

  it('deleteVertex 对 lane 在最小点数时返回 null', () => {
    // makeLane 默认 3 点（== min for area），删任意一个都应回 null
    const lane = makeLane();
    expect(deleteVertex(lane, 1)).toBeNull();
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
