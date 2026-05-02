# export / sim_map

当前源码没有 `buildSimMap()`、downsample pass 或 `sim_map.bin` 导出。旧文档中的 sim map 内容不是现有 API。

## Existing Export

当前只有 base map 导出：

```ts
export async function exportApolloBin(): Promise<void>;
export async function exportApolloText(): Promise<void>;
```

两者都会输出完整 `apollo.hdmap.Map`，不会生成 Dreamview 专用降采样 map。

## Geometry Behavior Today

- 导入 Apollo lane 时，渲染和 overlap 优先使用原始 `leftBoundary` / `rightBoundary` 点列。
- 编辑器新建 lane 没有显式边界时，使用中心线和 sample width 通过 `offsetPolylineDeg()` 生成显示边界。
- spatial worker 只生成 GeoJSON 渲染 feature，不写 sim map。

## Not Implemented

不存在以下 API：

- `buildSimMap`
- `downsampleByAngle`
- `downsampleByDistance`
- `sim_map.bin` 下载入口
