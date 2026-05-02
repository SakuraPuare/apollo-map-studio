# geo / projection

当前投影 API 在 `src/io/proto/projection.ts` 与 `src/io/proto/adapter.ts`。旧版 `createProjection()`、`setGlobalProjection()`、`lngLatToENU()` 不存在。

## Projection API

```ts
export function sanitizeProjString(s: string): string;
export function makeProjection(projString: string): Projection;
export function utmProjString(zone: number, hemisphere: 'N' | 'S' = 'N'): string;
export function utmZoneFromLon(lonDeg: number): number;
export const UTM_PRESETS: {
  sunnyvale: string;
  beijing: string;
  shanghai: string;
  shenzhen: string;
};
```

```ts
interface PointXY {
  x: number;
  y: number;
  z?: number;
}

interface Projection {
  readonly projString: string;
  toLonLat(p: PointXY): PointXY;
  fromLonLat(p: PointXY): PointXY;
}
```

`sanitizeProjString()` 把 Apollo 示例中的 `+lat_0={37.413082}` 清洗为 `+lat_0=37.413082`。

`makeProjection()` 用 `proj4(clean, WGS84)` 和 `proj4(WGS84, clean)` 建立双向转换。导入后编辑器内部仍使用 `PointENU` shape，但约定为 `x = longitude`、`y = latitude`；导出前再转回 Apollo ENU/UTM 米坐标。`z` 存在时原样保留。

## Adapter API

```ts
export function transformPointsInMessage(
  type: protobuf.Type,
  msg: unknown,
  transform: (p: PointXY) => PointXY,
): unknown;

export async function apolloMapToLonLat(map, projString): Promise<ApolloMapInLonLat>;
export async function apolloMapFromLonLat(map, projString): Promise<{ map; projection }>;
export function readHeaderProjString(map: Record<string, unknown>): string | null;
export function entityCounts(map: Record<string, unknown>): Record<string, number>;
```

`transformPointsInMessage()` 按 protobuf schema 递归遍历，只转换 full name 为 `.apollo.common.PointENU` 的 message，并返回新对象，不原地修改输入。

`readHeaderProjString()` 读取 `map.header.projection.proj`，支持 string、`Uint8Array` 和 number array；缺失返回 `null`。导入时缺失投影会触发 `NEEDS_PROJECTION`。

## UTM Helpers

`utmProjString()` 要求 zone 在 1 到 60，否则抛错；南半球追加 `+south`。`utmZoneFromLon()` 会把经度 wrap 到 `[-180, 180]` 后按 6 度分区。只凭 UTM `(x, y)` 无法推出 zone，因此缺失 projection 时必须由用户或外部信息提供区域。
