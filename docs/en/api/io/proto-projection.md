---
title: io / proto-projection
description: src/io/proto/projection.ts — proj4 wrapper and UTM presets
---

# io / proto-projection

> Mirror page of [Geo / Projection](/en/api/geo-projection) under
> the io sub-tree.

## Exported symbols

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

> Source: `src/io/proto/projection.ts:1-81`.

## Behaviour

- `sanitizeProjString` strips Apollo-style `+lat_0={...}` template
  braces.
- `makeProjection` builds a bidirectional proj4 pipeline between the
  PROJ string and WGS84.
- `toLonLat` / `fromLonLat` preserve `z` absence to keep round-trips
  byte-equal.
- `utmProjString` throws for zones outside `[1, 60]`.
- `utmZoneFromLon` applies the 6°-per-zone rule.
- `UTM_PRESETS` exposes the four common Apollo deployment regions.
  `apolloIOBridge.FALLBACK_PROJ = UTM_PRESETS.beijing`.

## Consumers

| Consumer                       | Usage                                         |
| ------------------------------ | --------------------------------------------- |
| `src/io/proto/adapter.ts`      | `makeProjection` + `transformPointsInMessage` |
| `src/io/apolloIOBridge.ts`     | `UTM_PRESETS.beijing` as fallback             |
| `src/store/projDialogStore.ts` | populates the projection-picker UI presets    |

## Notes

- No instance caching here — proj4 caches pipelines internally per
  (source, target) PROJ pair, so re-calling `makeProjection` with
  the same string is cheap.
- proj4 throws on malformed input; the bridge surfaces this as
  `IMPORT/EXPORT ERROR`.

## See also

- [Geo / Projection](/en/api/geo-projection) — top-level mirror.
- [io/proto-adapter](/en/api/io/proto-adapter) — primary consumer.
