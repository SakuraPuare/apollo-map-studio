# export / routing_map

当前源码没有 `buildRoutingMap()`、`encodeGraph()`、`TopoGraph` 或 `routing_map.bin` 导出。旧文档中的 routing map 内容不是现有 API。

## Existing Topology API

可复用的是 lane 拓扑派生：

```ts
export function reconcileLaneTopology(entities: ReadonlyMap<string, MapEntity>): LaneTopologyDiff;

export function reconcileLaneTopologyIncremental(
  entities: ReadonlyMap<string, MapEntity>,
  options: LaneTopologyIncrementalOptions,
): LaneTopologyDiff;
```

返回：

```ts
interface LaneTopologyDiff {
  changes: Map<string, LaneEntity>;
}
```

会派生 pred/succ、左右邻、反向邻、self reverse 和 junctionId。

## Rules

- pred/succ：端点 `toFixed(6)` 后共享。
- selfReverse：两端互为反向。
- junctionId：中心线端点在 polygon 内，或线段穿越 polygon 边。
- neighbor：局部米空间中平行、纵向重叠至少 50%，横向距离约 1 到 8 米。
- 平行阈值约为 `cos(18deg)`。

## Export Relationship

base_map 导入后和导出前都会运行 `reconcileLaneTopology()`，所以 `base_map.bin` 的 lane 拓扑字段会随几何更新。但这不等于生成 Apollo `routing_map.bin`。

## Not Implemented

不存在以下 API 或文件输出：

- `buildRoutingMap`
- `TopoNode` / `TopoEdge`
- `encodeGraph`
- `routing_map.bin` 下载入口
