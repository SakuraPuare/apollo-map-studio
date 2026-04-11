/**
 * hitTest 单元测试
 *
 * 核心回归：R4 — 地图 zoom 20+ 后选中 lane / 顶点位置偏移
 *
 * 量纲事实（Web Mercator, 方形像素）：
 *   - 每像素 lng 度数 pxDeg = 360 / (512 * 2^z)              —— 与 lat 无关
 *   - 每像素 lat 度数      = pxDeg * cos(lat)                 —— 高纬方向变小
 *   - 两者对应的物理长度（米）相等 = pxDeg * 111320 * cos(lat)
 *
 * 根因：旧实现 pointToPolylineDist 把 (lng,lat) 当同量纲欧氏空间。
 * 对一条东西向 lane：Δlat = (物理法向像素数) × pxDeg * cos(lat) —— 在 lat 40°
 * 会比同像素数的南北向 Δlng 小 cos(40°) ≈ 0.766 倍。欧氏距离把 Δlat 当
 * Δlng 同量纲算，EW 的 "度数距离" 被算小 0.766 倍：
 *   - 欧氏排序错判 EW 比物理等距的 NS 更近 → 点中 EW 而不是用户期望的 NS
 *   - 反过来，一条物理在半径外的 EW lane 被欧氏算作半径内 → 错误命中
 *
 * 新实现 pointToPolylineDistGeo(coords, cosLat) 把 Δlat 乘 (1/cosLat) 转到
 * "等效 lng 度空间"，返回值量纲 = lng 度数，可直接与 pixelToRadius 比较，
 * 排序反映真实物理距离。
 */
import { describe, it, expect } from 'vitest';
import type { LngLat } from '../interpolate';
import {
  pointToPolylineDist,
  pointToPolylineDistGeo,
  pointToPolygonDistGeo,
  pointInPolygon,
} from '../hitTest';

// ── 测试常量 ────────────────────────────────────────────────────

const LAT_HIGH = 40; // 高纬度场景（北京、纽约量级）
const LAT_EQUATOR = 0; // 赤道参照
const ZOOM_HIGH = 20;
const HIT_TEST_RADIUS_PX = 10; // 与 mapConstants.HIT_TEST_RADIUS_PX 保持一致

/** 单像素对应的 lng 度数（Web Mercator, zoom z, tile 512px） */
function pxToLngDeg(zoom: number): number {
  return 360 / (512 * Math.pow(2, zoom));
}

/** 复刻 useMapEventRouter 的 pixelToRadius 公式 */
function pixelToRadius(px: number, zoom: number): number {
  return px * pxToLngDeg(zoom);
}

const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180);

// ── 基线：赤道附近 Geo 版本 ≈ 欧氏版本 ─────────────────────────

describe('pointToPolylineDistGeo — 赤道退化为欧氏版本', () => {
  it('赤道 (cosLat=1) 的结果应与 pointToPolylineDist 相等', () => {
    const point: LngLat = [0, 0];
    const line: LngLat[] = [
      [0.0001, -0.001],
      [0.0001, 0.001],
    ];
    const euclid = pointToPolylineDist(point, line);
    const geo = pointToPolylineDistGeo(point, line, cosDeg(LAT_EQUATOR));
    expect(geo).toBeCloseTo(euclid, 12);
  });
});

// ── R4 核心：高纬度 + 高 zoom 排序修复 ──────────────────────────

