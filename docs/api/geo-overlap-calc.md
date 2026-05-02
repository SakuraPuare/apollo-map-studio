# geo / overlap calculation

overlap 管线位于 `src/core/elements/overlap`。当前主入口是：

```ts
export function reconcileOverlaps(
  entities: ReadonlyMap<string, MapEntity>,
  mode: ReconcileMode,
  index?: SpatialIndex,
): ReconcilePatch;
```

```ts
type ReconcileMode = { mode: 'full' } | { mode: 'incremental'; dirtyIds: ReadonlySet<string> };

interface ReconcilePatch {
  changes: Map<string, MapEntity>;
  removedOverlapIds: Set<string>;
  stats: {
    pairsTested: number;
    pairsMatched: number;
    overlapsCreated: number;
    overlapsRemoved: number;
    durationMs: number;
  };
}
```

## Main Flow

1. 同步空间索引。
   - full：`syncFromEntities()`。
   - incremental：`syncDirty(entities, dirtyIds)`。
2. 收集 dirty lanes。
   - full：所有 lane。
   - incremental：dirty lane 本身，或 dirty overlap participant 附近 bbox 命中的 lane。
3. 对每条 lane 查询 bbox 邻居。
4. 分类型检测 pair。
5. 生成语义派生 overlap id。
6. 与现有 overlap diff，生成 `changes` 和 `removedOverlapIds`。
7. 回写参与实体的 `overlapIds`。

默认使用共享 `SpatialIndex`；导入/导出时显式传入新的 `SpatialIndex` 做全量计算。

## IDs

```ts
export function makeOverlapId(participantIds: readonly string[]): string;
export function isDerivedOverlapId(id: string): boolean;
export function makeRegionId(participantIds: readonly string[], slot = 0): string;
export function isDerivedRegionId(id: string): boolean;
```

overlap id 和 region id 都会对参与者去重、排序。空参与者会抛错。region slot 必须是非负整数。

## Pair Rules

`PAIR_RULES` 当前覆盖：

| secondaryType  | geometry  | region |
| -------------- | --------- | ------ |
| `junction`     | polygon   | no     |
| `crosswalk`    | polygon   | yes    |
| `clearArea`    | polygon   | no     |
| `parkingSpace` | polygon   | no     |
| `pncJunction`  | polygon   | no     |
| `area`         | polygon   | no     |
| `signal`       | stopLines | no     |
| `stopSign`     | stopLines | no     |
| `yieldSign`    | stopLines | no     |
| `barrierGate`  | stopLines | no     |
| `speedBump`    | polylines | no     |

所有普通 pair 都以 lane 为 primary，因为 Apollo `LaneOverlapInfo` 携带 `start_s/end_s`。

## Geometry Detection

polygon：

- `getPolygon(other)` 取实体 polygon。
- `polylineIntersectsPolygon(centerline, poly)` 判断是否相交。
- `polylinePolygonCrossings()` 计算 crossing 后投影为 lane 上的 s 区间。
- 没有 crossing 但相交时，区间 fallback 为 `[0, laneArcLength(lane)]`。

stopLines / polylines：

- `getStopLines()` 或 `getPolylines()`。
- `polylinesIntersect()` 与 `polylinePolylineCrossings()`。
- 多个交点合并为 `[minS, maxS]`。

lane × lane：

- junction 内：中心线穿越、start-start 分流、end-end 合流都算 overlap。
- junction 外：只有真实中心线穿越且不是单纯端点共享才算 overlap。
- `isMerge` 只在 end-end 合流时为 true。
- 局部 `cosLat` 使用 laneA 起点纬度，避免跨纬度地图全图均值误差。

## Lane S

```ts
export function laneArcLength(lane: LaneEntity): number;
export function projectSegmentParam(lane: LaneEntity, segmentIndex: number, t: number): number;
export function invalidateLaneArcLength(laneId: string): void;
export function clearLaneArcLengthCache(): void;
```

`computeLaneS.ts` 使用 haversine 米距离构建 prefix cache。cache key 是 lane id，revision 是 centerline 数组引用；引用变化会自动重算。`projectSegmentParam()` 对 segment index 和 t 做边界钳制。

## Region Overlap

只有 `lane × crosswalk` 当前启用 `computeRegion`。流程：

1. `laneCorridorPolygon(lane)` 构造 lane 走廊闭合环。
2. `intersectPolygons(corridor, crosswalkPolygon)`。
3. `largestRing()` 取最大区域。
4. 生成 `region_<sortedParticipants...>`。
5. 写入 `OverlapEntity.regionOverlaps`，并在 lane/crosswalk object 上写 region id。

`laneCorridorPolygon()` 优先使用显式左右边界；没有时用中心线 offset 和左右 sample width。中心线少于 2 点或 width <= 0 返回空数组。

## Overrides

`mergeWithOverrides()` 支持用户 pin：

- `objects.<i>.laneOverlapInfo.isMerge`：保留旧 `isMerge`。
- `regionOverlaps`：保留旧 region polygons，并同步保留 object 上的 region id。

其它字段如 `startS/endS` 跟随几何重算。

## Spatial Index

`spatialIndex.ts` 基于 RBush：

- `bboxForEntity(entity)` 为可参与 overlap 的实体生成 bbox。
- `SpatialIndex.syncFromEntities()` 全量同步。
- `SpatialIndex.syncDirty()` 增量刷新 dirty ids。
- `queryBBox()` 返回 bbox 邻居。

这把 pair 搜索从全表扫描降为 lane × nearby candidates。

## Tests

覆盖测试包括：

- `intersect.test.ts`：bbox、点在多边形、折线相交、crossings。
- `polyClip.test.ts`：polygon clipping。
- `laneCorridor.test.ts`：显式边界和 offset fallback。
- `overlapId.test.ts`、`regionId.test.ts`：id 稳定性和错误边界。
- `reconcile.test.ts`：full/incremental diff、overlapIds 回写、override。
- `overlap.bench.ts`：性能基准。
