/**
 * entityMutations — drag / vertex 编辑核心。
 *
 * 这里是 useMapEventRouter 的 onMouseUp / Delete 键真实落入的纯函数层。
 * Bug 在这里出最容易：拖拽计算位置错 → 选中元素跳变；删除最后一个顶点
 * 不返回 null → entity 卡在 1-顶点状态再也不能选中。
 *
 * 测试只 cover drawing entities（不依赖 apolloCompile），保持单元测试纯净。
 */
import { describe, it, expect } from 'vitest';
import {
  deleteVertex,
  toggleSmooth,
  applyDrag,
  getDragCenter,
  toggleSmoothApollo,
} from '../entityMutations';
import type { BezierAnchor } from '@/core/geometry/interpolate';
import { getEditPoints } from '@/lib/entityOps';
import {
  getSource,
  getSourceRect,
  type ApolloEntity,
  type AreaEntity,
  type LaneEntity,
} from '@/types/apollo';
import type {
  PolylineEntity,
  CatmullRomEntity,
  BezierEntity,
  PolygonEntity,
  ArcEntity,
  RectEntity,
} from '@/types/entities';
import { createApolloEntity } from '@/core/geometry/apolloCompile';

function expectGeoPointClose(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

function expectLngLatClose(
  actual: readonly [number, number] | null,
  expected: readonly [number, number],
) {
  expect(actual).not.toBeNull();
  expect(actual![0]).toBeCloseTo(expected[0], 8);
  expect(actual![1]).toBeCloseTo(expected[1], 8);
}

function makeBezierApolloLane(): LaneEntity {
  const anchors: BezierAnchor[] = [
    { point: [0, 0], handleIn: null, handleOut: [1, 0] },
    { point: [3, 0], handleIn: [2, 0], handleOut: [4, 0] },
    { point: [6, 0], handleIn: [5, 0], handleOut: null },
  ];
  return createApolloEntity('lane', 'drawBezier', [], anchors) as LaneEntity;
}

// ── deleteVertex ────────────────────────────────────────────────

describe('deleteVertex (drawing entities)', () => {
  it('polyline > 2 点：删除指定顶点', () => {
    const e: PolylineEntity = {
      id: 'pl',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    };
    const next = deleteVertex(e, 1);
    expect(next).not.toBeNull();
    expect((next as PolylineEntity).points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('polyline = 2 点：返回 null（必须删除整个 entity）', () => {
    const e: PolylineEntity = {
      id: 'pl',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    };
    expect(deleteVertex(e, 0)).toBeNull();
  });

  it('polygon > 3 点：删除一个顶点', () => {
    const e: PolygonEntity = {
      id: 'pg',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    const next = deleteVertex(e, 1);
    expect(next).not.toBeNull();
    expect((next as PolygonEntity).points.length).toBe(3);
  });

  it('polygon = 3 点：返回 null（多边形最少 3 顶点）', () => {
    const e: PolygonEntity = {
      id: 'pg',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
    };
    expect(deleteVertex(e, 1)).toBeNull();
  });

  it('bezier > 2 anchor：删除指定 anchor', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 1, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 2, y: 0 }, handleIn: null, handleOut: null },
      ],
    };
    const next = deleteVertex(e, 0);
    expect(next).not.toBeNull();
    expect((next as BezierEntity).anchors.length).toBe(2);
  });

  it('arc 不支持顶点删除：返回 entity 自身', () => {
    const e: ArcEntity = {
      id: 'ar',
      entityType: 'arc',
      start: { x: 0, y: 0 },
      mid: { x: 1, y: 1 },
      end: { x: 2, y: 0 },
    };
    expect(deleteVertex(e, 1)).toBe(e);
  });

  it('catmullRom > 2 点：删除指定点', () => {
    const e: CatmullRomEntity = {
      id: 'cm',
      entityType: 'catmullRom',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
    };
    const next = deleteVertex(e, 1);
    expect(next).not.toBeNull();
    expect((next as CatmullRomEntity).points.length).toBe(2);
  });

  it('Apollo rotated-rect source entity 不支持删除单个角点', () => {
    const e = createApolloEntity(
      'area',
      'drawRotatedRect',
      [
        [0, 0],
        [2, 1],
        [2, 2],
      ],
      [],
    );

    expect(deleteVertex(e, 1)).toBe(e);
  });

  it('bezier = 2 anchor：返回 null（必须删除整个 entity）', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 1, y: 1 }, handleIn: null, handleOut: null },
      ],
    };

    expect(deleteVertex(e, 0)).toBeNull();
  });

  it('rect 不支持顶点删除：返回 entity 自身', () => {
    const e: RectEntity = {
      id: 'rc',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 2, y: 1 },
      rotation: 0,
    };

    expect(deleteVertex(e, 0)).toBe(e);
  });
});