describe('pointToPolylineDistGeo — 高纬度 40° + zoom 20 排序正确性', () => {
  const radius = pixelToRadius(HIT_TEST_RADIUS_PX, ZOOM_HIGH); // 10 像素半径 lng 度
  const pxDeg = pxToLngDeg(ZOOM_HIGH); // 1 像素 lng 度 ≈ 6.7e-7

  /**
   * 场景：点选点 (lng=116.4, lat=40)，两条 lane：
   *   - NS: 南北向折线，法向是 lng 方向，物理距点 3 像素 → Δlng = 3 * pxDeg
   *   - EW: 东西向折线，法向是 lat 方向，物理距点 3 像素 → Δlat = 3 * pxDeg * cosLat
   *
   * 物理真相：两条 lane 到 click 的物理距离相等（都是 3 像素）。
   *
   * 欧氏旧实现算出：
   *   NS 度数距离 = 3 * pxDeg              （正确量纲，偶然对）
   *   EW 度数距离 = 3 * pxDeg * cosLat      （被低估 cosLat 倍 ≈ 0.766 倍）
   *   → 欧氏错判 "EW 更近" —— 这就是 R4 bug
   *
   * Geo 修复后应返回相等距离。
   */
  it('欧氏版本在高纬度下排序错误（基线复现 bug）', () => {
    const click: LngLat = [116.4, 40];
    const cosLat = cosDeg(LAT_HIGH);
    // lane 跨度做得足够宽，让 click 的法向脚落在线段内部
    const spanLng = 100 * pxDeg;

    // 距点 3 像素的 NS lane
    const nsLane: LngLat[] = [
      [116.4 + 3 * pxDeg, 40 - spanLng],
      [116.4 + 3 * pxDeg, 40 + spanLng],
    ];
    // 距点 3 像素的 EW lane
    const ewLane: LngLat[] = [
      [116.4 - spanLng, 40 + 3 * pxDeg * cosLat],
      [116.4 + spanLng, 40 + 3 * pxDeg * cosLat],
    ];

    // Geo 版本：两条物理等距的 lane 必须返回相等度数距离（= 3 像素的 lng 度数）
    const dNS = pointToPolylineDistGeo(click, nsLane, cosLat);
    const dEW = pointToPolylineDistGeo(click, ewLane, cosLat);
    expect(dNS).toBeCloseTo(3 * pxDeg, 13);
    expect(dEW).toBeCloseTo(3 * pxDeg, 13);

    // 欧氏旧实现：EW 被低估到 3*pxDeg*cosLat ≈ 2.298*pxDeg，NS 是 3*pxDeg
    // → 欧氏错判 "EW 离 click 更近" —— R4 bug 的数值表现
    const dNSEuclid = pointToPolylineDist(click, nsLane);
    const dEWEuclid = pointToPolylineDist(click, ewLane);
    expect(dEWEuclid).toBeLessThan(dNSEuclid);
    expect(dEWEuclid / dNSEuclid).toBeCloseTo(cosLat, 6);
  });

  it('Geo 版本：物理距离不等时排序反映真实远近', () => {
    const click: LngLat = [116.4, 40];
    const cosLat = cosDeg(LAT_HIGH);
    const spanLng = 100 * pxDeg;

    // near 在 lat 方向偏 4 像素
    const near: LngLat[] = [
      [116.4 - spanLng, 40 + 4 * pxDeg * cosLat],
      [116.4 + spanLng, 40 + 4 * pxDeg * cosLat],
    ];
    // far 在 lng 方向偏 6 像素
    const far: LngLat[] = [
      [116.4 + 6 * pxDeg, 40 - spanLng],
      [116.4 + 6 * pxDeg, 40 + spanLng],
    ];

    const dNear = pointToPolylineDistGeo(click, near, cosLat);
    const dFar = pointToPolylineDistGeo(click, far, cosLat);
    expect(dNear).toBeLessThan(dFar);
    expect(dNear).toBeCloseTo(4 * pxDeg, 13);
    expect(dFar).toBeCloseTo(6 * pxDeg, 13);
  });

  it('Geo 版本：radius 过滤在高纬度正确判定边界', () => {
    const click: LngLat = [116.4, 40];
    const cosLat = cosDeg(LAT_HIGH);
    const spanLng = 100 * pxDeg;

    // 距点 9 像素的 NS lane（< 10 像素半径）—— 应命中
    const inside: LngLat[] = [
      [116.4 + 9 * pxDeg, 40 - spanLng],
      [116.4 + 9 * pxDeg, 40 + spanLng],
    ];
    // 距点 11 像素的 NS lane（> 10 像素半径）—— 应过滤
    const outside: LngLat[] = [
      [116.4 + 11 * pxDeg, 40 - spanLng],
      [116.4 + 11 * pxDeg, 40 + spanLng],
    ];

    const dIn = pointToPolylineDistGeo(click, inside, cosLat);
    const dOut = pointToPolylineDistGeo(click, outside, cosLat);
    expect(dIn).toBeLessThan(radius);
    expect(dOut).toBeGreaterThan(radius);
  });

  it('Geo 版本修复"欧氏误命中"：EW 方向物理在半径外的 lane 不应命中', () => {
    const click: LngLat = [116.4, 40];
    const cosLat = cosDeg(LAT_HIGH);
    const spanLng = 100 * pxDeg;

    // 一条物理 12 像素远的 EW lane（lat 偏 12*pxDeg*cosLat 度）
    // 真实物理 > 10 像素半径 → 应该被过滤
    const falseHit: LngLat[] = [
      [116.4 - spanLng, 40 + 12 * pxDeg * cosLat],
      [116.4 + spanLng, 40 + 12 * pxDeg * cosLat],
    ];
    const dGeo = pointToPolylineDistGeo(click, falseHit, cosLat);
    const dEuclid = pointToPolylineDist(click, falseHit);

    // Geo 正确：物理 12 像素 > 10 像素半径 → 应过滤
    expect(dGeo).toBeGreaterThan(radius);
    expect(dGeo).toBeCloseTo(12 * pxDeg, 13);

    // 欧氏错误：欧氏度数距离 = 12*pxDeg*cosLat ≈ 9.19*pxDeg < 10*pxDeg=radius
    //   → 欧氏把物理外部元素假命中（R4 bug 另一种表现：点到了不应该被选中的远处 lane）
    expect(dEuclid).toBeLessThan(radius);
    expect(dEuclid).toBeCloseTo(12 * pxDeg * cosLat, 13);
  });
});

