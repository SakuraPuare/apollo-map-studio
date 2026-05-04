---
title: apolloMapStore — Apollo 导入元数据缓存
description: 保存 IO 导入元数据、header 副本与 bounds，供状态栏、元数据面板和 round-trip 导出复用。
---

# `apolloMapStore` — Apollo 导入元数据缓存

> 源码：`src/store/apolloMapStore.ts` · 无撤销

## 用途

`apolloMapStore` 是一个 **不参与撤销** 的 Zustand 单例，专职两件事：

1. 保存最近一次导入的 Apollo HD Map 元数据（`filename`、`projString`、各类型实体计数等），供状态栏、状态提示、再次导出时预填名称使用。
2. 暂存导入时的 WGS84 边界与 `header` 副本，方便 `WorkspaceLayout` 在新地图加载完成后调用 `map.fitBounds`。

它故意 **不存储 React state 中的 `entities` 或原始 proto 树**——entities 由 `mapStore` 持有，并由 zundo 中间件做 `partialize` 撤销追踪；完整 proto 树留在 IO worker 内，避免主线程结构化克隆 50–200MB 的对象。

## 公共 API

| 符号                  | 类型      | 签名                                      | 摘要                                         |
| --------------------- | --------- | ----------------------------------------- | -------------------------------------------- |
| `useApolloMapStore`   | hook      | `() => ApolloMapState & ApolloMapActions` | Zustand store，组件订阅入口                  |
| `ApolloMapImportInfo` | interface | 见下                                      | 导入诊断元数据；填充状态栏 / 提示            |
| `ApolloMapBounds`     | type      | `[[number, number], [number, number]]`    | WGS84 `[[minLng, minLat], [maxLng, maxLat]]` |
| `ApolloMapHeader`     | type      | `Record<string, unknown>`                 | `Map.header` 的浅拷贝                        |
| `setImported`         | action    | `(info, bounds, header?) => void`         | 写入导入元数据、bounds 与 header 副本        |
| `clear`               | action    | `() => void`                              | 重置所有字段为初始值                         |
| `setError`            | action    | `(message: string \| null) => void`       | 把最近一次 IO 错误暴露给状态栏               |

## 详细条目

### `interface ApolloMapImportInfo`

```ts
export interface ApolloMapImportInfo {
  /** Source filename, used as the suggested name for re-export. */
  filename: string;
  /** Per-entity counts surfaced for the status bar / toast. */
  counts: Record<string, number>;
  /** PROJ.4 string actually used to project ENU → lon/lat. */
  projString: string;
  /** Imported-at timestamp (ms epoch). */
  importedAt: number;
}
```

由 `mapIO.importBaseMap` 在解码完成后构造。`projString` 在 round-trip 导出时被重新喂给 `mapIO.exportBaseMap`，确保坐标回到原始 UTM 值。

文件位置：`apolloMapStore.ts:14`。

### `type ApolloMapBounds`

```ts
export type ApolloMapBounds = [[number, number], [number, number]];
```

形态：`[[minLng, minLat], [maxLng, maxLat]]`。供 `maplibre-gl` 的 `LngLatBoundsLike` 直接消费。

### `type ApolloMapHeader`

```ts
export type ApolloMapHeader = Record<string, unknown>;
```

不绑定具体字段，故意保持开放——proto 升级新增字段时不需要修改本 store；Header 面板基于 zod schema 在渲染层做白名单校验。

### `interface ApolloMapState`

State 字段一览：

| 字段        | 类型                          | 用途                                      |
| ----------- | ----------------------------- | ----------------------------------------- |
| `header`    | `ApolloMapHeader \| null`     | `Map.header` 的浅副本，供 Header 面板展示 |
| `bounds`    | `ApolloMapBounds \| null`     | 导入期间预计算的 WGS84 包围盒             |
| `info`      | `ApolloMapImportInfo \| null` | 最近一次导入的元数据                      |
| `lastError` | `string \| null`              | 最近一次 IO 失败的人类可读信息            |

文件位置：`apolloMapStore.ts`。

### `setImported(info, bounds, header?)`

导入路径专用。`mapIO` 在 worker 中完成解码 → 把每个实体逐一推到 `mapStore`，仅把元数据 + 包围盒 + header 副本回传到主线程。

签名：`(info: ApolloMapImportInfo, bounds: ApolloMapBounds | null, header?: ApolloMapHeader | null) => void`

副作用：清除 `lastError`。

```ts
useApolloMapStore.getState().setImported(
  { filename, counts, projString, importedAt: Date.now() },
  [
    [bbox.minLng, bbox.minLat],
    [bbox.maxLng, bbox.maxLat],
  ],
  header,
);
```

文件位置：`apolloMapStore.ts:74-76`。

### `clear()`

