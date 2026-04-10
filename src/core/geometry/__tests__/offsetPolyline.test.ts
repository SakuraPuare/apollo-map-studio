/**
 * offsetPolylineDeg 单元测试
 *
 * 关键几何常识：
 *   miterRatio = 1/cos(α/2)，其中 α = 两段夹角（转向角）
 *   MAX_MITER = 3 → 触发 bevel 的转向角 > 141°（接近 U 形弯）
 *
 * 修复前的 bug：内侧（小角那边）超限时错误地插入两个方向相反的 bevel 点，
 *   导致路径穿越中心线产生自交。
 * 修复后：内侧超限仍用精确交点（单点），外侧超限才用 bevel（两点防尖刺）。
 */

import { describe, it, expect } from 'vitest';
import { offsetPolylineDeg } from '../apolloCompile';

// ── 工具函数 ────────────────────────────────────────────────────

const pt = (x: number, y: number) => ({ x, y });

const DEG_TO_M = 111320;
const LAT = 30;
const cosLat = Math.cos((LAT * Math.PI) / 180);
const mPerLng = cosLat * DEG_TO_M; // ≈ 96388 m/deg
const mPerLat = DEG_TO_M;           // 111320 m/deg

/** 经纬度 → 平面米坐标（局部近似） */
const toM = (p: { x: number; y: number }) => [
  p.x * mPerLng,
  p.y * mPerLat,
] as const;

/** 两点间距（米） */
function dist2d(a: { x: number; y: number }, b: { x: number; y: number }) {
  const [ax, ay] = toM(a);
  const [bx, by] = toM(b);
  return Math.hypot(ax - bx, ay - by);
}

/**
 * 点 q 到有向线段 p0→p1 的有符号垂直距离（米）
 * 正值 = 左侧（逆时针方向），负值 = 右侧
 */
function signedDist(
  q: { x: number; y: number },
  p0: { x: number; y: number },
  p1: { x: number; y: number },
) {
  const [qx, qy] = toM(q);
  const [ax, ay] = toM(p0);
  const [bx, by] = toM(p1);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  // 叉积 (b-a) × (q-a)，正 = 左
  return (dx * (qy - ay) - dy * (qx - ax)) / len;
}

const WIDTH = 3.5; // 偏移宽度（米）

// ── Case 1: 直线段 ──────────────────────────────────────────────

describe('直线段（向东）', () => {
  const line = [
    pt(116.000, LAT),
    pt(116.001, LAT),
    pt(116.002, LAT),
  ];

  it('左偏移各点在中心线左侧（北侧）≈ WIDTH', () => {
    const left = offsetPolylineDeg(line, WIDTH, 'left');
    expect(left.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      const d = signedDist(left[i], line[0], line[2]);
      expect(d).toBeCloseTo(WIDTH, 0);
    }
  });

  it('右偏移各点在中心线右侧（南侧）≈ -WIDTH', () => {
    const right = offsetPolylineDeg(line, WIDTH, 'right');
    expect(right.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      const d = signedDist(right[i], line[0], line[2]);
      expect(d).toBeCloseTo(-WIDTH, 0);
    }
  });
});

// ── Case 2: 90° 左转（向东 → 向北），转角 90°，miterRatio = √2 < 3 ──

