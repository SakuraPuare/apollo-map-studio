---
title: Store / Map
description: src/store/mapStore.ts — entities Map + zundo undo + cascade delete + topology + overlap reconcile
---

# Store / Map

`src/store/mapStore.ts` 是 Apollo Map Studio 的地图实体状态层。它把
Apollo HD-map 的 18 种实体类型与编辑器内部的 6 种基础绘制图形统一收口
到单一的 `Map<id, MapEntity>`，并把 zundo 撤销、级联引用清理、lane
拓扑重算、overlap reconcile 全部串在同一个 immer producer 里，形成
**一次 mutation = 一个 zundo 事务**的闭环。

## 模块边界

| Store            | 范围                                                  | 是否进 zundo                        |
| ---------------- | ----------------------------------------------------- | ----------------------------------- |
| `mapStore`       | 实体表 (Map<id, MapEntity>)                           | 是（`partialize: { entities }`）    |
| `apolloMapStore` | `rawMap` / `header` / `bounds` / `info` / `lastError` | 否（导入上下文，与编辑历史解耦）    |
| `uiStore`        | grid / snap / cursor / layerStates / currentZoom      | 否（UX 偏好）                       |
| `settingsStore`  | historyLimit / mapZoom / laneHalfWidth                | 否（用户偏好持久化到 localStorage） |

## 类型签名

```ts
import { create } from 'zustand';
import type { MapEntity } from '@/types/entities';
import type { ParentTarget, ReparentResult } from '@/lib/entityOps';

interface MapState {
  entities: Map<string, MapEntity>;
}

interface MapActions {
  addEntity(entity: MapEntity): void;
  updateEntity(id: string, entity: MapEntity): void;
  removeEntity(id: string): void;
  reparentEntity(childId: string, target: ParentTarget): ReparentResult;
  batchImport(entities: MapEntity[]): void;
  replaceImportedEntities(entities: MapEntity[]): void;
  replaceImportedEntityMap(entities: Map<string, MapEntity>): void;
  recomputeOverlapsAsync(): Promise<{
    pairsTested: number;
    pairsMatched: number;
    overlapsCreated: number;
    overlapsRemoved: number;
    durationMs: number;
  } | null>;
}

type MapStore = MapState & MapActions;

export const useMapStore: import('zustand').UseBoundStore<MapStore> & {
  temporal: ReturnType<typeof import('zundo').temporal>;
};
```

> Source: `src/store/mapStore.ts:29-264`

## Actions

### `addEntity(entity: MapEntity): void`

把一个新实体写入 `entities` 并触发拓扑/overlap 增量 reconcile。

- 通过 `assertEditable('addEntity')` 检查只读授权状态；不通过则静默 return；
- 当 `entity.entityType` 是 `lane` 或 `junction` 时，触发
  `reconcileLaneTopologyIncremental`，把派生的 `pred / succ / junctionId`
  写回 dirty lane；
- 调用 `applyOverlapPatch(state, dirty)` 走 incremental overlap reconcile：
  - dirty 集 = 新实体 id ∪ topology 改写过的所有实体 id；
  - reconcile patch（changes + removedOverlapIds）原地写入 immer draft，
    与 topology 共享同一个 zundo 事务。

```ts
useMapStore.getState().addEntity({
  id: 'lane_42',
  entityType: 'lane',
  centralCurve: {
    segments: [
      /* ... */
    ],
  },
  // ...
});
```

### `updateEntity(id: string, entity: MapEntity): void`

**幂等替换**：如果当前 `entities` 中没有 `id`，直接 return（不会变成
addEntity）。和 addEntity 共享同一套增量 reconcile 路径，但传入
`previousEntities = Map([[id, previous]])` 让 lane topology incremental
能拿到旧几何，正确剔除已经不再相邻的 lane。

```ts
const lane = useMapStore.getState().entities.get('lane_42');
if (lane) {
  useMapStore.getState().updateEntity(lane.id, {
    ...lane,
    type: 'CITY_DRIVING',
  });
}
```

### `removeEntity(id: string): void`

执行三步级联清理：

1. **空间邻居预收集**：在删除前用 `getSharedSpatialIndex().queryBBox()`
   抓出所有与 removed 实体共享 bbox 的 lane（即使他们没有显式持有
   `overlapId`）。这一步必须在 delete 之前做 —— delete 之后
   `bboxForEntity` 拿不到 removed 的几何。
