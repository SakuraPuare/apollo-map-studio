# 拓扑与车道连接

当前拓扑不是通过手工填写 predecessor/successor 列表完成，而是由几何重算规则维护。`mapStore.addEntity()`、`updateEntity()`、`removeEntity()` 在 lane 或 junction 受影响时会调用 `reconcileLaneTopologyIncremental()`；导入和导出 worker 会调用全量 `reconcileLaneTopology()`。

## 当前维护的 lane 拓扑字段

| 字段                      | 语义          | 来源                                              |
| ------------------------- | ------------- | ------------------------------------------------- |
| `predecessorIds`          | 上游车道      | 其它 lane 的终点与当前 lane 起点重合              |
| `successorIds`            | 下游车道      | 当前 lane 终点与其它 lane 起点重合                |
| `leftNeighborForwardIds`  | 同向左邻车道  | 几何方向近似平行、横向在左、纵向重叠足够          |
| `rightNeighborForwardIds` | 同向右邻车道  | 几何方向近似平行、横向在右、纵向重叠足够          |
| `leftNeighborReverseIds`  | 反向左邻车道  | 几何方向近似反向、横向在左、纵向重叠足够          |
| `rightNeighborReverseIds` | 反向右邻车道  | 几何方向近似反向、横向在右、纵向重叠足够          |
| `selfReverseLaneIds`      | 反向孪生车道  | A.start 与 B.end 重合，并且 A.end 与 B.start 重合 |
| `junctionId`              | 所属 junction | lane 中心线与 junction 多边形几何相交             |

拓扑重算不直接修改 `overlapIds`；overlap 由专门的 overlap reconcile 维护。

## predecessor / successor 判定

端点使用 `toFixed(6)` 后的经纬度字符串作为 key，大约是厘米量级。

```text
A.end == B.start  ->  A.successorIds 包含 B，B.predecessorIds 包含 A
B.end == A.start  ->  A.predecessorIds 包含 B，B.successorIds 包含 A
```

这也是 Connect Lanes 和 Snap 的核心意义：让两条 lane 的端点精确重合，然后由拓扑重算派生关系。

## 使用 Connect Lanes

Connect Lanes 是工具条左侧的连接按钮，也可按 `C`。

1. 点击 **Connect Lanes**，或按 `C`。
2. 点击第一条 lane。该 lane 会被记录为 `firstLaneId` 并选中。
3. 点击第二条 lane。
4. 系统计算第一条 lane 与第二条 lane 的四种端点组合距离。
5. 选择距离最近的一组，把第一条 lane 的对应端点移动到第二条 lane 对应端点。
6. 更新第一条 lane 后退出连接模式，并选中第一条 lane。
7. `mapStore.updateEntity()` 触发 topology/overlap 增量重算。

四种端点组合：

| 模式             | 几何效果              | 是否形成连续 pred/succ       |
| ---------------- | --------------------- | ---------------------------- |
| `AendToBstart`   | A 的终点贴到 B 的起点 | 是                           |
| `AstartToBend`   | A 的起点贴到 B 的终点 | 是                           |
| `AstartToBstart` | 两条 lane 起点重合    | 否，通常是 fork/merge 类几何 |
| `AendToBend`     | 两条 lane 终点重合    | 否，通常是 fork/merge 类几何 |

当前 UI 不弹出确认，也不显示距离阈值；它总是选择最近端点对。连接前建议放大地图，确认第一条 lane 是你希望被移动端点的 lane。

## Connect Lanes 对曲线源的处理

- Bezier 源：移动首/末锚点，同时平移该锚点的控制柄，再重新采样中心线。
- Arc 源：替换三点圆弧的起点或终点，再重新采样中心线。
- 无源或折线源：直接替换中心线首/末点。

处理结束后会调用 `applyDerive(..., { cause: 'editGeometry' })`，从而更新 lane length 和 turn 等派生字段。

## 取消连接模式

| 操作                   | 行为                                 |
| ---------------------- | ------------------------------------ |
| 再次点击 Connect Lanes | 切换关闭连接模式                     |
| `Escape`               | 退出连接模式，并向 FSM 发送 `CANCEL` |
| `H` / Default (Pan)    | 退出连接模式并回到默认模式           |
| 完成第二次 lane 点击   | 自动退出连接模式                     |

连接模式只接受 lane 命中。点击非 lane 或空白区域不会提交连接。

## neighbor 判定

邻接关系由几何自动推断，不通过 Inspector 手工添加。当前规则：