// ── toggleSmooth ────────────────────────────────────────────────

describe('toggleSmooth (bezier)', () => {
  it('已经平滑（有 handles）→ 切回尖角（handles=null）', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 1, y: 1 }, handleIn: { x: 0.5, y: 1 }, handleOut: { x: 1.5, y: 1 } },
        { point: { x: 2, y: 0 }, handleIn: null, handleOut: null },
      ],
    };
    const next = toggleSmooth(e, 1);
    expect(next.anchors[1]!.handleIn).toBeNull();
    expect(next.anchors[1]!.handleOut).toBeNull();
  });

  it('原来是尖角（handles=null）→ 添加对称 handles', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 1, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 2, y: 0 }, handleIn: null, handleOut: null },
      ],
    };
    const next = toggleSmooth(e, 1);
    expect(next.anchors[1]!.handleIn).not.toBeNull();
    expect(next.anchors[1]!.handleOut).not.toBeNull();
    // handleIn / handleOut 关于 anchor 镜像（两端均存在的对称模式）
    const a = next.anchors[1]!;
    expect(a.handleIn!.x + a.handleOut!.x).toBeCloseTo(2 * a.point.x, 9);
    expect(a.handleIn!.y + a.handleOut!.y).toBeCloseTo(2 * a.point.y, 9);
  });

  it('端点尖角平滑时只使用相邻 anchor 方向', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 3, y: 0 }, handleIn: null, handleOut: null },
      ],
    };

    const first = toggleSmooth(e, 0);
    expect(first.anchors[0]!.handleOut).toEqual({ x: 1, y: 0 });
    expect(first.anchors[0]!.handleIn).toEqual({ x: -1, y: 0 });

    const last = toggleSmooth(e, 1);
    expect(last.anchors[1]!.handleOut).toEqual({ x: 4, y: 0 });
    expect(last.anchors[1]!.handleIn).toEqual({ x: 2, y: 0 });
  });

  it('零长度邻接方向时保持尖角 handles=null', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
      ],
    };

    const next = toggleSmooth(e, 0);
    expect(next.anchors[0]!.handleIn).toBeNull();
    expect(next.anchors[0]!.handleOut).toBeNull();
  });

  it('toggleSmooth 不修改原 entity（不可变约定）', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: null },
        { point: { x: 1, y: 0 }, handleIn: null, handleOut: null },
      ],
    };
    const before = JSON.parse(JSON.stringify(e));
    toggleSmooth(e, 0);
    expect(e).toEqual(before);
  });
});

// ── applyDrag ───────────────────────────────────────────────────

describe('getDragCenter (drawing entities)', () => {
  it('polyline / polygon 使用编辑点平均值，rect 使用 source center', () => {
    const polyline: PolylineEntity = {
      id: 'pl',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 6, y: 0 },
      ],
    };
    const polygon: PolygonEntity = {
      id: 'pg',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    };
    const rect: RectEntity = {
      id: 'rc',
      entityType: 'rect',
      p1: { x: 1, y: 2 },
      p2: { x: 5, y: 6 },
      rotation: Math.PI / 4,
    };

    expectLngLatClose(getDragCenter(polyline), [3, 1]);
    expectLngLatClose(getDragCenter(polygon), [1, 1]);
    expectLngLatClose(getDragCenter(rect), [3, 4]);
  });

  it('空折线和无中心编辑体返回 null', () => {
    const polyline: PolylineEntity = { id: 'pl', entityType: 'polyline', points: [] };
    const bezier: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [{ point: { x: 0, y: 0 }, handleIn: null, handleOut: null }],
    };
    const arc: ArcEntity = {
      id: 'ar',
      entityType: 'arc',
      start: { x: 0, y: 0 },
      mid: { x: 1, y: 1 },
      end: { x: 2, y: 0 },
    };

    expect(getDragCenter(polyline)).toBeNull();
    expect(getDragCenter(bezier)).toBeNull();
    expect(getDragCenter(arc)).toBeNull();
  });
});

