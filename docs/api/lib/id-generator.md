---
title: idGenerator — 实体 ID 自增工厂
description: 与 Apollo 官方样例对齐的实体 ID 前缀注册表 + 自增计数器；显式拒绝派生实体类型。
---

# `idGenerator` — 实体 ID 自增工厂

> 源码：`src/lib/idGenerator.ts` · 95 行

## 用途

每个 Apollo 实体需要一个稳定的字符串 id。Apollo 官方样例数据（`borregas_ave/base_map.bin`）的实测命名约定：

```
lane_N        / road_N       / signal_N    / stopsign_N      （小写 + 下划线）
J_N           / CW_N         / RSU_N                         （缩写）
overlap_<participantA>_<participantB>                        （语义 id）
```

`idGenerator` 把"前缀注册表 + 找最大已用编号 + 加 1"的逻辑封装成两个公开函数：`nextEntityId` / `nextSubId`，并 **显式拒绝** 派生实体类型（overlap / region），以防 nextEntityId 路径凭空造一个 `overlap_42` 而被 reconcile 误删。

## 前缀注册表

| entityType     | 前缀           |
| -------------- | -------------- |
| `lane`         | `lane`         |
| `junction`     | `J`            |
| `pncJunction`  | `PNCJ`         |
| `parkingSpace` | `parkingspace` |
| `crosswalk`    | `CW`           |
| `signal`       | `signal`       |
| `stopSign`     | `stopsign`     |
| `speedBump`    | `speedbump`    |
| `yieldSign`    | `yieldsign`    |
| `clearArea`    | `cleararea`    |
| `barrierGate`  | `barriergate`  |
| `area`         | `area`         |
| `road`         | `road`         |
| `rsu`          | `RSU`          |
| `polyline`     | `polyline`     |
| `catmullRom`   | `catmullrom`   |
| `bezier`       | `bezier`       |
| `arc`          | `arc`          |
| `rect`         | `rect`         |
| `polygon`      | `polygon`      |

## 公共 API

| 符号             | 类型  | 签名                                 | 摘要                                                  |
| ---------------- | ----- | ------------------------------------ | ----------------------------------------------------- |
| `entityIdPrefix` | fn    | `(entityType: string) => string`     | 查前缀；派生类型 throw                                |
| `nextEntityId`   | fn    | `(entityType, entities?) => string`  | 自增 id；带 entities 走"扫最大值+1"，不带走全局计数器 |
| `nextSubId`      | fn    | `(prefix, existingIds) => string`    | 给 RoadSection / Passage 等子结构用                   |
| `SUB_PREFIX`     | const | `{ section, passage, passageGroup }` | 子结构前缀常量                                        |

派生类型 set（不进 prefix 表）：

```ts
const DERIVED_ENTITY_TYPES = new Set(['overlap', 'region']);
```

## 详细条目

### `entityIdPrefix(entityType): string`

```ts
export function entityIdPrefix(entityType: string): string {
  if (DERIVED_ENTITY_TYPES.has(entityType)) {
    throw new Error(
      `[idGenerator] '${entityType}' is a derived entity type — id must come from ` +
        `core/elements/overlap/{overlapId,regionId}, not nextEntityId/entityIdPrefix.`,
    );
  }
  return ENTITY_PREFIX[entityType] ?? entityType.charAt(0).toUpperCase() + entityType.slice(1);
}
```

行为：

- `overlap` / `region` → throw（错误显式提示用对应的 `overlapId` / `regionId`）
- 命中 ENTITY_PREFIX → 返回前缀
- 未命中 → 大写首字母兜底（实验性新 entityType 不会爆）

### `nextEntityId(entityType, entities?): string`

```ts
export function nextEntityId(
  entityType: string,
  entities?: ReadonlyMap<string, MapEntity>,
): string {
  const prefix = entityIdPrefix(entityType);
  if (entities) {
    const ids: string[] = [];
    for (const e of entities.values()) {
      if (e.entityType === entityType) ids.push(e.id);
    }
    return `${prefix}_${maxNumberWithPrefix(prefix, ids) + 1}`;
  }
  fallbackCounter[prefix] = (fallbackCounter[prefix] ?? 0) + 1;
  return `${prefix}_${fallbackCounter[prefix]}`;
}
```

两条路径：

1. **带 entities** —— 扫描现有实体取该类型的最大 numeric suffix，加 1。这是 store 写入路径首选——保证不与导入的 id 冲突。
2. **不带 entities** —— 走模块级 `fallbackCounter`，单调递增。仅用于测试 / 不需要去重的场景。

### `nextSubId(prefix, existingIds): string`

```ts
export function nextSubId(prefix: string, existingIds: Iterable<string>): string {
  return `${prefix}_${maxNumberWithPrefix(prefix, existingIds) + 1}`;
}
```

给 RoadSection（`section_3`）、Passage（`passage_2`）、PassageGroup（`passagegroup_1`）等 _实体内部_ 的子结构用。`prefix` 通常来自 `SUB_PREFIX` 常量。

```ts
const sectionId = nextSubId(
  SUB_PREFIX.section,
  road.sections.map((s) => s.id),
);
```

### `maxNumberWithPrefix(prefix, ids)` —— 内部

```ts
function maxNumberWithPrefix(prefix: string, ids: Iterable<string>): number {
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const m = re.exec(id);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}
```

