---
title: geo — 经纬度地理测量工具
description: haversine 距离、折线长度、米↔度换算；零依赖纯函数。
---

# `geo` — 经纬度地理测量工具

> 源码：`src/lib/geo.ts` · 58 行 · 零外部依赖 · 纯函数

## 用途

Apollo 编辑器在 React 层使用 WGS84 经纬度（`GeoPoint = { x: lng, y: lat }`）。需要把度差换算成米才能填充 `Lane.length`、`leftSamples` 这类带物理单位的字段。

`geo` 提供一组小而锐的函数：

- haversine（球面）距离公式 —— 车道尺度（< 几公里）误差 < 0.5%
- 折线总长
- 米 ↔ 度 换算

设计权衡：

- **不引入 turf**——多 2 MB 的依赖只为 distance/length，性价比太低
- **球面近似**——WGS84 椭球修正在编辑器场景里影响 < 5cm，无意义
- **不污染 `core/geometry/coords` 层**——后者管投影 / 坐标系，这个文件管"距离"

## 公共 API

| 符号                   | 类型 | 签名                                      | 摘要                        |
| ---------------------- | ---- | ----------------------------------------- | --------------------------- |
| `haversineMeters`      | fn   | `(a: GeoPoint, b: GeoPoint) => number`    | 两点大圆距离（米）          |
| `polylineLengthMeters` | fn   | `(points: readonly GeoPoint[]) => number` | 折线总长（米）              |
| `metersToDegLat`       | fn   | `() => number`                            | 1 米 → 纬度差（度）         |
| `metersToDegLng`       | fn   | `(latDeg: number) => number`              | 1 米 → 该纬度的经度差（度） |

## 详细条目

### 常量

```ts
const EARTH_RADIUS_M = 6_371_008.8; // WGS84 平均半径
const DEG_TO_RAD = Math.PI / 180;
```

`6_371_008.8` 是 WGS84 引用椭球的等积平均半径，比简单平均（6 371 000 m）准 9 m。

### `haversineMeters(a, b): number`