describe('applyDrag (drawing entities)', () => {
  it('polyline 顶点拖拽：更新指定 index 的位置，其它不动', () => {
    const e: PolylineEntity = {
      id: 'pl',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    };
    const next = applyDrag(e, 1, 'vertex', [10, 10]) as PolylineEntity;
    expect(next.points[0]).toEqual({ x: 0, y: 0 });
    expect(next.points[1]).toEqual({ x: 10, y: 10 });
    expect(next.points[2]).toEqual({ x: 2, y: 0 });
  });

  it('空 polyline center 拖拽无中心时返回原对象', () => {
    const e: PolylineEntity = { id: 'pl', entityType: 'polyline', points: [] };

    expect(applyDrag(e, -2, 'center', [1, 1])).toBe(e);
  });

  it.each(['polyline', 'catmullRom'] as const)('%s center 拖拽：整体平移所有顶点', (entityType) => {
    const e: PolylineEntity | CatmullRomEntity = {
      id: 'pl',
      entityType,
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
      ],
    };

    const next = applyDrag(e, -2, 'center', [5, 7]) as PolylineEntity | CatmullRomEntity;

    expect(next.points).toEqual([
      { x: 3, y: 7 },
      { x: 5, y: 7 },
      { x: 7, y: 7 },
    ]);
  });

  it('arc start/mid/end：按 index 0/1/2 写入对应字段', () => {
    const e: ArcEntity = {
      id: 'ar',
      entityType: 'arc',
      start: { x: 0, y: 0 },
      mid: { x: 1, y: 0 },
      end: { x: 2, y: 0 },
    };
    expect((applyDrag(e, 0, 'vertex', [9, 9]) as ArcEntity).start).toEqual({ x: 9, y: 9 });
    expect((applyDrag(e, 1, 'vertex', [9, 9]) as ArcEntity).mid).toEqual({ x: 9, y: 9 });
    expect((applyDrag(e, 2, 'vertex', [9, 9]) as ArcEntity).end).toEqual({ x: 9, y: 9 });
  });

  it('rect center：平移 p1 / p2 同样的位移', () => {
    const e: RectEntity = {
      id: 'rc',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 2, y: 1 },
      rotation: 0,
    };
    // 中心 (1, 0.5) → 拖到 (3, 4) 即 dx=2, dy=3.5
    const next = applyDrag(e, -2, 'center', [3, 4]) as RectEntity;
    expect(next.p1).toEqual({ x: 2, y: 3.5 });
    expect(next.p2).toEqual({ x: 4, y: 4.5 });
  });

  it('rect rotate 和 corner resize 分别更新 rotation / p1p2', () => {
    const e: RectEntity = {
      id: 'rc',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 2, y: 1 },
      rotation: 0,
    };

    const rotated = applyDrag(e, -1, 'rotate', [2, 2]) as RectEntity;
    expect(rotated.rotation).not.toBe(0);
    expect(rotated.p1).toEqual(e.p1);
    expect(rotated.p2).toEqual(e.p2);

    const resized = applyDrag(e, 0, 'vertex', [-1, -1]) as RectEntity;
    expect(resized.rotation).toBe(e.rotation);
    expect(resized).not.toBe(e);
    expect([resized.p1, resized.p2]).not.toEqual([e.p1, e.p2]);
  });

  it('bezier handleOut 无 alt：handleIn 自动镜像', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [{ point: { x: 0, y: 0 }, handleIn: { x: -1, y: 0 }, handleOut: { x: 1, y: 0 } }],
    };
    const next = applyDrag(e, 0, 'handleOut', [2, 1]) as BezierEntity;
    const a = next.anchors[0]!;
    expect(a.handleOut).toEqual({ x: 2, y: 1 });
    // 镜像：anchor (0,0) → handleIn = (-2, -1)
    expect(a.handleIn).toEqual({ x: -2, y: -1 });
  });

  it('bezier handleOut + alt：保留另一侧 handleIn 不变', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [{ point: { x: 0, y: 0 }, handleIn: { x: -1, y: 0 }, handleOut: { x: 1, y: 0 } }],
    };
    const next = applyDrag(e, 0, 'handleOut', [2, 1], true) as BezierEntity;
    expect(next.anchors[0]!.handleIn).toEqual({ x: -1, y: 0 });
    expect(next.anchors[0]!.handleOut).toEqual({ x: 2, y: 1 });
  });

  it('bezier vertex 拖拽会同步移动两侧 handle', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [{ point: { x: 1, y: 1 }, handleIn: { x: 0, y: 1 }, handleOut: { x: 2, y: 1 } }],
    };

    const next = applyDrag(e, 0, 'vertex', [4, 5]) as BezierEntity;
    expect(next.anchors[0]!.point).toEqual({ x: 4, y: 5 });
    expect(next.anchors[0]!.handleIn).toEqual({ x: 3, y: 5 });
    expect(next.anchors[0]!.handleOut).toEqual({ x: 5, y: 5 });
  });

  it('bezier handleIn 无 alt：handleOut 自动镜像', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [{ point: { x: 0, y: 0 }, handleIn: { x: -1, y: 0 }, handleOut: { x: 1, y: 0 } }],
    };

    const next = applyDrag(e, 0, 'handleIn', [-3, 2]) as BezierEntity;
    expect(next.anchors[0]!.handleIn).toEqual({ x: -3, y: 2 });
    expect(next.anchors[0]!.handleOut).toEqual({ x: 3, y: -2 });
  });

  it('polygon 顶点拖拽不会破坏自交（自交时回退到原 entity）', () => {
    // 凸 4 边形 → 把第 2 个顶点拖到对角内会形成蝴蝶结
    const e: PolygonEntity = {
      id: 'pg',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    };
    // 把 index=2 的角点 (2,2) 拖到 (0, 0) 会形成自交
    const next = applyDrag(e, 2, 'vertex', [1, -1]);
    // 自交时 entityMutations 退回原对象（而不是返回坏多边形）
    expect(next).toBe(e);
  });

  it('polygon 顶点拖拽不自交时更新指定顶点', () => {
    const e: PolygonEntity = {
      id: 'pg',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    };

    const next = applyDrag(e, 1, 'vertex', [3, 0]) as PolygonEntity;

    expect(next).not.toBe(e);
    expect(next.points).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
  });

  it('polygon center 拖拽整体平移所有顶点', () => {
    const e: PolygonEntity = {
      id: 'pg',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    };

    const next = applyDrag(e, -2, 'center', [3, 4]) as PolygonEntity;
    expect(next.points).toEqual([
      { x: 2, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 5 },
      { x: 2, y: 5 },
    ]);
  });
});