// ── 极端纬度 defensive behavior ─────────────────────────────────

describe('pointToPolylineDistGeo — 极地 clamp', () => {
  it('cosLat=0 时退化为 1e-6 clamp，不除零', () => {
    const line: LngLat[] = [
      [0, 89.99999],
      [0.0001, 89.99999],
    ];
    const d = pointToPolylineDistGeo([0, 89.99999], line, 0);
    expect(Number.isFinite(d)).toBe(true);
  });
});

// ── pointToPolygonDistGeo ───────────────────────────────────────

describe('pointToPolygonDistGeo — 内外判定 + 边界距离', () => {
  it('点在多边形内部返回 0', () => {
    const cosLat = cosDeg(LAT_HIGH);
    const poly: LngLat[] = [
      [116.39, 39.99],
      [116.41, 39.99],
      [116.41, 40.01],
      [116.39, 40.01],
      [116.39, 39.99],
    ];
    expect(pointInPolygon([116.4, 40], poly)).toBe(true);
    expect(pointToPolygonDistGeo([116.4, 40], poly, cosLat)).toBe(0);
  });

  it('点在多边形外部返回到最近边界的 geo 距离（lng 度量纲）', () => {
    const cosLat = cosDeg(LAT_HIGH);
    const pxDeg = pxToLngDeg(ZOOM_HIGH);
    const spanLng = 100 * pxDeg;
    // 方形的下边在 lat 方向偏 3 像素
    const bottom = 40 + 3 * pxDeg * cosLat;
    const poly: LngLat[] = [
      [116.4 - spanLng, bottom],
      [116.4 + spanLng, bottom],
      [116.4 + spanLng, bottom + spanLng * cosLat],
      [116.4 - spanLng, bottom + spanLng * cosLat],
      [116.4 - spanLng, bottom],
    ];
    const d = pointToPolygonDistGeo([116.4, 40], poly, cosLat);
    expect(d).toBeCloseTo(3 * pxDeg, 13);
  });
});
