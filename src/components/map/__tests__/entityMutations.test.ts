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
import { deleteVertex, toggleSmooth, applyDrag } from '../entityMutations';
import type {
  PolylineEntity,
  CatmullRomEntity,
  BezierEntity,
  PolygonEntity,
  ArcEntity,
  RectEntity,
} from '@/types/entities';

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
});