正则 `^prefix_(\d+)$`——严格匹配，跳过 `lane_foo` / `lane_3a`。失败 → 0，下次自增到 1。

## 内部状态

```ts
const fallbackCounter: Record<string, number> = {};
```

模块级别。**不持久化**——重启清零，但只有不传 entities 的 path 会用到，写库前都会重新走 `nextEntityId(entityType, allEntities)`，所以重启后的 id 一致性由 store 保证。

## 设计要点

### Overlap / Region 的拒绝

`overlap` / `region` 在 Apollo HD Map 里有语义 id（`overlap_<A>_<B>`），由参与者派生。如果通过 `nextEntityId` 给它造一个 `overlap_42`，会与 `core/elements/overlap/overlapId` 的派生路径产生命名空间冲突——后续的 reconcile 把这个手动创建的实体当作"过时的派生"删掉。throw 是显式失败比静默 bug 强。

### 大小写不一致

注册表里既有 `lane`（小写）又有 `J`（大写）—— **完全是 Apollo 样例数据的实测**。Apollo 自己的命名不一致（参考 `borregas_ave`），保持兼容比强行统一更安全（Apollo 工具链可能依赖这些前缀）。

## 副作用

- `fallbackCounter` 是模块级 state（隐式副作用）
- 不读 store / 不写 store / 不打 console

## 测试覆盖

`src/lib/__tests__/idGenerator.test.ts`：

- 每种 entityType 的前缀正确
- `nextEntityId` 在 entities 含 `lane_5, lane_3` 时返回 `lane_6`
- 派生类型 throw
- `nextSubId` 在 RoadSection 数组上正确工作

## 调用方

- `src/store/mapStore.ts` — `addEntity` 时如果 entity 没有 id 则 `nextEntityId(entityType, currentMap)`
- `src/lib/entityOps/edit.ts` — `createEntity` 内部
- `src/components/menu/EditMenu.tsx` — 复制粘贴时给新实体生成 id
- `src/io/mapIO.ts` — 导入时不调用（用 proto 自带 id），但导出时用 `entityIdPrefix` 验证

## 源码索引

| 行    | 内容                   |
| ----- | ---------------------- |
| 19–40 | `ENTITY_PREFIX`        |
| 42–43 | `DERIVED_ENTITY_TYPES` |
| 45–49 | `SUB_PREFIX`           |
| 51–59 | `entityIdPrefix`       |
| 61–72 | `maxNumberWithPrefix`  |
| 74    | `fallbackCounter`      |
| 76–90 | `nextEntityId`         |
| 92–94 | `nextSubId`            |

## 与导入路径的协作

导入 Apollo 地图时实体 id 来自原始 proto，**不**走 `nextEntityId`。这意味着：

- 导入 `lane_5, lane_3, lane_8` 后，下次 `nextEntityId('lane', entities)` 返回 `lane_9`
- 导入 `lane_foo`（不符合 prefix\_数字 模式）→ 会被 `maxNumberWithPrefix` 跳过，下次自增不冲突
- 导入空地图后 `nextEntityId('lane', entities)` 返回 `lane_1`

## 与 cascadeDeleteRefs 的协作

删 entity 后该 id 被 _释放_——下次自增可能再次使用同一个 id。这通常是想要的：

```ts
// 删除 lane_3，剩下 lane_1、lane_2、lane_4
// 下次创建：max=4 + 1 = lane_5（不会重用 lane_3）
```

`maxNumberWithPrefix` 永远基于"当前还存在的最大值 + 1"，避免与已删除的 id 重复。

## fallbackCounter 失败模式

```ts
nextEntityId('lane'); // 不传 entities → 走 fallbackCounter
nextEntityId('lane', entities); // 传 entities → 走扫描
```

如果同一进程内交替使用两种调用，可能产生重复 id：

- 步骤 1：`nextEntityId('lane', { lane_1 })` → `lane_2`，但 fallbackCounter 不更新
- 步骤 2：`nextEntityId('lane')` → `lane_1`（fallbackCounter 从 0 起）

**结论**：生产代码总是传 `entities`；只有测试或 scratch 代码用无参形式。

## 实体类型 vs Apollo 实体类型

注册表覆盖 21 个 entityType，但 Apollo proto 只有 17 个 entityType。差额是 6 个绘图原语（polyline / catmullRom / bezier / arc / rect / polygon）—— 它们走 `idGenerator` 但不参与 Apollo round-trip。

## 设计取舍：为什么不用 UUID

UUID 显然不会冲突，但：

- 不可读（`f47ac10b-58cc-...` vs `lane_3`）
- 与 Apollo 官方样例命名惯例不一致（破坏 round-trip 兼容）
- 无法用于"语义 id"如 `overlap_lane_3_signal_5`

代价：进程内 `fallbackCounter` 不持久化（重启清零），但只要总是传 `entities`，扫描方法保证唯一。

## 边界 case：极大数

`maxNumberWithPrefix` 用 `Number(m[1])`——理论上 JS Number 可表示 ~2^53 的整数（quadrillion 量级）。Apollo HD Map 实际 lane 数 < 100k，远不到。

## 参见

- `core/elements/overlap/overlapId` —— overlap 的语义 id 派生
- [`entityOps`](./entity-ops.md) —— `createEntity` 内部使用
- `src/types/apollo.ts` —— 各 entityType 的字段定义
- `src/lib/__tests__/idGenerator.test.ts` —— 单测
