# 导入 Apollo 地图

当前导入入口是 File 菜单或命令面板中的 **Import Apollo Map...**。实现位于 `src/io/mapIO.ts` 和 `src/io/apolloIO.worker.ts`：主线程只负责文件选择和状态落库，耗时的 protobuf 解码、坐标投影、实体桥接、拓扑重算和 overlap 重算都在 Web Worker 中完成。

## 支持格式

文件选择器接受：

- `.bin`：Apollo `apollo.hdmap.Map` binary protobuf。
- `.txt`：Apollo text protobuf。
- `.pb.txt`：Apollo text protobuf 的常见命名。

当前导入的是 Apollo Map 本身，不是 `routing_map.bin` 或 `sim_map.bin`。

## 导入步骤

1. 打开 File 菜单。
2. 选择 **Import Apollo Map...**。
3. 在系统文件选择器中选择 `.bin`、`.txt` 或 `.pb.txt`。
4. 如果文件较大，界面会在任务超过 1 秒后显示进度浮层。
5. 导入成功后，状态栏会显示导入文件名、lane 数量和 road 数量。
6. 左侧 Outline 会更新总实体数、各类型计数和健康检查。

导入完成后，`mapStore.replaceImportedEntities()` 会用导入结果替换当前实体集合，并清空撤销历史。因此导入新文件不是“追加到当前地图”，而是替换当前工作内容。

## 导入流水线

```text
文件选择
  -> 读取字节
  -> Worker 解码 binary/text protobuf
  -> 读取或补充 Header.projection.proj
  -> Apollo PointENU 投影为 WGS84 lon/lat
  -> Apollo proto tree 桥接为编辑器 MapEntity
  -> 全量重算 lane topology
  -> 全量重算 overlaps
  -> 分块发送实体到主线程
  -> 替换 mapStore.entities
```

其中坐标转换使用 `proj4`。导入后编辑器内部把所有 `PointENU` 坐标临时表示为经纬度：`x = longitude`，`y = latitude`。导出时再用同一个 PROJ 字符串转回 Apollo 期望的 ENU 米制坐标。

## 投影选择

导入 worker 会优先读取 `Map.header.projection.proj`。如果该字段不存在，会自动打开 **Choose Coordinate System** 弹窗。

弹窗提供三种方式：

| 模式          | 说明                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| Region preset | 预置 Sunnyvale UTM 10N、Beijing UTM 50N、Shanghai UTM 51N、Shenzhen UTM 50N |
| UTM zone      | 手动输入 1-60 区号，并选择 Northern 或 Southern 半球                        |
| Custom PROJ   | 粘贴完整 PROJ.4 字符串                                                      |

Apollo 示例中可能出现 `+lat_0={37.4}` 这样的模板花括号；导入投影代码会自动清理花括号后交给 `proj4`。

::: warning 投影必须正确
UTM 的 easting/northing 无法仅从 `(x, y)` 坐标反推出所在区号。缺少 `Header.projection.proj` 时，应根据地图实际区域选择正确的 UTM zone 或自定义 PROJ，否则导入后的经纬度位置会偏移，导出也会把错误坐标写回 Apollo map。
:::

## 导入后会恢复什么

当前实体桥接覆盖 Apollo Map 中的主要顶层实体：

| Apollo 类型     | 编辑器实体     | 导入后的编辑能力                                                   |
| --------------- | -------------- | ------------------------------------------------------------------ |
| `lane`          | `lane`         | 可选择、拖拽中心线控制点、编辑属性、参与拓扑和 overlap 重算        |
| `road`          | `road`         | 在 Layer Tree 中显示 Section 和 lane 归属，可拖拽归属              |
| `junction`      | `junction`     | 可选择、拖拽多边形控制点，参与 lane.junctionId 派生                |
| `pnc_junction`  | `pncJunction`  | 可编辑多边形；Inspector 可维护 passage group / passage 引用        |
| `parking_space` | `parkingSpace` | 可编辑多边形/矩形源；Inspector 可编辑 heading                      |
| `crosswalk`     | `crosswalk`    | 可编辑多边形/矩形源，参与 lane overlap                             |
| `signal`        | `signal`       | 可编辑 stop line 源，Inspector 可改信号灯类型、subsignal、signInfo |
| `stop_sign`     | `stopSign`     | 可编辑 stop line 源，Inspector 可改类型                            |
| `speed_bump`    | `speedBump`    | 可编辑位置线，参与 lane overlap                                    |
| `yield_sign`    | `yieldSign`    | 可编辑 stop line                                                   |
| `clear_area`    | `clearArea`    | 可编辑多边形/矩形源                                                |
| `area`          | `area`         | 可编辑多边形，Inspector 可改 type/name                             |
| `barrier_gate`  | `barrierGate`  | 可编辑 stop line，Inspector 可改 type                              |
| `rsu`           | `rsu`          | 在 Layer Tree 中可拖入/移出 junction                               |
| `overlap`       | `overlap`      | 会导入为实体，但随后按几何事实全量 reconcile                       |
| `speed_control` | `speedControl` | 类型存在于实体 union，若源图包含会保留在集合中                     |

导入过程中会保留一份 lon/lat 形式的原始 Apollo map tree 在 IO worker 缓存中。导出时用当前编辑实体合并回这份原始 tree，因此未在 UI 中直接编辑的 header 或 proto 字段不会因为一次编辑而被整图重建为空。

## 拓扑与 overlap 重算

导入后会执行两类全量处理：

1. `reconcileLaneTopology()`：从 lane 和 junction 几何重算 predecessor、successor、selfReverse、四类 neighbor 和 junctionId。
2. `reconcileOverlaps()`：从几何关系重算 derived overlap，并同步参与实体的 `overlapIds`。

这意味着导入文件中已有的某些 topology/overlap 字段可能被当前几何规则规范化。例如，代码中的 overlap 语义以几何事实为准，派生 ID 使用 `overlap_<sorted participant ids>` 形态；不再为“导入原样保留但几何已不相交”的 overlap 开特殊保留分支。

## 进度与错误

导入任务会通过 `taskProgressStore` 显示阶段性进度，典型 detail 包括：

- Decoding protobuf
- Waiting for projection
- Projecting coordinates
- Building editable entities
- Recomputing topology and overlaps
- Sending entities
- Applying result

失败时错误会写入 `apolloMapStore.lastError`，控制台也会输出 `[mapIO] import failed`。

## 导入后的检查建议

1. 看状态栏导入文件名和 lane/road 数量是否符合预期。
2. 打开 Outline，看 Apollo HD-Map 各类型计数和 Health。
3. 如果 `Unparented Lanes` 很高，检查 Road/Section 归属或 junction 归属是否符合源图。
4. 打开 Layer Tree，确认 road、section、junction 层级。
5. 搜索几个已知 lane ID，确认可选中并在 Inspector 中看到属性和拓扑引用。
6. 对大图先不要立即编辑，先导出 `.txt` 做一次 round-trip 抽查。

## 当前限制与注意事项

- 没有拖放导入区；导入通过系统文件选择器完成。
- 导入会替换当前 mapStore 实体并清空撤销历史。
- 如果 IO worker 中没有已导入的原始 map 缓存，导出会失败并提示没有 cached imported Apollo map；因此当前导出流程应从导入过的 Apollo map 开始。
- 缺少投影时取消投影弹窗会导致导入流程无法继续得到有效投影。
- Timeline 面板不参与导入数据恢复。
