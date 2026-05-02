# proto / schema 与 entity bridge

Apollo proto 位于 `src/proto/`，运行时入口是 `map_msgs/map.proto` 的 `apollo.hdmap.Map`。编辑器通过 `src/io/proto/entityBridge` 在 raw proto object 和 `MapEntity` 之间转换。

## Supported Map Fields

| proto 字段      | entityType     |
| --------------- | -------------- |
| `crosswalk`     | `crosswalk`    |
| `junction`      | `junction`     |
| `lane`          | `lane`         |
| `stop_sign`     | `stopSign`     |
| `signal`        | `signal`       |
| `yield`         | `yieldSign`    |
| `overlap`       | `overlap`      |
| `clear_area`    | `clearArea`    |
| `speed_bump`    | `speedBump`    |
| `road`          | `road`         |
| `parking_space` | `parkingSpace` |
| `pnc_junction`  | `pncJunction`  |
| `rsu`           | `rsu`          |
| `ad_area`       | `area`         |
| `barrier_gate`  | `barrierGate`  |

`apolloMapToEntities()` 按上表固定顺序输出实体。`entitiesToApolloMap(baseMap, entities)` 浅拷贝导入底稿，然后替换上表字段；没有实体的类型会写出空数组。

## Common Helpers

`common.ts` 提供：

- `unwrapId()` / `wrapId()` 与数组版本。
- `pointFromProto()` / `pointToProto()`，保留 `x/y/z`。
- `convertPolygonFromProto()` / `convertPolygonToProto()`。
- `curveFromProto()` / `curveToProto()`。
- `curveArrayFromProto()` / `curveArrayToProto()`。

## Enums

`enums.ts` 把 proto number enum 映射到 entity 字符串枚举，覆盖 lane boundary/type/turn/direction、junction、road、stop sign、signal/subsignal/sign info、passage、barrier gate、area 等。未知值按调用点 fallback，例如 lane type fallback 为 `NONE`。

## Lane / Road

`rawLaneToEntity()` 缺失 id 时返回 `null`。它保留：

- `central_curve`、左右 boundary curve、boundary type、boundary length/virtual。
- `length`、`speed_limit`。
- pred/succ、左右邻、反向邻、self reverse。
- `junction_id`，缺失为 `null`。
- `overlap_id`。
- `left_sample`、`right_sample`、`left_road_sample`、`right_road_sample`。

`entityToRawLane()` 反向写出上述字段，`junctionId !== null` 时才写 `junction_id`。

`rawRoadToEntity()` 保留 road section、lane ids、junction id、road type，以及 outer polygon / holes / boundary edge。

## Overlap

`overlap.ts` 保留 lane `start_s`、`end_s`、`is_merge`、`region_overlap_id`，crosswalk `region_overlap_id`，以及其它实体的 oneof 类型。真实地图中 object 可能只有 `id` 而 oneof 为空；这种情况会保存为 `objectType: 'unknown'`，导出时仍只写 `{ id }`，避免 roundtrip 丢条目。

`region_overlap[]` 转为 `{ id, polygons }`，polygon 点列通过 common polygon helper 转换。

## Editor Meta

`editorMeta.ts` 提供 `readEditorMeta()`、`writeEditorMeta()` 和 `entityKey()`，版本号为 `EDITOR_META_VERSION = 1`。它是编辑器私有元数据，不是 Apollo 官方 proto 字段的公开 API。

## Not Implemented

当前没有 routing graph schema codec、sim map 生成器，也没有从空项目构建完整 Apollo header 的公开 API；导出以导入底稿为基础合并当前实体。