// ── Apollo entities ─────────────────────────────────────────────────

describe('getDragCenter (Apollo entities)', () => {
  it('rotated-rect source entity 使用 sourceRect 中心', () => {
    const e = createApolloEntity(
      'area',
      'drawRotatedRect',
      [
        [0, 0],
        [4, 0],
        [4, 2],
      ],
      [],
    );
    const rect = getSourceRect(e)!;

    expectLngLatClose(getDragCenter(e), [(rect.p1.x + rect.p2.x) / 2, (rect.p1.y + rect.p2.y) / 2]);
  });

  it('无 sourceRect 的 Apollo entity 使用编辑点平均值', () => {
    const e = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [2, 2],
        [4, 0],
      ],
      [],
    );

    expectLngLatClose(getDragCenter(e), [2, 2 / 3]);
  });

  it('无编辑点的 Apollo entity 返回 null', () => {
    const e = createApolloEntity('lane', 'drawPolyline', [], []) as LaneEntity;

    expect(getDragCenter(e)).toBeNull();
  });
});

describe('deleteVertex (Apollo entities)', () => {
  it('删除非矩形 Apollo lane 的中心线点并同步 centralCurve', () => {
    const e = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [],
    ) as LaneEntity;

    const next = deleteVertex(e, 1) as LaneEntity;

    expect(next).not.toBe(e);
    expect(getEditPoints(next)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(next.centralCurve.segments[0]!.lineSegment.points).toEqual(getEditPoints(next));
  });

  it('Apollo lane 只剩 2 个点时删除顶点会删除整个实体', () => {
    const e = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [1, 1],
      ],
      [],
    );

    expect(deleteVertex(e, 0)).toBeNull();
  });
});

