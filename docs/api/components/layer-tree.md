---
title: LayerTree
description: 基于 react-arborist 的 Apollo 实体层级树——按 Junction / Road / Section / Lane 关系拖放重 parenting，含可见性和锁定切换。
---

# LayerTree

> 源码：
>
> - `src/components/layout/panels/LayerTree.tsx`
> - `src/components/layout/panels/LayerTree/Node.tsx`
> - `src/components/layout/panels/LayerTree/treeBuilder.ts`
> - `src/components/layout/panels/LayerTree/types.ts`
> - `src/components/layout/panels/LayerTree/constants.ts`

## 用途与 UX 角色

`LayerTree` 是 Sidebar 的**结构编辑视图**（`activeTab === 'layers'`）。它使用 [`react-arborist`](https://github.com/brimdata/react-arborist) 渲染所有实体的虚拟化树形结构，并支持：

- **拖放 reparent**：把 lane 拖入 Junction、把 lane 拖入 RoadSection、把 lane 拖回 unparented group。
- **可见性切换**（眼睛图标）：基于 `uiStore.layerStates`，即时控制冷层渲染。
- **锁定切换**（锁图标）：锁定后该层实体不可被画布交互选择。
- **删除**（垃圾桶图标）：直接 `removeEntity(id)`。
- **Detach 解除 parent**（链接图标）：`reparentEntity(id, { kind: 'none' })`。
- **快速建 Road / RSU**：顶部 `+ Road` / `+ RSU` 按钮。

树构建逻辑由 `treeBuilder.ts` 提供，集中处理 lane 双隶属（要么属 Junction，要么属 Road×Section）以及 Apollo 17 类的分组顺序。

## 组件组合树

```mermaid
flowchart TB
  LT[LayerTree]
  LT --> Toolbar[Toolbar: + Road / + RSU]
  LT --> ArboristTree[<Tree> from react-arborist]
  ArboristTree --> Node[Node renderer]
  Node --> Group[Group: Roads / Junctions / Lanes / …]
  Node --> Section[Section: roadId:sectionId]
  Node --> Entity[Entity row \(name, icon, actions\)]
```

## Props 接口

```ts
interface LayerTreeProps {
  onSelect?: (entityId: string | null) => void;
  selectedId?: string | null;
}
```

| Prop         | 类型                                 | 默认值      | 说明                                                                    |
| ------------ | ------------------------------------ | ----------- | ----------------------------------------------------------------------- |
| `onSelect`   | `(entityId: string \| null) => void` | `undefined` | 节点选择变化时回调。group / section 触发 `null`，entity 触发实体 id     |
| `selectedId` | `string \| null`                     | `null`      | 外部当前选中实体 id，用于 react-arborist 的 controlled `selection` prop |

## 内部状态

| 钩子                                 | 用途                                     |
| ------------------------------------ | ---------------------------------------- |
| `useMapStore(s.entities)`            | 订阅整个实体 Map                         |
| `useMapStore(s.reparentEntity)`      | 调用 `reparentEntity(id, target)` 改父级 |
| `useMapStore(s.addEntity)`           | `+ Road` / `+ RSU` 按钮                  |
| `useRef<TreeApi<TreeNode>>`          | `treeRef` — react-arborist 命令式句柄    |
| `useMemo(() => buildTree(entities))` | 把 entities 流式构建成 TreeNode 数组     |

`useCallback` 包装的回调：`createRoad` / `createRSU` / `handleSelect` / `checkDisableDrop` / `handleMove`。

## 副作用

无 `useEffect`——所有动作均通过 react-arborist 的回调触发。

### `handleMove`

接收 `dragNodes`（被拖节点）+ `parentNode`（目标）。流程：

1. 取出被拖 entity id 和目标 `parentTarget`（`{ kind: 'junction' | 'road' | 'roadSection' | 'none', … }`）。
2. 调用 `mapStore.reparentEntity(id, target)`。
3. 该 store 方法委托 `entityOps.reparent` 做合法性验证和 proto 转换（见 [架构](/architecture/) 的 anti-corruption layer 说明）。
4. 若返回 `{ rejected: '...' }`，控制台 warn——例如不能把 road 拖入 lane。

### `checkDisableDrop`

react-arborist 在拖动过程中调用此函数判定能否 drop。逻辑：

- 拖的不是 entity → disable
- 没有目标父节点 → disable
- 目标 `parentTarget` 不存在 → disable
- 否则委托 `entityOps.canReparent(child, target, entities)`

`canReparent` 是抗腐蚀层中的合法性 oracle，集中处理 Apollo proto 关系约束。

## treeBuilder 算法

`buildTree(entities)` 按以下顺序：

1. **预扫描**：分离 roads + junctions，构造 `laneSection` Map（lane id → 所属 RoadSection）。
2. **主扫描**：每个 entity 选一个父桶（lane → junction / section / unparented；road → junction / unparented；rsu → 同 lane；其他 → group）。
3. **顶层 group 排序**：按 `TOP_LEVEL_ORDER` 常量数组（17 类 Apollo 类型 + 6 类绘图原语，详见 `constants.ts:27-51`）。

`TreeNode` 的 `parentTarget` 字段编码"如果 drop 在我这里，调用 `reparentEntity` 应当传什么 target"，是 `entityOps` 与 react-arborist 的接口。

## Node 渲染（`Node.tsx`）

每个节点 39px 行：

```jsx
<div ref={dragHandle} onClick={…} className={…}>
  <Chevron />
  <Icon /> {/* group: FaLayerGroup; section: §; entity: emoji */}
  <span>{name}</span>
  {(group||section) && <span>{children.length}</span>}
  <ActionButtons /> {/* 悬停可见 */}
</div>
```

- **Group 上**：眼睛 / 锁两个按钮，绑定 `useUIStore.toggleLayerVisible(groupKey)` / `toggleLayerLocked(groupKey)`。
- **Entity 上**：链接（detach）+ 垃圾桶（delete）。
- 选中态用 `bg-cyan-500/15`；隐藏 group 用 `opacity-50`；接收 drop 时 `bg-cyan-500/10 ring-1 ring-cyan-500/30`。

## 渲染骨架

```jsx
<div className="h-full flex flex-col">
  <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800/60">
    <button onClick={createRoad}><FaPlus />Road</button>
    <button onClick={createRSU}><FaPlus />RSU</button>
  </div>
  {treeData.length === 0 ? <Empty /> : (
    <Tree<TreeNode> ref={treeRef} data={treeData} … >{Node}</Tree>
  )}
</div>
```

## 性能注释

- **`buildTree` 是 O(N)** + 几次 Map 操作；N ≤ 1e4 时 < 1ms。
- **react-arborist 虚拟化**：`overscanCount=10`、`rowHeight=26`，无论树多大都只渲染可见行 + buffer。
- **drag over 频繁触发 `checkDisableDrop`**：`canReparent` 必须保持 O(1)~O(K) 复杂度——它已基于 Map / Set 查询实现。
- **selection prop 是 controlled**：传入 `entity:${selectedId}` 字符串，避免内部状态不一致。

## 已知约束

- `Tree` 的 `height={600}` 是硬编码常数——目前不响应容器高度变化。如果 Sidebar 拖动调整高度，会出现内部滚动条而不是面板滚动条。修复需要 `ResizeObserver`。
- 创建的 `Road` 默认包含一个空 RoadSection；用户必须手动把 lane 拖进去才完成 assign。

## 源码索引

| 关注点                        | 文件位置                             |
| ----------------------------- | ------------------------------------ |
| 主组件                        | `LayerTree.tsx:17-142`               |
| `+ Road` / `+ RSU` 创建       | `LayerTree.tsx:25-48`                |
| `handleSelect`                | `LayerTree.tsx:50-60`                |
| `checkDisableDrop`            | `LayerTree.tsx:62-77`                |
| `handleMove`                  | `LayerTree.tsx:79-97`                |
| Node 渲染器                   | `LayerTree/Node.tsx`（整文件）       |
| 树构建器                      | `LayerTree/treeBuilder.ts`（整文件） |
| TYPE_LABELS / TOP_LEVEL_ORDER | `LayerTree/constants.ts`             |
| `TreeNode` / `DropKind`       | `LayerTree/types.ts`                 |
| `entityOps.canReparent`       | `src/lib/entityOps.ts`               |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) → SidebarPanel → LayerTree（`activeTab='layers'`）
- [`mapStore.reparentEntity`](/api/store/store-map)
- [`entityOps`](/api/lib) — proto 抗腐蚀层入口
- [架构](/architecture/) — Anti-corruption layer
- [InspectorForms](./inspector-forms.md) — 选中实体后的细节编辑

