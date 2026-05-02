# Store / Map API

`src/store/mapStore.ts` 是 Apollo Map Studio 的地图实体状态层。当前实现不是旧版 `lanes / junctions / roads` 多分片模型，而是单一实体表：

```ts
interface MapState {
  entities: Map<string, MapEntity>;
}
```

所有 Apollo 对象和绘制对象都按 `id` 存入 `entities`。`mapStore` 同时负责实体写入、级联引用清理、lane 拓扑重算、overlap reconcile、undo/redo 历史和授权只读保护。

## Store 边界

- `mapStore` 保存可编辑实体图：`road`、`junction`、`lane`、`signal`、`crosswalk`、`stopSign`、`yieldSign`、`speedBump`、`clearArea`、`parkingSpace`、`pncJunction`、`rsu`、`area`、`barrierGate`、`overlap` 以及 `polyline`、`bezier`、`arc`、`rect`、`polygon` 等绘制对象。
- `apolloMapStore` 保存导入文件上下文：`rawMap`、`header`、`bounds`、`info`、`lastError`。它用于 Apollo proto round-trip 和导入/导出状态，不参与 zundo。
- `settingsStore` 保存 history limit、默认视口、lane 默认半宽和箭头间距等 localStorage 设置。
- `licenseStore` 不保存地图，但 `mapStore` 的主要写操作会通过 `assertEditable()` 被授权状态约束。

## 基本用法

React 组件优先用 selector：

```ts
const entities = useMapStore((s) => s.entities);
const updateEntity = useMapStore((s) => s.updateEntity);
```

事件处理器或非 React 代码可读当前快照：

```ts
useMapStore.getState().addEntity(entity);
```

历史操作由 zundo temporal store 暴露：

```ts
useMapStore.temporal.getState().undo();
useMapStore.temporal.getState().redo();
useMapStore.temporal.getState().clear();
```

UI 入口应通过 `useActionDispatcher` 调 undo/redo，因为 dispatcher 会先取消 FSM 临时编辑状态。

## Actions

### addEntity

```ts
addEntity(entity: MapEntity): void
```

行为：

1. 调用 `assertEditable('addEntity')`，只读状态直接返回。
2. `state.entities.set(entity.id, entity)`，同 ID 会覆盖。
3. 如果实体类型是 `lane` 或 `junction`，调用 `reconcileLaneTopologyIncremental()`。
4. 把拓扑重算产生的其它实体变更写回同一个 immer draft。
5. 对 dirty 实体集执行增量 `reconcileOverlaps()`，删除无效 overlap、写入新 overlap。

dirty 集必须包含拓扑重算影响到的其它 lane，否则空间索引和 overlap 会短暂落后。

### updateEntity

```ts
updateEntity(id: string, entity: MapEntity): void
```

行为：

1. 调用 `assertEditable('updateEntity')`。
2. 如果 `id` 不存在，no-op。
3. 保存 previous entity，用于增量拓扑重算。
4. 写入完整新实体。该方法不做 patch merge。
5. `lane` / `junction` 更新会传入 `previousEntities` 运行增量拓扑。
6. 对 dirty 集运行增量 overlap reconcile。

风险点：调用方必须保证 `id` 和 `entity.id` 一致，并传入完整实体。Inspector 表单依赖去重逻辑避免 store -> form -> store 循环。

### removeEntity

```ts
removeEntity(id: string): void
```

行为：

1. 调用 `assertEditable('removeEntity')`。
2. 不存在则 no-op。
3. 删除前用 `bboxForEntity()` 和共享空间索引收集空间邻居 lane，覆盖删除非 lane 几何对象时的 overlap 修正。
4. 调用 `cascadeDeleteRefsFull(new Set([id]), all)`，清理全图外键和引用。
5. 在一个事务内写回 cleanups、删除级联实体、删除目标实体。
6. 如果删除的是 `lane` 或 `junction`，运行增量 lane topology。
7. 对 dirty 集运行增量 overlap reconcile。
8. 删除 lane 后调用 `invalidateLaneCaches([id])`。

测试覆盖的级联行为包括：删除 junction 清空 lane/road/rsu 的 `junctionId`，删除 lane 从 `Road.sections[].laneIds` 移除并清理 pred/succ，删除 overlap 时移除其它实体的 `overlapIds`。

### reparentEntity

```ts
reparentEntity(childId: string, target: ParentTarget): ReparentResult;
```

`reparentEntity` 通过 `src/lib/entityOps` 修改 Apollo 外键或集合字段，不是通用树节点移动。

常见 target：

```ts
{ kind: 'junction', id: 'j1' }
{ kind: 'road', id: 'road1' }
{ kind: 'none' }
```

当前测试固定的语义：

- Lane -> Junction：设置 `lane.junctionId`。
- Lane -> Road：插入 Road 第一个 section，并清空 `lane.junctionId`。
- Lane -> none：清空 `lane.junctionId`。
- Road -> Junction / none：设置或清空 `road.junctionId`。
- RSU -> Junction / none：设置或清空 `rsu.junctionId`。
- 不支持组合返回 `rejected`，不修改 store。

返回值：

```ts
interface ReparentResult {
  changes: Map<string, MapEntity>;
  rejected?: string;
}
```

`changes.size === 0` 且没有 `rejected` 表示操作合法但无实际变化。

### batchImport

```ts
batchImport(entities: MapEntity[]): void;
```

导入专用批量写入路径：

1. 空数组直接返回。
2. 一次性写入所有实体。
3. 调用全量 `reconcileLaneTopology()`。
4. 调用 full `reconcileOverlaps()`。
5. 在单个 zundo 事务内应用所有 patch。