describe('applyDrag (Apollo source entities)', () => {
  it('Bezier anchor 拖拽会移动锚点和两侧 handle，并重建中心线采样点', () => {
    const e = makeBezierApolloLane();

    const next = applyDrag(e, 1, 'vertex', [10, 5]) as LaneEntity;
    const source = getSource(next);

    expect(source?.drawTool).toBe('drawBezier');
    if (source?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(source.anchors[1]!.point, { x: 10, y: 5 });
    expectGeoPointClose(source.anchors[1]!.handleIn!, { x: 9, y: 5 });
    expectGeoPointClose(source.anchors[1]!.handleOut!, { x: 11, y: 5 });
    expect(
      getEditPoints(next).some((p) => Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y - 5) < 1e-9),
    ).toBe(true);
  });

  it('Bezier endpoint anchor 拖拽只移动存在的 handle', () => {
    const e = makeBezierApolloLane();

    const first = applyDrag(e, 0, 'vertex', [1, 2]) as LaneEntity;
    const firstSource = getSource(first);
    if (firstSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(firstSource.anchors[0]!.point, { x: 1, y: 2 });
    expect(firstSource.anchors[0]!.handleIn).toBeNull();
    expectGeoPointClose(firstSource.anchors[0]!.handleOut!, { x: 2, y: 2 });

    const last = applyDrag(e, 2, 'vertex', [7, 3]) as LaneEntity;
    const lastSource = getSource(last);
    if (lastSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(lastSource.anchors[2]!.point, { x: 7, y: 3 });
    expectGeoPointClose(lastSource.anchors[2]!.handleIn!, { x: 6, y: 3 });
    expect(lastSource.anchors[2]!.handleOut).toBeNull();
  });

  it('Bezier handle 拖拽默认镜像另一侧，按 alt 时保留另一侧', () => {
    const e = makeBezierApolloLane();

    const mirrored = applyDrag(e, 1, 'handleOut', [12, 7]) as LaneEntity;
    const mirroredSource = getSource(mirrored);
    if (mirroredSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(mirroredSource.anchors[1]!.handleOut!, { x: 12, y: 7 });
    expectGeoPointClose(mirroredSource.anchors[1]!.handleIn!, { x: -6, y: -7 });

    const detached = applyDrag(e, 1, 'handleOut', [12, 7], true) as LaneEntity;
    const detachedSource = getSource(detached);
    if (detachedSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(detachedSource.anchors[1]!.handleOut!, { x: 12, y: 7 });
    expectGeoPointClose(detachedSource.anchors[1]!.handleIn!, { x: 2, y: 0 });
  });

  it('Bezier handleIn 拖拽默认镜像 handleOut，按 alt 时保留另一侧', () => {
    const e = makeBezierApolloLane();

    const mirrored = applyDrag(e, 1, 'handleIn', [-2, 4]) as LaneEntity;
    const mirroredSource = getSource(mirrored);
    if (mirroredSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(mirroredSource.anchors[1]!.handleIn!, { x: -2, y: 4 });
    expectGeoPointClose(mirroredSource.anchors[1]!.handleOut!, { x: 8, y: -4 });

    const detached = applyDrag(e, 1, 'handleIn', [-2, 4], true) as LaneEntity;
    const detachedSource = getSource(detached);
    if (detachedSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(detachedSource.anchors[1]!.handleIn!, { x: -2, y: 4 });
    expectGeoPointClose(detachedSource.anchors[1]!.handleOut!, { x: 4, y: 0 });
  });

  it('Bezier source 不支持的 pointType 保留原始 anchors', () => {
    const e = makeBezierApolloLane();
    const source = getSource(e);
    if (source?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');

    const next = applyDrag(e, 1, 'rotate', [9, 9]) as LaneEntity;
    const nextSource = getSource(next);

    if (nextSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expect(nextSource.anchors).toEqual(source.anchors);
  });

  it('Arc source 拖拽会更新原始三点并重建 stop line', () => {
    const e = createApolloEntity(
      'signal',
      'drawArc',
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [],
    ) as ApolloEntity;

    const next = applyDrag(e, 1, 'vertex', [1, 2]) as ApolloEntity;
    const source = getSource(next);

    expect(source?.drawTool).toBe('drawArc');
    if (source?.drawTool !== 'drawArc') throw new Error('expected arc source');
    expectGeoPointClose(source.arcPoints[1], { x: 1, y: 2 });
    expect(getEditPoints(next)).not.toEqual(getEditPoints(e));
  });

  it('Arc source 越界 index 保留原始三点', () => {
    const e = createApolloEntity(
      'signal',
      'drawArc',
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [],
    ) as ApolloEntity;
    const source = getSource(e);
    if (source?.drawTool !== 'drawArc') throw new Error('expected arc source');

    const next = applyDrag(e, 3, 'vertex', [9, 9]) as ApolloEntity;
    const nextSource = getSource(next);

    if (nextSource?.drawTool !== 'drawArc') throw new Error('expected arc source');
    expect(nextSource.arcPoints).toEqual(source.arcPoints);
  });

  it('Catmull-Rom source 只允许 vertex 拖拽，非法 pointType 或越界 index 返回原对象', () => {
    const e = createApolloEntity(
      'lane',
      'drawCatmullRom',
      [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      [],
    ) as LaneEntity;

    expect(applyDrag(e, 1, 'handleOut', [5, 5])).toBe(e);
    expect(applyDrag(e, 99, 'vertex', [5, 5])).toBe(e);

    const next = applyDrag(e, 1, 'vertex', [5, 5]) as LaneEntity;
    const source = getSource(next);
    if (source?.drawTool !== 'drawCatmullRom') throw new Error('expected Catmull-Rom source');
    expectGeoPointClose(source.points[1]!, { x: 5, y: 5 });
    expect(getEditPoints(next)).not.toEqual(getEditPoints(e));
  });
});

describe('applyDrag (Apollo rotated rect source)', () => {
  function makeAreaRect(): AreaEntity {
    return createApolloEntity(
      'area',
      'drawRotatedRect',
      [
        [0, 0],
        [4, 0],
        [4, 2],
      ],
      [],
    ) as AreaEntity;
  }

  it('center 拖拽平移 sourceRect 并同步 polygon', () => {
    const e = makeAreaRect();

    const next = applyDrag(e, -2, 'center', [5, 5]) as AreaEntity;
    const rect = getSourceRect(next)!;

    expectLngLatClose(getDragCenter(next), [5, 5]);
    expect(next.polygon.points.length).toBe(5);
    expectGeoPointClose(next.polygon.points[0]!, { x: rect.p1.x, y: rect.p1.y });
  });

  it('rotate 拖拽只更新 rotation 并重建 polygon', () => {
    const e = makeAreaRect();
    const before = getSourceRect(e)!;

    const next = applyDrag(e, -1, 'rotate', [5, 0]) as AreaEntity;
    const after = getSourceRect(next)!;

    expect(after.rotation).not.toBeCloseTo(before.rotation, 8);
    expectGeoPointClose(after.p1, before.p1);
    expectGeoPointClose(after.p2, before.p2);
    expect(next.polygon.points).not.toEqual(e.polygon.points);
    expect(next.polygon.points).toHaveLength(5);
    expect(next.polygon.points[0]).toEqual(next.polygon.points[4]);
  });

  it('vertex 拖拽 resize sourceRect 并保持闭合 polygon', () => {
    const e = makeAreaRect();
    const before = getSourceRect(e)!;

    const next = applyDrag(e, 1, 'vertex', [6, 3]) as AreaEntity;
    const after = getSourceRect(next)!;

    expect(after.p1).not.toEqual(before.p1);
    expect(after.p2).not.toEqual(before.p2);
    expect(next.polygon.points).toHaveLength(5);
    expect(next.polygon.points[0]).toEqual(next.polygon.points[4]);
  });

  it('非 center / rotate / vertex 的 sourceRect 拖拽返回原对象', () => {
    const e = makeAreaRect();

    expect(applyDrag(e, 0, 'handleIn', [1, 1])).toBe(e);
  });
});

describe('applyDrag (Apollo imported/fallback entities)', () => {
  it('center 拖拽无编辑点的 Apollo entity 返回原对象', () => {
    const e = createApolloEntity('lane', 'drawPolyline', [], []) as LaneEntity;

    expect(applyDrag(e, -2, 'center', [1, 1])).toBe(e);
  });

  it('center 拖拽无 _source 的 lane 时整体平移编辑点', () => {
    const e = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [2, 0],
        [4, 0],
      ],
      [],
    ) as LaneEntity;

    const next = applyDrag(e, -2, 'center', [10, 0]) as LaneEntity;

    expect(getEditPoints(next)).toEqual([
      { x: 8, y: 0 },
      { x: 10, y: 0 },
      { x: 12, y: 0 },
    ]);
  });

  it('vertex 拖拽无 _source 的 lane 时只更新指定编辑点', () => {
    const e = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [2, 0],
        [4, 0],
      ],
      [],
    ) as LaneEntity;

    const next = applyDrag(e, 1, 'vertex', [5, 5]) as LaneEntity;

    expect(getEditPoints(next)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 4, y: 0 },
    ]);
    expect(applyDrag(e, 99, 'vertex', [5, 5])).toBe(e);
  });
});

describe('toggleSmoothApollo', () => {
  it('非 Bezier source entity 返回原对象', () => {
    const e = createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [0, 0],
        [1, 1],
      ],
      [],
    );

    expect(toggleSmoothApollo(e, 0)).toBe(e);
  });

  it('Bezier source 有 handles 时清空，无 handles 时补对称 handles', () => {
    const e = makeBezierApolloLane();

    const sharp = toggleSmoothApollo(e, 1);
    const sharpSource = getSource(sharp);
    if (sharpSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expect(sharpSource.anchors[1]!.handleIn).toBeNull();
    expect(sharpSource.anchors[1]!.handleOut).toBeNull();

    const smooth = toggleSmoothApollo(sharp, 1);
    const smoothSource = getSource(smooth);
    if (smoothSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    const anchor = smoothSource.anchors[1]!;
    expect(anchor.handleIn).not.toBeNull();
    expect(anchor.handleOut).not.toBeNull();
    expect(anchor.handleIn!.x + anchor.handleOut!.x).toBeCloseTo(2 * anchor.point.x, 8);
    expect(anchor.handleIn!.y + anchor.handleOut!.y).toBeCloseTo(2 * anchor.point.y, 8);
  });

  it('Bezier source 端点平滑时使用唯一相邻 anchor 方向', () => {
    const e = makeBezierApolloLane();
    const source = getSource(e);
    if (source?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    const sharp: LaneEntity = {
      ...e,
      _source: {
        ...source,
        anchors: source.anchors.map((anchor) => ({ ...anchor, handleIn: null, handleOut: null })),
      },
    };

    const first = toggleSmoothApollo(sharp, 0);
    const firstSource = getSource(first);
    if (firstSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(firstSource.anchors[0]!.handleOut!, { x: 1, y: 0 });
    expectGeoPointClose(firstSource.anchors[0]!.handleIn!, { x: -1, y: 0 });

    const last = toggleSmoothApollo(sharp, 2);
    const lastSource = getSource(last);
    if (lastSource?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(lastSource.anchors[2]!.handleOut!, { x: 7, y: 0 });
    expectGeoPointClose(lastSource.anchors[2]!.handleIn!, { x: 5, y: 0 });
  });

  it('Bezier source 两点端点平滑时覆盖前驱分支', () => {
    const anchors: BezierAnchor[] = [
      { point: [0, 0], handleIn: null, handleOut: null },
      { point: [3, 0], handleIn: null, handleOut: null },
    ];
    const e = createApolloEntity('lane', 'drawBezier', [], anchors) as LaneEntity;

    const next = toggleSmoothApollo(e, 1);
    const source = getSource(next);

    if (source?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expectGeoPointClose(source.anchors[1]!.handleOut!, { x: 4, y: 0 });
    expectGeoPointClose(source.anchors[1]!.handleIn!, { x: 2, y: 0 });
  });

  it('Bezier source 零长度邻接方向时保持尖角 handles=null', () => {
    const anchors: BezierAnchor[] = [
      { point: [0, 0], handleIn: null, handleOut: null },
      { point: [0, 0], handleIn: null, handleOut: null },
    ];
    const e = createApolloEntity('lane', 'drawBezier', [], anchors) as LaneEntity;

    const next = toggleSmoothApollo(e, 0);
    const source = getSource(next);

    if (source?.drawTool !== 'drawBezier') throw new Error('expected Bezier source');
    expect(source.anchors[0]!.handleIn).toBeNull();
    expect(source.anchors[0]!.handleOut).toBeNull();
  });
});
