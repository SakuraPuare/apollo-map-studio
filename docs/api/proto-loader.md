# proto / loader

`src/io/proto/loader.ts` 用 `protobufjs` 加载 Apollo HD Map schema。

```ts
export function loadApolloProtoRoot(): Promise<protobuf.Root>;
export async function getMapType(): Promise<protobuf.Type>;
```

## loadApolloProtoRoot

加载器使用：

```ts
import.meta.glob('/src/proto/**/*.proto', {
  query: '?raw',
  import: 'default',
  eager: true,
});
```

所有 proto 在 Vite 构建和 Vitest 中都作为 raw text 可用，不依赖运行时网络或文件读取。首次加载后的 Promise 缓存在模块变量 `cached` 中。

Apollo import 类似：

```proto
import "map_msgs/map_lane.proto";
```

protobufjs 默认会相对当前文件目录解析，可能得到 `map_msgs/map_msgs/map_lane.proto`。当前实现覆盖：

```ts
root.resolvePath = (_origin, target) => target;
```

把 target 视为 `src/proto` 根目录路径，再通过 `/src/proto/${filename}` 从 glob 表取文本。

`root.fetch` 的 callback 故意用 `Promise.resolve().then(...)` 延后触发，避免 protobufjs 在 import tree 尚未遍历完成时提前 `resolveAll()`。

## getMapType

```ts
const root = await loadApolloProtoRoot();
return root.lookupType('apollo.hdmap.Map');
```

bin/text codec 和投影 adapter 都通过它获取顶层 Map schema。当前源码没有 lookup `apollo.routing.Graph` 的路径。

## Boundaries

- 加载入口固定为 `map_msgs/map.proto`。
- `keepCase: true` 保留 proto 字段名，如 `central_curve`、`stop_sign`。
- bundle 缺文件时报 `Proto file not found in bundle: ...`。