1. 两条 lane 方向点积必须大于约 `cos(18deg)` 才算同向，或小于 `-cos(18deg)` 才算反向。
2. 横向距离必须在 1-8 米之间。太近视为重叠/冲突，不算邻接；太远不算相邻。
3. 纵向投影重叠至少达到较短 lane 长度的 50%。
4. 根据相对当前 lane 左法向的正负区分 left/right。

这套规则适合手绘车道端点不完全对齐的场景，比“端点必须整齐并排”的规则更宽容。

## junctionId 判定

`junctionId` 由 lane 中心线与 junction polygon 的几何关系决定：

- 起点在 polygon 内。
- 终点在 polygon 内。
- 任一中心线线段穿越 polygon 边。

满足任一条件就认为 lane 属于该 junction。多个 junction 命中时，按当前索引顺序取第一个。这条规则与 overlap pipeline 中“lane centerline x polygon”的语义对齐，避免 `lane.junctionId` 和 `OverlapEntity{lane,junction}` 互相矛盾。

## Road / Section / Junction 归属

Road 归属不是通过地图点击工具完成，而是在 Layer Tree 中通过拖拽完成。

| 拖拽对象 | 目标                  | 效果                                             |
| -------- | --------------------- | ------------------------------------------------ |
| lane     | road                  | 放入 road 的第一个 section                       |
| lane     | road section          | 放入指定 section，并清除 lane.junctionId         |
| lane     | junction              | 设置 lane.junctionId，并从所有 road section 移除 |
| lane     | unparented lane group | 清除 junctionId，并从所有 road section 移除      |
| road     | junction              | 设置 road.junctionId                             |
| road     | unparented road group | 清除 road.junctionId                             |
| rsu      | junction              | 设置 rsu.junctionId                              |
| rsu      | unparented rsu group  | 清除 rsu.junctionId                              |

Layer Tree 顶部还可以新建 Road 和 RSU。新建 Road 会带一个初始 Section。

::: warning lane.junctionId 可能被几何重算覆盖
把 lane 拖入 junction 会写入 `junctionId`，但之后如果 lane/junction 几何变化触发拓扑重算，`junctionId` 会再次按几何相交规则派生。最终应以几何覆盖关系为准。
:::

## 删除时的引用清理

删除实体时，`mapStore.removeEntity()` 会：

1. 删除目标实体。
2. 通过 cascade delete 清理其它实体中对它的引用。
3. 如果删除 lane，会使 lane cache 失效。
4. 对受影响实体执行 topology/overlap 增量修正。

因此不建议绕过 store 直接改实体 Map；否则可能留下悬空引用。

## Inspector 中如何查看拓扑

选中 lane 后，Inspector 的 Topology 分组显示 Junction、Predecessors、Successors、四类 Neighbors、Self-Reverse 和 Overlaps。这些行是只读的，适合快速核对自动派生结果。

## 常见拓扑流程

### 绘制连续道路

1. 打开 Snap。
2. 画第一条 lane。
3. 画第二条 lane，并尽量让起点吸附到第一条终点。
4. 如果没吸附准，按 `C` 使用 Connect Lanes，先点第一条再点第二条。
5. 选中第一条 lane，确认 Successors 显示第二条 ID。
6. 选中第二条 lane，确认 Predecessors 显示第一条 ID。

### 绘制路口

1. 先绘制进入路口、路口内部转向、驶出路口的 lane。
2. 使用 Connect Lanes 让进入段、转向段、驶出段端点重合。
3. 使用 junction polygon 覆盖内部转向区域。
4. 选中转向 lane，确认 Junction 字段被派生。
5. 检查 approach -> turn -> exit 的 predecessor/successor。

### 维护 Road 结构

1. 打开 Layer Tree。
2. 点击 `+ Road` 创建 road。
3. 展开 Road 的 Section。
4. 将普通道路 lane 拖到 Section 下。
5. 如果 road 属于 junction，可把 road 拖到 junction 下。
6. Outline 中检查 Unparented Lanes。

## 注意事项

- 当前没有“Add Left Neighbor”或“Add Right Neighbor”按钮；邻接关系来自几何。
- Connect Lanes 只移动第一条 lane，第二条 lane 不动。
- fork/merge 端点重合可能产生 overlap 语义，但不一定产生 predecessor/successor。
- 导出前 worker 会再次全量重算 topology 和 overlap，因此最终导出的拓扑以导出时几何为准。