它避免逐个 `addEntity` 造成大量历史快照和多次增量 reconcile。源码注释说明 5 万量级 full overlap 约 450ms；超大图应考虑 worker 路径。

### replaceImportedEntities / replaceImportedEntityMap

```ts
replaceImportedEntities(entities: MapEntity[]): void;
replaceImportedEntityMap(entities: Map<string, MapEntity>): void;
```

导入替换路径把当前文档视为新快照：

1. `temporal.pause()`。
2. `set({ entities })`。
3. `temporal.clear()`。
4. `temporal.resume()`。
5. `resetSharedSpatialIndex()`。

因此导入后 undo 栈为空，用户不能 Ctrl+Z 回到导入前文档。

### recomputeOverlapsAsync

```ts
recomputeOverlapsAsync(): Promise<{
  pairsTested: number;
  pairsMatched: number;
  overlapsCreated: number;
  overlapsRemoved: number;
  durationMs: number;
} | null>;
```

通过 `OverlapWorkerBridge` 在 worker 中做 full overlap reconcile。空图返回 `null`。patch 回到主线程后一次性 apply，并重置主线程共享空间索引。

风险点：worker 基于调用时的 `entities` 快照计算。计算期间如果主线程继续编辑，apply 后可能短暂 drift，依赖后续增量编辑和 stale guard 修正。

## Undo / Redo

`mapStore` 使用：

```ts
temporal(immer(...), {
  partialize: (state) => ({ entities: state.entities }),
  limit: readHistoryLimit(),
})
```

关键合同：

- 历史只包含 `{ entities }`。
- UI、settings、license、FSM context 不在历史中。
- 单个 action 内的实体写入、拓扑修正、overlap patch 是一个历史事务。
- `replaceImportedEntityMap` 会暂停并清空历史。
- `limit` 初始化时读取 localStorage；SettingsPanel 修改后通常需要 reload 才完整生效。

`useActionDispatcher` 的 undo/redo 会先：

```ts
actorRef.send({ type: 'CANCEL' });
```

再调用 temporal undo/redo。原因是 zundo 只回滚 entities，而 FSM 可能还握有 `drawPoints`、`dragPointIndex` 或选中上下文。`src/hooks/__tests__/undoCancel.test.ts` 固化了 CANCEL 必须先于 time travel 的顺序。

## 选择与编辑链路

选择状态在编辑 FSM，不在 `mapStore` 或 `uiStore`。

典型链路：

1. LayerTree、SearchPanel 或地图命中后发送 `SELECT_ENTITY`。
2. Inspector 用 `selectedEntityId` 到 `entities.get(id)` 取实体。
3. `EntityForm` 按 `entityType` 分发具体表单。
4. 表单构造完整实体并调用 `updateEntity()`。
5. `mapStore` 同步拓扑和 overlap。
6. 渲染层、outline、search、inspector 通过 selector 收到新快照。

Inspector 分两类：

- `SchemaForm`：当前 LaneForm 使用。负责 default values、同 ID drift 同步、`watch()` 自动保存、zod 校验和去重。
- 手写表单：Junction、ParkingSpace、Signal、StopSign、Road、Area、BarrierGate、PNCJunction、Overlap 等。

表单风险点：

- `SignalForm` 改 type 会 `regenerateSignalGeometry()`。
- `PNCJunctionForm` 维护 passage group 和 lane/signal/stop/yield 引用。
- `OverlapForm` 会写 `_userOverrides`，冻结 lane `isMerge` 或 `regionOverlaps`，后续 reconcile 会尊重这些覆盖。
- 只读授权状态下，输入控件可能仍显示，但 `assertEditable()` 会挡住写入。

## 拓扑与 Overlap

`topologyAffectingType()` 只把 `lane` 和 `junction` 视为拓扑相关。增量路径使用 `reconcileLaneTopologyIncremental()`，导入路径使用全量 `reconcileLaneTopology()`。

Overlap 增量 patch 通过：

```ts
reconcileOverlaps(draft.entities, { mode: 'incremental', dirtyIds });
```

导入和手动重算走 full mode。删除实体前额外收集空间邻居 lane，是为了覆盖“被删对象影响 lane corridor overlap，但自身没有被 lane 引用”的场景。

## ApolloMap Store

`src/store/apolloMapStore.ts` 保存导入上下文：

```ts
interface ApolloMapState {
  rawMap: Record<string, unknown> | null;
  header: ApolloMapHeader | null;
  bounds: ApolloMapBounds | null;
  info: ApolloMapImportInfo | null;
  lastError: string | null;
}
```

Actions：

- `setMap(rawMap, info)`：legacy in-process 路径，抽取 header。
- `setImported(info, bounds, header?)`：新导入路径只保存轻量信息，完整 proto 树留在 IO worker，避免 React state 克隆大文件。
- `clear()`：清空导入上下文。
- `setError(message)`：记录导入/导出错误。

不要把 `mapStore.entities` 当作完整 Apollo proto；round-trip 依赖 IO 层保留的原始字段树和导入时 PROJ 字符串。

## 测试参考

相关测试：

- `src/store/__tests__/mapStore.test.ts`
- `src/hooks/__tests__/undoCancel.test.ts`
- `src/hooks/__tests__/useActionDispatcher.test.ts`
- `src/components/layout/panels/__tests__/InspectorForms.test.ts`
- `src/components/layout/panels/__tests__/overlapInspector.test.ts`

测试 reset 通常使用：

```ts
useMapStore.setState({ entities: new Map() });
useMapStore.temporal.getState().clear();
```
