# geo / lane geometry

当前 lane geometry 分散在 `src/core/geometry` 与 `src/core/geometry/apolloCompile`。旧版 `computeBoundaries()`、`computeLaneSamples()`、Turf API 文档不对应当前源码。

## Curve / Polygon

```ts
export function pointsToCurve(points: GeoPoint[]): Curve;
export function pointsToPolygon(points: GeoPoint[]): ApolloPolygon;
export function curvePoints(curve: Curve | undefined): GeoPoint[];
export function explicitLaneBoundaryEdges(lane: LaneEntity): LaneBoundaryEdges | null;
```

`pointsToCurve()` 生成单段 `Curve`，`s/heading/length` 初始为 0。`curvePoints()` 会拼接所有 segment 的 `lineSegment.points`，并去掉相邻重复点。

`explicitLaneBoundaryEdges()` 用导入 Apollo lane 的真实左右边界：

- 左右任一边少于 2 点时返回 `null`。
- 会按中心线方向自动翻转边界点列。
- 左右边界组成的 corridor 面积退化时返回 `null`。

## Lane Rendering Geometry

`compileApolloFeatures()` 中 lane 渲染逻辑：

- 中心线少于 2 点时不产出 feature。
- 优先使用 `explicitLaneBoundaryEdges()`。
- 没有显式边界时，取 `leftSamples[0].width`、`rightSamples[0].width`，缺失 fallback 到 `DEFAULT_LANE_HALF_WIDTH`，再用 `offsetPolylineDeg()` 生成边界。
- polygon 为 `leftEdge + reverse(rightEdge)`。
- `direction = BIDIRECTION` 时产出 forward/backward 两条中心线；`BACKWARD` 时中心线坐标反向。

## Offset Polyline

```ts
export function offsetPolylineDeg(
  points: GeoPoint[],
  offsetMeters: number,
  side: 'left' | 'right',
): GeoPoint[];
```

实现位于 `apolloCompile/offsetPolyline.ts`。它在经纬度上使用局部米空间近似，处理 miter、bevel、内侧交点和 tight curve loop collapse。测试覆盖：

- 直线左右偏移距离。
- 90 度转弯内外侧。
- 150 度尖角 bevel。
- 密集曲线不被错误裁成长弦。
- 内侧偏移线和 lane polygon 不自交。

## Lane Creation

```ts
export function createApolloEntity(type: MapElementType, draw: DrawResult): MapEntity;
export function inferLaneTurn(centerPts: GeoPoint[]): LaneTurn;
```

lane 创建时：

- 支持 polyline、Bezier、arc、Catmull-Rom。
- `centralCurve` 来自采样点。
- 左右 boundary 初始为空 curve，但写入默认 boundary type。
- `length` 用 `polylineLengthMeters(centerPts)`。
- `turn` 由起止方向夹角推断：
  - 小于 `TURN_INFER_NO_TURN_RAD` 为 `NO_TURN`。
  - 大于等于 `TURN_INFER_U_TURN_RAD` 为 `U_TURN`。
  - 正角为 `LEFT_TURN`，负角为 `RIGHT_TURN`。
- 默认 lane type 为 `CITY_DRIVING`，direction 为 `FORWARD`，speed limit 为 `DEFAULT_LANE_SPEED_LIMIT_MPS`。

## Edit Points

`apolloCompile/editPoints.ts` 提供：

- `getApolloEditPoints()`
- `setAllApolloEditPoints()`
- `setApolloEditPoint()`
- `moveApolloEntity()`
- `deleteApolloVertex()`
- `apolloEntityCoords()`
- `isApolloAreaEntity()`
- `isApolloPolygonEditPoints()`

这些函数按 entity 类型读写中心线、polygon、stop line 或 position，并用于编辑器点位操作。

## Snap / Connect

```ts
export function pixelsToMeters(pixels: number, lat: number, zoom: number): number;
export function collectCandidates(entities: Iterable<MapEntity>, excludeId: string | null): {
  vertices: VertexCandidate[];
  edges: EdgeCandidate[];
};
export function findSnapTarget(...): SnapTarget | null;

export function planConnection(a: LaneEntity, b: LaneEntity): ConnectionPlan | null;
export function applyLaneConnection(lane: LaneEntity, plan: ConnectionPlan): LaneEntity;
```

snap 规则：

- lane 只暴露中心线起点/终点作为 vertex snap，并带 `endpointRole: 'start' | 'end'`。
- lane 内部点只能通过 edge snap 命中，不会伪造拓扑连接。
- polygon 会闭合 last 到 first 的边。
- `excludeId` 用于拖动时排除自身。
- vertex 优先于 edge。

connect 规则：

- 从 A/B 四种端点组合中选择最近组合。
- `AendToBstart` 与 `AstartToBend` 视为连续连接。
- `AstartToBstart` / `AendToBend` 是 fork/merge，不直接建立 pred/succ。
- `applyLaneConnection()` 会保持 Bezier/arc source 同步，并运行 `applyDerive(editGeometry)`。

## Lane Topology

```ts
export function reconcileLaneTopology(entities: ReadonlyMap<string, MapEntity>): LaneTopologyDiff;
export function reconcileLaneTopologyIncremental(...): LaneTopologyDiff;
```

规则：

- pred/succ：端点 `toFixed(6)` 共享。
- junctionId：中心线与 junction polygon 相交。
- selfReverse：起终点反向重合。
- neighbor：局部米空间中方向平行/反平行、横向 1 到 8 米、纵向重叠至少 50%。

性能注释中标明全量 O(N²)，1000 lane 量级低于 10ms；增量接口减少 store 写回范围。

## Spatial Worker

`src/core/workers` 用于渲染冷层和 hit test：

- `SYNC` / `SYNC_BEGIN` / `SYNC_CHUNK` / `SYNC_FINISH`：全量同步。
- `INCREMENTAL`：只返回 changed groups 和 removed ids。
- `HIT_TEST`：返回按 tier/distance 排序的命中。

worker 内部用 RBush 存 bbox，用 `LaneJunctionGraph` 追踪共享端点 lane 的依赖，lane 边界装饰缓存按 affected lane 增量刷新。