```ts
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = a.y * DEG_TO_RAD;
  const lat2 = b.y * DEG_TO_RAD;
  const dLat = (b.y - a.y) * DEG_TO_RAD;
  const dLng = (b.x - a.x) * DEG_TO_RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

经典 haversine。`Math.min(1, ...)` 是数值稳健性兜底——浮点累积误差让 `sqrt(h)` 略大于 1 时，`asin(NaN)` 会泄漏 NaN。

精度：

- 城市尺度（< 5 km）：< 0.1% 误差
- 跨地区（> 100 km）：误差仍 < 1%（球面 vs 椭球）
- 编辑器使用场景全在第一档

文件位置：`geo.ts:22-29`。

### `polylineLengthMeters(points): number`

```ts
export function polylineLengthMeters(points: readonly GeoPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!, points[i]!);
  }
  return total;
}
```

逐段累加 haversine。`< 2` 早退保证 lane 中心线只有 1 个点时不会数组下标越界。

用于：

- `LaneEntity.length` 派生（`core/elements/derive` 的 lane 规则）
- Inspector 的 "Length" 只读行
- 长度阈值校验（zod schema 的 `.refine`）

### `metersToDegLat(): number`

```ts
export function metersToDegLat(): number {
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M);
}
```

返回 1 m 对应的纬度差（度）。地球半径乘以 1 弧度 = 1 度的弧长（米），倒数即"1 米所占的度"。

值约为 `8.99e-6`（即 1 m ≈ 0.000009°）。

### `metersToDegLng(latDeg): number`

```ts
export function metersToDegLng(latDeg: number): number {
  const cosLat = Math.cos(latDeg * DEG_TO_RAD);
  if (cosLat < 1e-9) return metersToDegLat();
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M * cosLat);
}
```

经度的米 → 度依赖纬度（赤道附近 1° 经度 ≈ 111 km；极点附近 → 0）。`cosLat` 接近 0 时（极点）退化到 latDeg 的换算，避免除零。

用途：本地小尺度（< 100 m）的米 ↔ 度换算，例如在 `signalTemplate` 里画一个 1.5 m × 0.5 m 的 signal 矩形——避免引入完整 proj4 的开销。

## 副作用

- **零**——所有函数纯净，输入输出无副作用。
- 不读 store、不写 store、不写 console。

## 测试覆盖

`src/lib/__tests__/geo.test.ts`：

- 已知点对的 haversine 距离（北京 → 上海 ≈ 1067 km，误差 < 0.5%）
- `polylineLengthMeters` 单点 / 空数组返回 0
- `metersToDegLat`、`metersToDegLng` 在赤道 / 极点的退化行为

## 调用方

- `src/core/elements/derive/rules/lane.ts` — `lane.length = polylineLengthMeters(centralCurve)` 派生
- `src/core/geometry/apolloCompile/signalTemplate.ts` — signal 矩形的米 → 度换算
- `src/core/geometry/coords.ts` —— 间接通过 `mercatorMeters` 兜底（投影路径首选）
- Inspector "Length" 只读行

## 设计差异

| 选择              | 替代方案               | 取舍                                                    |
| ----------------- | ---------------------- | ------------------------------------------------------- |
| 球面 haversine    | WGS84 椭球（vincenty） | 椭球精度差异 < 5 cm，编辑器无意义；vincenty 实现 50+ 行 |
| 全局常量地球半径  | 椭球短长半径平均       | 同上；6371008.8 已是 WGS84 引用                         |
| 米 → 度小尺度换算 | proj4 完整投影         | proj4 ~200 KB；signalTemplate 仅几个点，不值            |

## 源码索引

| 行    | 内容                   |
| ----- | ---------------------- |
| 12    | `import GeoPoint`      |
| 14–17 | 常量                   |
| 22–29 | `haversineMeters`      |
| 35–42 | `polylineLengthMeters` |
| 49–51 | `metersToDegLat`       |
| 53–57 | `metersToDegLng`       |

## 数值稳定性细节

### `Math.min(1, Math.sqrt(h))` 的理由

```ts
return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
```

理论上 `0 ≤ h ≤ 1`，所以 `sqrt(h) ≤ 1`、`asin(sqrt(h))` 合法。但浮点累计误差让 `h` 偶尔等于 `1.0000000000000002`，`Math.sqrt` 产 `≈1.0000000001`，`Math.asin(1.0000000001) === NaN`。

`Math.min(1, …)` 把 sqrt 结果 clamp 到 `[0, 1]`，确保 `asin` 输入合法。

### `cosLat < 1e-9` 的退化

```ts
export function metersToDegLng(latDeg: number): number {
  const cosLat = Math.cos(latDeg * DEG_TO_RAD);
  if (cosLat < 1e-9) return metersToDegLat();
  return 1 / ((Math.PI / 180) * EARTH_RADIUS_M * cosLat);
}
```

纬度 = 90° 时 `cos(90°) ≈ 6e-17`（不精确为 0），会让 `1 / (...) → Infinity`。`< 1e-9` 把"接近极点"清晰退化到纬度的换算（极点本身的"经度差"无意义，退到一个保守值）。

阈值 `1e-9` 对应纬度 ≈ 89.99999994°——实际应用中永远不会遇到。

## 与 turf 的对比

如果换成 turf：

```ts
import { distance, length } from '@turf/turf';

distance([lng1, lat1], [lng2, lat2], { units: 'meters' });
```

- 增加 ~1.5MB bundle（turf 模块化，但 distance + length 至少 600KB）
- 接受 `[lng, lat]` 数组，不是 `{x,y}` 对象——需要适配层
- 没有"米 → 度"反换算

`geo.ts` 的 4 个函数 + 58 行已覆盖编辑器全部需求。

## 集成测试样例

```ts
// __tests__/geo.test.ts
import { haversineMeters, polylineLengthMeters, metersToDegLng } from '@/lib/geo';

const beijing = { x: 116.4074, y: 39.9042 };
const shanghai = { x: 121.4737, y: 31.2304 };

it('haversine 北京→上海 ≈ 1067km', () => {
  const m = haversineMeters(beijing, shanghai);
  expect(m).toBeGreaterThan(1_065_000);
  expect(m).toBeLessThan(1_070_000);
});

it('polyline empty', () => {
  expect(polylineLengthMeters([])).toBe(0);
  expect(polylineLengthMeters([beijing])).toBe(0);
});

it('赤道 1m ≈ 8.99e-6 度经度', () => {
  expect(metersToDegLng(0)).toBeCloseTo(8.99e-6, 8);
});

it('北纬 60° 1m ≈ 1.79e-5 度经度', () => {
  // cos(60°) = 0.5 → 度差是赤道的 2 倍
  expect(metersToDegLng(60)).toBeCloseTo(1.798e-5, 7);
});
```

## 参见

- `core/geometry/coords` —— Mercator 投影 / 坐标系基础
- `core/elements/derive/lane` —— 实际派生 `lane.length` 的规则
- [`entities` 类型](../types/entities.md) —— `GeoPoint` 定义
- `core/geometry/signalTemplate` —— 米 → 度换算调用方
- `src/lib/__tests__/geo.test.ts` —— 单测
