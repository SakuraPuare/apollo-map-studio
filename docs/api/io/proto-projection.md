---
title: io / proto-projection
description: src/io/proto/projection.ts — proj4 包装与 UTM presets
---

# io / proto-projection

> 本页是 [Geo / Projection](/api/geo-projection) 的同源镜像。
> 内容相同，存在两份方便从不同入口跳转。

## 公开符号

```ts
export function sanitizeProjString(s: string): string;

export interface PointXY {
  x: number;
  y: number;
  z?: number;
}

export interface Projection {
  readonly projString: string;
  toLonLat(p: PointXY): PointXY;
  fromLonLat(p: PointXY): PointXY;
}

export function makeProjection(projString: string): Projection;

export function utmProjString(zone: number, hemisphere?: 'N' | 'S'): string;
export function utmZoneFromLon(lonDeg: number): number;

export const UTM_PRESETS: {
  readonly sunnyvale: string;
  readonly beijing: string;
  readonly shanghai: string;
  readonly shenzhen: string;
};
```

> Source: `src/io/proto/projection.ts:1-81`

## 行为速览

- `sanitizeProjString` 去除 Apollo 风格的 `+lat_0={...}` 模板花括号；
- `makeProjection` 用 `proj4` 在 PROJ string 与 WGS84 之间构造双向
  pipeline；
- `toLonLat` / `fromLonLat` 不会写入 `z=0`（保留缺省以保 round-trip
  fidelity）；
- `utmProjString` 在 `zone < 1 || zone > 60` 时抛错；
- `utmZoneFromLon` 用每 6° 一区的规则反推；
- `UTM_PRESETS` 提供 sunnyvale / beijing / shanghai / shenzhen 4 个
  常见 PROJ string，`apolloIOBridge.FALLBACK_PROJ = UTM_PRESETS.beijing`。

## 调用图

| 调用方                         | 用法                                          |
| ------------------------------ | --------------------------------------------- |
| `src/io/proto/adapter.ts`      | `makeProjection` + `transformPointsInMessage` |
| `src/io/apolloIOBridge.ts`     | `UTM_PRESETS.beijing` 作为 fallback           |
| `src/store/projDialogStore.ts` | 给 UI 选择器列出 presets                      |

## 注意事项

- 内部不缓存 Projection 实例 —— proj4 自身已经按 (src, dst) 缓存
  pipeline，重复 `makeProjection(sameStr)` 成本可控；
- `proj4` 在解析非法字符串时会抛错，bridge 会传播为 `IMPORT/EXPORT
ERROR`。
