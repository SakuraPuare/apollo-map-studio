---
title: MapOutline
description: 只读结构概要面板——按 Apollo 实体类型逐项计数，做孤儿/悬挂引用健康检查，并在底部嵌入 Apollo 头部元数据。
---

# MapOutline

> 源码：
>
> - `src/components/layout/panels/MapOutline.tsx`
> - `src/components/layout/panels/MapMetadataForm.tsx`（嵌入在底部）

## 用途与 UX 角色

`MapOutline` 是 Sidebar 的**只读概要**面板（`activeTab === 'explorer'`），让用户在导出前快速审核地图内容。它做三件事：

1. **总实体数** — 顶部一行 `Total entities: N`。
2. **按 Apollo 类型分组的计数**（17 类）— 仅显示 N>0 的类型。
3. **绘图原语计数** — `polyline / catmullRom / bezier / arc / rect / polygon` 合并为一项 "Drawing Primitives · Total"。
4. **健康检查**：
   - **Unparented Lanes** — lane 既无 `junctionId` 也未在任何 RoadSection 中
   - **Dangling junction_id** — `lane.junctionId` / `road.junctionId` / `rsu.junctionId` 引用的 junction 不存在
5. **MapMetadataForm**（底部嵌入）— 显示 `apollo.hdmap.Map.header` 的 12 个字段：version / date / projection.proj / district / generation / rev_major / rev_minor / vendor / left / top / right / bottom。

整个面板**只读**——任何编辑都通过其他面板（LayerTree, Inspector）进行。

## Props 接口

`MapOutline` 不接受 props。

```ts
export function MapOutline(): JSX.Element;
```

## 内部状态

| 钩子                          | 用途                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `useMapStore(s.entities)`     | 订阅整个实体 Map（依赖触发 useMemo 重算）                              |
| `useMemo(() => computeStats)` | 把 entities 流式扫描成 `OutlineStats`：apollo counts、绘图计数、孤儿数 |

`computeStats` 步骤（`MapOutline.tsx:64-100`）：

1. 第一遍扫描收集 RoadSection 中的 lane id 集合 `lanesInSection`。
2. 第二遍扫描每个 entity：
   - 绘图类型 → `drawingCount++`
   - 否则 → `apolloCounts.set(type, n+1)`
   - 对 lane / road / rsu 做 dangling-junction 检测

## 副作用

无 effect。该组件是纯派生视图。

## 渲染骨架

```jsx
<div className="h-full overflow-y-auto p-3 text-xs text-zinc-300 font-mono">
  <div className="mb-3 pb-2 border-b border-white/10">
    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Map Outline</div>
    <div className="text-zinc-400">Total entities: <span className="text-cyan-400">{n}</span></div>
  </div>
  {hasAnything ? (
    <>
      <Section title="Apollo HD-Map">{/* per-type rows */}</Section>
      {drawingCount > 0 && <Section title="Drawing Primitives"><Row label="Total" /></Section>}
      <Section title="Health"><Row label="Unparented Lanes" warn={…} /><Row label="Dangling junction_id" warn={…} /></Section>
    </>
  ) : <div>No entities yet.</div>}
  <MapMetadataForm />
</div>
```

`Section` 与 `Row` 是文件内的小组件：

- `Section` — 大写小标题 + 子项 `space-y-0.5` 容器。
- `Row` — `flex justify-between`，warn 时变 amber，否则 cyan。

## MapMetadataForm 嵌入

底部 `<MapMetadataForm />` 通过 `useApolloMapStore(s.header, s.info)` 读 Apollo 导入数据。如果用户尚未导入 Apollo `.bin/.txt`，显示占位文本：

> No Apollo map imported. Header metadata becomes available after import.

如果已导入：分三段（Source / Header / Bounds）显示。**只读**——`apolloMapStore` 当前没有 `setHeader` mutator（详见组件源码顶部注释，`MapMetadataForm.tsx:6-26`）。

## 性能注释

- **O(N) 扫描两次**：`computeStats` 显式做两次遍历。N 通常 ≤ 1e4，可忽略。
- **`useMemo`** 锁定在 `entities` 引用上——store 设置 `entities` 用 immutable Map，新引用会触发重算，旧引用复用结果。
- **不订阅 selectedEntityId**：与 LayerTree 不同，MapOutline 不关心选中状态，避免无谓重渲染。

## 已知缺口

- 无法编辑 header（详见组件顶部注释）；
- 无法点击某行跳转过滤（未来可考虑链接到 SearchPanel）；
- "Total" 行没有按图层可见性过滤——隐藏图层的实体仍然计入。

## 源码索引

| 关注点            | 文件位置                        |
| ----------------- | ------------------------------- |
| 组件主体          | `MapOutline.tsx:102-158`        |
| `computeStats`    | `MapOutline.tsx:64-100`         |
| `Section`         | `MapOutline.tsx:160-167`        |
| `Row`             | `MapOutline.tsx:169-176`        |
| 类型常量          | `MapOutline.tsx:10-55`          |
| `MapMetadataForm` | `MapMetadataForm.tsx`（整文件） |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) → SidebarPanel → MapOutline（`activeTab='explorer'`）
- [LayerTree](./layer-tree.md) — 互补的可编辑视图
- [`apolloMapStore`](/api/store/) — header / bounds / info 来源
- [`mapStore`](/api/store/store-map) — `entities` 来源

## 英文镜像

[/en/api/components/map-outline](/en/api/components/map-outline)

## 与其他组件的协作

本组件位于 [WorkspaceLayout](./workspace-layout.md) 装配的 React 树中——大部分协作通过 store / context 完成，少量通过 props 直接传递。下表枚举可观察到的耦合点：

| 组件                                     | 协作方式                                                            |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [WorkspaceLayout](./workspace-layout.md) | 直接 mount 并/或注入 `actorRef` / 调度 callback                     |
| [MapCanvas](./map-canvas.md)             | 通过 `mapStore.entities` 间接联动（修改后冷层 round-trip 重渲染）   |
| [LayerTree](./layer-tree.md)             | 通过 `mapStore` 共享实体状态                                        |
| [InspectorForms](./inspector-forms.md)   | 通过 `editorMachine.context.selectedEntityId` 同步选中实体          |
| [Action Registry](/api/core/)            | 共享同一份 `ACTION_DEFS`；新增交互通常加 action，而不是组件特化逻辑 |

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