2. **`cascadeDeleteRefsFull`**：把所有引用 removed id 的字段（lane.junctionId、
   road.section.laneIds、pncJunction.passages.\*Ids、overlap.objects 等）
   从其他实体里剥掉；如果 OverlapEntity 剥到只剩 < 2 参与者就整个删除（cascadeRemoved）。
3. **lane topology incremental + overlap reconcile**：dirty 集包括
   cleanups 的全部 id 加上空间邻居 lane id，让 reconcile 能正确
   重算被删除实体波及的 overlap 对子。

```ts
useMapStore.getState().removeEntity('junction_3');
```

### `reparentEntity(childId, target): ReparentResult`

通过 `entityOps.reparent` 让 lane / road / rsu 改换 parent
（junction / road / roadSection / 无 parent）。返回值包含 `changes`
（受影响实体的最终态）和可选的 `rejected`（人类可读的拒绝原因，
例如 target 类型不匹配）。

```ts
const result = useMapStore.getState().reparentEntity('lane_42', {
  kind: 'junction',
  id: 'junction_3',
});
if (result.rejected) {
  toast.error(result.rejected);
}
```

### `batchImport(entities: MapEntity[]): void`

**导入路径专用**：一次性写入所有实体 → 一次 `reconcileLaneTopology`
（full 模式）→ 一次 `reconcileOverlaps({ mode: 'full' })`，全部收口到
单个 zundo 事务。5 万实体规模下同步 reconcile 大约 450ms，acceptable
for import path；超大图建议 caller 走 `recomputeOverlapsAsync` 异步通道。

不做 `assertEditable` 检查 —— 导入是替换式操作，不属于"编辑"。

### `replaceImportedEntities(entities: MapEntity[]): void`

将一组实体替换当前 entities 表，并清空 zundo 历史。导入后必须用这条
路径而不是逐个 addEntity，否则会爆 zundo 历史栈。
内部调用 `replaceImportedEntityMap`。

### `replaceImportedEntityMap(entities: Map<string, MapEntity>): void`

底层接口：直接传入预构造的 Map<id, entity>，避免 caller 多一次 `Array.from + new Map`。
执行流程：

```ts
const temporal = useMapStore.temporal.getState();
temporal.pause();
try {
  set({ entities });
  temporal.clear();
} finally {
  temporal.resume();
}
resetSharedSpatialIndex();
```

### `recomputeOverlapsAsync(): Promise<stats | null>`

把 full overlap reconcile 派发到 `OverlapWorkerBridge`，主线程不被
阻塞。worker 持有 entities snapshot，完成后主线程一次性 apply。

返回值字段（来自 `ReconcilePatch.stats`）：

| 字段              | 类型     | 描述                                |
| ----------------- | -------- | ----------------------------------- |
| `pairsTested`     | `number` | 进入相交检测的 lane × neighbor 对数 |
| `pairsMatched`    | `number` | 实际产生 OverlapEntity 的对数       |
| `overlapsCreated` | `number` | diffWithExisting 阶段新增的 overlap |
| `overlapsRemoved` | `number` | diffWithExisting 阶段删除的 overlap |
| `durationMs`      | `number` | reconcile 主流程耗时（不含 IPC）    |

返回 `null` 表示 entities 为空，不发起 worker 调用。

### Temporal API（zundo）

```ts
useMapStore.temporal.getState().undo();
useMapStore.temporal.getState().redo();
useMapStore.temporal.getState().clear();
useMapStore.temporal.getState().pastStates;
useMapStore.temporal.getState().futureStates;
```

UI 入口务必走 `useActionDispatcher` 的 `undo/redo` —— dispatcher 会先
向 FSM 发 `CANCEL`，避免半途中绘点状态与 entities 回滚后失配（R1 闭环）。

## 关键不变量

1. **dirty 闭包**：addEntity/updateEntity/removeEntity 的 dirty 集必须
   涵盖几何变化的所有实体 id。少一个就会让 spatialIndex.syncDirty 漏
   刷新某个节点 → 下一次 reconcile 走旧 bbox 命中错误邻居。
2. **bbox 签名**：`SpatialIndex.bboxSig` 是几何变更的签名源。lane.junctionId
   这类非几何字段变更不会触发 R-tree mutation —— immer freeze 切换 ref
   时 bbox 不变 → 跳过 re-insert。
3. **assertEditable**：除 `batchImport` 外，所有 mutator 都先过授权检查。

## 测试入口

`src/store/__tests__/mapStore.test.ts` 覆盖 R1 undo cancel、incremental
reconcile drift、cascadeDeleteRefs corner case 等。