`File → New Map` / 切换文件时调用，清空所有字段。**不**触发 `mapStore.clear`——后者由调用方自行编排。

文件位置：`apolloMapStore.ts:78-80`。

### `setError(message)`

把 IO 失败摘要写到 `lastError`。状态栏会在下次重新导入或调用 `clear` 之前持续展示。

```ts
useApolloMapStore.getState().setError('Failed to decode header: invalid varint at offset 17');
```

文件位置：`apolloMapStore.ts:82-84`。

## 内部实现

- 没有 `subscribe` / `selector` 优化——store 的写入频率低（每次只在 import/export 边界触发），无需 `useShallow`。
- 由于不参与 zundo，导入上下文不会进入撤销栈；完整 proto 树留在 worker 内。
- 类型守卫 `header && typeof header === 'object'` 防御 proto 解码失败时拿到 `undefined`。
- 初始 state 全部为 `null`，组件需要 narrow 检查后再读字段。

## 副作用

- 没有 IPC、没有 localStorage、没有 timer——纯内存。
- 不写 `console`；错误经由 `setError` 显式上抛。
- 重启即清空，符合"导入态不持久化"的产品决定。

## 测试覆盖

无独立测试文件——本 store 的契约在 `src/io/__tests__/mapIO.test.ts` 等 IO 端到端测试中被间接覆盖（验证 `info.counts` / `bounds` 在导入后就位）。

## 调用方

- `src/io/mapIO.ts` — 唯一写入方（`setImported` / `setError`）
- `src/components/layout/StatusBar.tsx` — 读取 `info.filename`、`lastError`、`info.counts`
- `src/components/layout/WorkspaceLayout.tsx` — 读取 `bounds` 触发 `map.fitBounds`
- `src/components/menu/FileMenu.tsx` — 读取 `info.filename`/`projString` 复用为导出参数

## 源码索引

| 行    | 内容                                           |
| ----- | ---------------------------------------------- |
| 13–23 | `ApolloMapImportInfo` 接口                     |
| 25–26 | `ApolloMapBounds` / `ApolloMapHeader` 类型别名 |
| 28–43 | `ApolloMapState` 内部接口                      |
| 45–54 | `ApolloMapActions` 内部接口                    |
| 56–85 | `useApolloMapStore` 工厂                       |

## 与 mapStore 的协作

完整 import 流程：

```ts
// mapIO.ts (简化)
async function importBaseMap(file: File) {
  const apolloStore = useApolloMapStore.getState();
  const mapStore = useMapStore.getState();
  const taskStore = useTaskProgressStore.getState();

  const id = `import:${file.name}`;
  taskStore.beginTask({ id, label: `Importing ${file.name}` });
  try {
    // 1. worker 解码
    const result = await runImportWorker(file, projString);
    // 2. 重置编辑器实体
    mapStore.replaceAll(result.entities);
    // 3. 落地 apollo store 元数据
    apolloStore.setImported(
      { filename: file.name, counts: result.counts, projString, importedAt: Date.now() },
      result.bounds,
      result.header,
    );
  } catch (e) {
    apolloStore.setError(String(e));
    throw e;
  } finally {
    taskStore.endTask(id);
  }
}
```

注意：

- **mapStore 与 apolloMapStore 是两个独立 store**，调用方负责协调
- mapStore 走 zundo，所以 `replaceAll` 进入历史；apolloMapStore 不进
- 失败路径仍要 `endTask`（`finally`）

## 视角恢复策略

`bounds` 字段一旦写入，`WorkspaceLayout` 监听到变化触发 `map.fitBounds`：

```tsx
useEffect(() => {
  const bounds = useApolloMapStore.getState().bounds;
  if (bounds && map) {
    map.fitBounds(bounds, { padding: 60, duration: 800 });
  }
}, [bounds]);
```

视角调整后 `bounds` 不需要清空——后续的 import 会用 `setImported` 覆盖；中间的 zoom/pan 操作走 `settingsStore.setMapCenter`，与本 store 无关。

## 错误展示模型

`lastError` 字段在状态栏显示，遵循"sticky 直到下一次 import"语义：

```tsx
function StatusBarError() {
  const err = useApolloMapStore((s) => s.lastError);
  if (!err) return null;
  return <span className="text-destructive">{err}</span>;
}
```

调用 `setError(null)` 也可清空（极少用）。

## 参见

- `mapStore` — 实体级别的 zundo store
- [`projDialogStore`](./proj-dialog-store.md) — 缺失 PROJ.4 时的弹窗 store
- [`taskProgressStore`](./task-progress-store.md) — 导入进度展示
- `mapIO`（`src/io/mapIO.ts`） — 调用 setImported 的真正作者
- `ARCHITECTURE.md` — 关于 cold/hot layer 与 worker 边界的全局图