## 英文镜像

[/en/api/components/layer-tree](/en/api/components/layer-tree)

## 与其他组件的协作

本组件位于 [WorkspaceLayout](./workspace-layout.md) 装配的 React 树中——大部分协作通过 store / context 完成，少量通过 props 直接传递。下表枚举可观察到的耦合点：

| 组件                                     | 协作方式                                                            |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [WorkspaceLayout](./workspace-layout.md) | 直接 mount 并/或注入 `actorRef` / 调度 callback                     |
| [MapCanvas](./map-canvas.md)             | 通过 `mapStore.entities` 间接联动（修改后冷层 round-trip 重渲染）   |
| [LayerTree](./layer-tree.md)             | 通过 `mapStore` 共享实体状态                                        |
| [InspectorForms](./inspector-forms.md)   | 通过 `editorMachine.context.selectedEntityId` 同步选中实体          |
| [Action Registry](/api/core)             | 共享同一份 `ACTION_DEFS`；新增交互通常加 action，而不是组件特化逻辑 |

::: tip 维护建议
当组件之间需要**直接 prop 传递**时，先问自己：能不能改放到 store？如果该数据被 ≥3 个组件读取，store 通常更合适；2 个之间则 props 更轻量。
:::

## 设计 Token 与样式约定

本组件遵循 [架构](/architecture/) "Design tokens" 章节的命名约定：

- 背景：`bg-ams-bg-base` / `bg-ams-surface-active` / `bg-ams-surface-hover`
- 文字：`text-ams-text-primary` / `text-ams-text-secondary` / `text-ams-text-muted` / `text-ams-text-disabled`
- 边界：`border-ams-border-subtle` / `border-ams-border-strong`
- 强调：`text-ams-accent` / `bg-ams-accent`

新增样式应优先复用以上 token。如果当前 token 不能精确表达意图，再扩展 `src/index.css` 的 `@theme` 块。

## 测试策略

| 测试类型                | 关注点                                                         |
| ----------------------- | -------------------------------------------------------------- |
| 单元（vitest）          | Pure 函数、reducer、derived selector                           |
| 组件（testing-library） | props → render output、用户交互 → 回调触发                     |
| 集成                    | 与 store 协同（mock 全局 store） / 与 actor 协同（mock actor） |
| E2E（Playwright）       | 跨组件流程（draw → undo → redo / import → 编辑 → export）      |

测试文件遵循 `__tests__/{component}.test.tsx` 命名约定，与组件同级。