describe('90° 左转（miterRatio = √2，不触发 bevel）', () => {
  // p0 → p1: 向东 100m；p1 → p2: 向北 100m
  const p0 = pt(116.000, LAT);
  const p1 = pt(116.000 + 100 / mPerLng, LAT);
  const p2 = pt(116.000 + 100 / mPerLng, LAT + 100 / mPerLat);
  const turn = [p0, p1, p2];

  it('左侧（外侧）共 3 个点，join 点在折点西北', () => {
    const left = offsetPolylineDeg(turn, WIDTH, 'left');
    expect(left.length).toBe(3);
    const [jx, jy] = toM(left[1]);
    const [px, py] = toM(p1);
    expect(jx).toBeLessThan(px);   // 偏西
    expect(jy).toBeGreaterThan(py); // 偏北
  });

  it('右侧（内侧）共 3 个点，join 点在折点东南', () => {
    const right = offsetPolylineDeg(turn, WIDTH, 'right');
    expect(right.length).toBe(3);
    const [jx, jy] = toM(right[1]);
    const [px, py] = toM(p1);
    expect(jx).toBeGreaterThan(px); // 偏东
    expect(jy).toBeLessThan(py);    // 偏南
  });

  it('内侧 join 点到中心折点距离 ≈ √2 × WIDTH（精确交点）', () => {
    const right = offsetPolylineDeg(turn, WIDTH, 'right');
    const d = dist2d(right[1], p1);
    expect(d).toBeCloseTo(Math.SQRT2 * WIDTH, 0);
  });

  it('内侧 join 点在段1右侧（signedDist < 0），不穿越中心线', () => {
    const right = offsetPolylineDeg(turn, WIDTH, 'right');
    const d = signedDist(right[1], p0, p1);
    expect(d).toBeLessThan(0);
  });
});

// ── Case 3: 150° 左转（转角 150°，miterRatio ≈ 3.86 > MAX_MITER=3）──
//   这是 bug 复现场景：
//   修复前：内侧也走 bevel（两点）→ 路径自交
//   修复后：内侧用精确交点（单点）→ 正确收短

describe('150° 左转（miterRatio ≈ 3.86，触发 bevel 阈值）', () => {
  // 段1: 向东 100m；段2: 150° 方向 = (-√3/2, 1/2) 单位向量
  const segLen = 100;
  const alpha = (150 * Math.PI) / 180;
  const p0 = pt(116.000, LAT);
  const p1 = pt(116.000 + segLen / mPerLng, LAT);
  const p2 = pt(
    p1.x + (segLen * Math.cos(alpha)) / mPerLng,
    p1.y + (segLen * Math.sin(alpha)) / mPerLat,
  );
  const turn = [p0, p1, p2];

  it('外侧（左）：三点弧 bevel → 5 个点（3输入 + 2弧点）', () => {
    const left = offsetPolylineDeg(turn, WIDTH, 'left');
    expect(left.length).toBe(5);
  });

  it('内侧（右）：精确交点 → 仍是 3 个点，不插额外点', () => {
    const right = offsetPolylineDeg(turn, WIDTH, 'right');
    expect(right.length).toBe(3); // 修复前会是 4，且路径自交
  });

  it('内侧 join 在段1右侧（不穿越中心线）', () => {
    const right = offsetPolylineDeg(turn, WIDTH, 'right');
    const d = signedDist(right[1], p0, p1);
    expect(d).toBeLessThan(0); // 修复前为正（穿越到左侧），修复后为负
  });
});

// ── Case 4: 150° 右转（对称验证）────────────────────────────────

describe('150° 右转（miterRatio ≈ 3.86，与左转镜像对称）', () => {
  const segLen = 100;
  const alpha = (-150 * Math.PI) / 180; // 右转
  const p0 = pt(116.000, LAT);
  const p1 = pt(116.000 + segLen / mPerLng, LAT);
  const p2 = pt(
    p1.x + (segLen * Math.cos(alpha)) / mPerLng,
    p1.y + (segLen * Math.sin(alpha)) / mPerLat,
  );
  const turn = [p0, p1, p2];

  it('外侧（右）：三点弧 bevel → 5 个点', () => {
    const right = offsetPolylineDeg(turn, WIDTH, 'right');
    expect(right.length).toBe(5);
  });

  it('内侧（左）：精确交点 → 3 个点', () => {
    const left = offsetPolylineDeg(turn, WIDTH, 'left');
    expect(left.length).toBe(3);
  });

  it('内侧（左）join 在段1左侧（不穿越中心线）', () => {
    const left = offsetPolylineDeg(turn, WIDTH, 'left');
    const d = signedDist(left[1], p0, p1);
    expect(d).toBeGreaterThan(0);
  });
});
