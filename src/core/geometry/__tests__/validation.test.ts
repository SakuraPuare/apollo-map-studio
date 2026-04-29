/**
 * validation — 几何相交 / 自交检测。
 *
 * 业务路径：
 *   - FSM polygon 绘制 → wouldSelfIntersect 阻止落点
 *   - entityMutations 编辑闭合多边形 → polygonSelfIntersects 反悔
 *
 * 这里的 cross/segmentsIntersect 严格遵循"端点重合不算相交"的契约——
 * 否则同一顶点上首尾相接的多边形会被误判为自交。下面的用例直接锁这个语义。
 */
import { describe, it, expect } from 'vitest';
import { segmentsIntersect, wouldSelfIntersect, polygonSelfIntersects } from '../validation';
import type { LngLat } from '../interpolate';

describe('segmentsIntersect', () => {
  it('交叉的两段 X 形相交', () => {
    expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
  });

  it('平行段不相交', () => {
    expect(segmentsIntersect([0, 0], [2, 0], [0, 1], [2, 1])).toBe(false);
  });

  it('共线但不重叠不算相交', () => {
    expect(segmentsIntersect([0, 0], [1, 0], [2, 0], [3, 0])).toBe(false);
  });

  it('共端点（接续）不算严格相交', () => {
    // 两段在 (1,0) 接龙——多边形闭合时常见，不能误判成自交
    expect(segmentsIntersect([0, 0], [1, 0], [1, 0], [2, 1])).toBe(false);
  });

  it('一段端点恰好落在另一段中间不算严格相交', () => {
    // 退化情形（cross 之一 = 0），按当前 strict 实现应返 false
    expect(segmentsIntersect([0, 0], [2, 0], [1, 0], [1, 2])).toBe(false);
  });
});

describe('wouldSelfIntersect', () => {
  it('点数 < 2 永远不自交', () => {
    expect(wouldSelfIntersect([], [0, 0])).toBe(false);
    expect(wouldSelfIntersect([[0, 0]], [1, 1])).toBe(false);
  });

  it('沿凸折线追加点不自交', () => {
    const pts: LngLat[] = [
      [0, 0],
      [2, 0],
      [2, 2],
    ];
    expect(wouldSelfIntersect(pts, [0, 2])).toBe(false);
  });

  it('追加点后形成的新边穿过已有边 → 自交', () => {
    // 已有 (0,0) → (2,0) → (2,2)，新点 (-1,1) 让最新边 (2,2)→(-1,1)
    // 跨越首段 (0,0)→(2,0)
    const pts: LngLat[] = [
      [0, 0],
      [2, 0],
      [2, 2],
    ];
    expect(wouldSelfIntersect(pts, [1, -1])).toBe(true);
  });

  it('与最后一条边端点共点不算自交（紧邻边被排除）', () => {
    // 新边 (1,0)→(2,0) 起点是 pts 的最后一点 → 与倒数第二条边只在端点接续
    const pts: LngLat[] = [
      [0, 0],
      [1, 0],
    ];
    expect(wouldSelfIntersect(pts, [2, 0])).toBe(false);
  });
});

describe('polygonSelfIntersects', () => {
  it('点数 < 4 永远不自交', () => {
    expect(polygonSelfIntersects([])).toBe(false);
    expect(
      polygonSelfIntersects([
        [0, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toBe(false);
  });

  it('凸正方形不自交（含闭合边）', () => {
    const square: LngLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(polygonSelfIntersects(square)).toBe(false);
  });

  it('蝴蝶结（hourglass）自交', () => {
    // 顶点顺序 (0,0)→(1,1)→(1,0)→(0,1) 形成两条交叉对角线
    const bowtie: LngLat[] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ];
    expect(polygonSelfIntersects(bowtie)).toBe(true);
  });

  it('凹但不自交的形状（L 形）不被误判', () => {
    const L: LngLat[] = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ];
    expect(polygonSelfIntersects(L)).toBe(false);
  });
});
