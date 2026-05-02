# export / base_map

当前导出入口是：

```ts
export async function exportApolloBin(): Promise<void>;
export async function exportApolloText(): Promise<void>;
```

源码中没有独立 `buildBaseMap()` API。导出在 `apolloIO.worker.ts` 内完成：拓扑和 overlap 重算、entity bridge 合并、坐标反投影、bin/text 编码。

## Preconditions

`currentExportContext()` 要求已有导入信息：

- `useApolloMapStore.getState().info`
- 当前 `useMapStore.getState().entities`
- worker 内 `cachedRawLonLatMap`

没有导入来源时会写入：

```text
Nothing to export - import a map first.
```

worker 缺少导入底稿时会抛：

```text
No imported Apollo map is cached in the IO worker.
```

## Main Thread Flow

1. 读取导出上下文。
2. 开始 task：`apollo-export`。
3. 调用 `apolloIOBridge.exportBin()` 或 `exportText()`。
4. worker 返回 `Uint8Array`。
5. 复制 bytes，创建 Blob。
6. `downloadBlob()` 下载。

文件名为原文件名去后缀后追加时间戳：

```ts
`${base}-${YYYYMMDDhhmmss}.${bin | txt}`;
```

## Worker Protocol

导出采用分块发送：

```ts
{
  type: ('BEGIN_EXPORT', requestId, format, projString, total);
}
{
  type: ('EXPORT_ENTITIES_CHUNK', requestId, entities, offset, total);
}
{
  type: ('FINISH_EXPORT', requestId);
}
```

主线程每 2000 个实体发一块，并在块之间 `setTimeout(0)` 让出主线程。worker 收齐数量不等于 `total` 时抛错。

## Worker Pipeline

`runExport()`：

1. 校验 `cachedRawLonLatMap`。
2. `applyImportTopology(entities)`：
   - `reconcileLaneTopology()`
   - `reconcileOverlaps(..., { mode: 'full' }, new SpatialIndex())`
3. `entitiesToApolloMap(cachedRawLonLatMap, processed.entities)` 合并当前实体。
4. `apolloMapFromLonLat(merged, projString)` 把所有 `PointENU` 转回 Apollo ENU/UTM。
5. 编码：
   - bin：`encodeMapBin(enuMap)`，会 `Map.verify()`。
   - text：`encodeMapText(enuMap)`，再 `TextEncoder`。
6. transfer `bytes.buffer` 返回主线程。

## Entity Coverage

导出覆盖 `crosswalk`、`junction`、`lane`、`stop_sign`、`signal`、`yield`、`overlap`、`clear_area`、`speed_bump`、`road`、`parking_space`、`pnc_junction`、`rsu`、`ad_area`、`barrier_gate`。其它 raw map 字段保留在导入底稿浅拷贝中。

## Lane Fidelity

`entityToRawLane()` 保留中心线、左右边界曲线、boundary type、长度、限速、拓扑 id、左右邻、反向邻、self reverse、junction id、overlap ids，以及 lane/road samples。enum 通过反查表转回 proto number。

## Overlap Fidelity

导出前 overlap 全量重算。id 使用 `overlap_<sortedParticipants...>`。lane overlap 写出 `start_s/end_s/is_merge/region_overlap_id`；`lane × crosswalk` 可生成 `region_overlap` polygon。用户 override 可 pin `isMerge` 和 `regionOverlaps`。
