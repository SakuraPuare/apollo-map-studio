# import / Apollo base_map

当前导入入口是 `src/io/mapIO.ts` 的 `pickAndImportApollo()`，不是旧版 `parseBaseMap()`。

```ts
export async function pickAndImportApollo(): Promise<ApolloMapImportInfo | null>;
```

## Main Thread

流程：

1. `pickFile('.bin,.txt,.pb.txt,application/octet-stream,text/plain')`。
2. `readFileAsBytes(file)` 读成 `Uint8Array`。
3. 文件名匹配 `.(pb.txt|txt)` 时走 `apolloIOBridge.importText()`，否则走 `importBin()`。
4. 用 task id `apollo-import` 展示 progress。
5. 成功后：
   - `useApolloMapStore.getState().setImported(result.info, result.bounds, result.header)`
   - `useMapStore.getState().replaceImportedEntities(result.entities)`
6. 失败时写入 `Import failed: ...` 并返回 `null`。

## Worker Protocol

```ts
type ApolloIORequest =
  | { type: 'IMPORT_BIN'; requestId: string; filename: string; bytes: Uint8Array }
  | { type: 'IMPORT_TEXT'; requestId: string; filename: string; bytes: Uint8Array }
  | { type: 'RESOLVE_PROJECTION'; requestId: string; projString: string };
```

导入响应包括：

- `PROGRESS`
- `NEEDS_PROJECTION`
- `IMPORT_ENTITIES_CHUNK`
- `IMPORT_RESULT`
- `ERROR`

实体按 2000 个一块返回。`ApolloIOBridge` 为请求设置 10 分钟超时。

## Worker Pipeline

`runImport()` 的真实步骤：

1. 解码。
   - bin：`decodeMapBin(bytes)`。
   - text：`decodeMapText(TEXT_DECODER.decode(bytes))`。
2. 读取 `header.projection.proj`。
   - `readHeaderProjString()` 支持 string、`Uint8Array`、number array。
   - 缺失时发送 `NEEDS_PROJECTION`，主线程用户取消则 fallback 到 `UTM_PRESETS.beijing`。
3. 投影到 lon/lat。
   - `apolloMapToLonLat(decodedEnu, projString)` 递归转换所有 schema 类型为 `apollo.common.PointENU` 的点。
   - 导入后的编辑器约定：`PointENU.x = longitude`，`PointENU.y = latitude`。
4. 缓存 lon/lat raw map。
   - `cachedRawLonLatMap = lonLatMap`。
   - 当前导出依赖这份导入底稿。
5. bridge 到 `MapEntity[]`。
   - `apolloMapToEntities(lonLatMap)`。
6. 计算 bounds。
   - `computeApolloMapBounds(lonLatMap)`。
7. 重算拓扑与 overlap。
   - `reconcileLaneTopology(entityMap)`。
   - `reconcileOverlaps(entityMap, { mode: 'full' }, new SpatialIndex())`。
8. 分块发送实体，再发送 `IMPORT_RESULT`。

## Result

```ts
interface ApolloImportWorkerResult {
  info: ApolloMapImportInfo;
  header: ApolloMapHeader | null;
  bounds: ApolloMapBounds | null;
  entities: MapEntity[];
  stats: ApolloImportStats;
}
```

`info` 包含文件名、顶层数组浅计数、实际使用的清洗后 PROJ 字符串和导入时间。`stats` 包含 `decodeMs`、`projectMs`、`bridgeMs`、`topologyMs`、`overlapMs`、`totalMs`。

## Boundaries

- 文件内容不做魔数检查，后缀只决定 text/bin 解码器。
- text proto 未知字段跳过，已知字段类型错误抛异常。
- raw entity 缺失 id 时对应 bridge 返回 `null` 并跳过。
- `z` 坐标投影时原样保留。
- 导入后 overlap 会被当前几何规则重算，源 overlap id 顺序不作为保真目标。

## Tests

- `src/io/__tests__/endToEnd.test.ts`：fixture 导入、投影、bridge、bin/text 再编码。
- `src/io/proto/__tests__/projection.test.ts`：投影清洗与往返。
- `src/io/proto/__tests__/mapDataPerformance.test.ts`：真实 map_data 性能阶段。
- `curveFidelity`、`subsignalFidelity`、`overlapFidelity`：关键结构保真。
