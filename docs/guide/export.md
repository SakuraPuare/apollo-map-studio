# 导出 Apollo 地图

当前导出入口位于 File 菜单和命令面板：

- **Export Apollo Map (.bin)**，快捷键 `Ctrl/⌘+S`
- **Export Apollo Map (.txt)**，快捷键 `Ctrl/⌘+Shift+S`

导出实现位于 `src/io/mapIO.ts`、`src/io/apolloIOBridge.ts` 和 `src/io/apolloIO.worker.ts`。当前不会生成 `sim_map.bin` 或 `routing_map.bin`；只导出 Apollo HD Map 本身的 binary protobuf 或 text protobuf。

## 导出前提

当前导出依赖一次成功导入：

1. 导入时 IO worker 缓存 lon/lat 形式的原始 Apollo map tree。
2. 导出时把当前编辑实体合并回这份缓存。
3. 再按导入时使用的 PROJ 字符串投影回 ENU。
4. 最后编码为 `.bin` 或 `.txt`。

如果没有导入过地图，`mapIO.currentExportContext()` 会设置错误：`Nothing to export - import a map first.`。如果主线程有 info 但 worker 没有 cached raw map，worker 会抛出 `No imported Apollo map is cached in the IO worker.`。

## 导出步骤

1. 确认已导入 Apollo map。
2. 完成绘制、拖拽、Layer Tree 归属、Inspector 属性编辑。
3. 如需检查数据，打开 Outline 和 Lane Inspector 查看 counts、topology、overlaps。
4. 选择 File -> **Export Apollo Map (.bin)** 或 **Export Apollo Map (.txt)**。
5. 大图导出时等待任务进度浮层完成。
6. 浏览器下载文件。

建议文件名由原始导入文件名加时间戳生成：

```text
<original-base>-YYYYMMDDhhmmss.bin
<original-base>-YYYYMMDDhhmmss.txt
```

## 导出流水线

```text
当前 mapStore.entities
  -> 分块发送到 Apollo IO worker
  -> 全量重算 lane topology
  -> 全量重算 overlaps
  -> 合并回导入时缓存的 lon/lat Apollo map tree
  -> 使用导入 projString 转回 Apollo ENU PointENU
  -> encodeMapBin 或 encodeMapText
  -> 下载 Blob
```

## `.bin` 与 `.txt`

| 格式   | MIME                       | 用途                                                   |
| ------ | -------------------------- | ------------------------------------------------------ |
| `.bin` | `application/octet-stream` | Apollo Map binary protobuf，通常用于运行时加载         |
| `.txt` | `text/plain`               | Apollo Map text protobuf，便于人工 diff、排查和 review |

两者都来自同一个导出实体集合和同一个 PROJ 转换。`.txt` 不是简化格式，也不是 routing map。

## 坐标处理

导入时：

```text
Apollo PointENU (x/y = UTM/ENU meters)
  -> proj4 to WGS84
编辑器中 PointENU-like 对象使用 x=lon, y=lat
```

导出时：

```text
编辑器 lon/lat
  -> proj4 from WGS84
Apollo PointENU (x/y = UTM/ENU meters)
```

同一个 `ApolloMapImportInfo.projString` 会用于导出。该字符串来自导入文件 header 或用户在缺失投影弹窗中选择的值。

## 拓扑与 Overlap 导出前重算

导出 worker 会：

1. 把实体数组转成 `Map<string, MapEntity>`。
2. 执行全量 `reconcileLaneTopology()`。
3. 执行全量 `reconcileOverlaps()`。
4. 把 patch 写回 entity map。

Overlap 以几何事实为准：

- 派生 ID 形如 `overlap_<sorted participant ids>`。
- 导入过但几何已不成立的 overlap 会在 reconcile 中移除。
- 参与实体的 `overlapIds` 会同步更新。
- lane x crosswalk 会生成 region overlap。
- 在 Overlap Inspector 中 pin 的 `isMerge` 或 `regionOverlaps` 会通过 `_userOverrides` 避免被后续 reconcile 覆盖。

## 与原始 Apollo map 的合并

导出不是从空白 `Map` 重新拼所有字段。`entitiesToApolloMap(cachedRawLonLatMap, processed.entities)` 会把当前编辑实体合并进导入时缓存的 Apollo map tree。

这样做的效果：

- UI 直接支持的实体会使用当前编辑结果。
- header 等未直接编辑字段继续来自导入源。
- proto2 optional 字段的“缺省”和“显式 0”语义尽量通过 bridge 保留。

## 当前不会导出的内容

- 不会同时下载 `base_map.bin`、`sim_map.bin`、`routing_map.bin` 三个文件。
- 没有导出对话框。
- 没有独立的 routing graph 生成 UI。
- 没有导出前专门的 validation dialog。
- Timeline 面板内容不会写入 Apollo map。

## 推荐导出检查流程

1. 打开 Outline，确认 Total entities 和类型计数。
2. 检查 Health 中的 Unparented Lanes 与 Dangling junction_id。
3. 对关键 lane 检查 Predecessors、Successors、Neighbors、Junction、Overlaps。
4. 对信号灯检查 stop line、subsignals 和 signInfo。
5. 对 PNC 路口检查 passage group 引用是否完整。
6. 先导出 `.txt`，用文本 diff 或 Apollo 工具链抽查结构。
7. 再导出 `.bin` 给 Apollo 运行环境使用。

## 常见错误

| 现象                        | 可能原因                                               | 处理                                                            |
| --------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| 点击导出没有下载            | 没有导入过地图                                         | 先导入 `.bin` 或 `.txt`                                         |
| worker 报 no cached raw map | 页面状态与 worker 缓存不一致，或刷新后只恢复了 UI 状态 | 重新导入源 map 后再导出                                         |
| 坐标导出后位置错误          | 导入时投影选错                                         | 使用正确 `Header.projection.proj` 或重新导入并选择正确 UTM/PROJ |
| topology 与预期不符         | 端点未重合或 junction 几何未覆盖                       | 使用 Snap/Connect Lanes 修正端点，调整 junction polygon         |
| overlap 数量变化            | 当前几何 reconcile 以几何事实重算                      | 检查参与元素空间关系，必要时 pin region/isMerge                 |
