---
title: LaneRefList
description: Inspector 中 lane id 的可点击药丸列表——基于 SELECT_ENTITY FSM 事件路由跳转，自动检测 dangling 引用并禁用对应按钮。
---

# LaneRefList

> 源码：`src/components/layout/panels/LaneRefList.tsx`

## 用途与 UX 角色

`LaneRefList` 把"successors / predecessors / leftNeighbors / rightNeighbors"这类 lane id 字段从一行干巴巴的数字（"Successors: 1"）升级成 **可点击药丸列表**——每个药丸：

- 显示 lane id 的尾 6 字符（避免溢出 inspector）
- `title` 提示完整 id
- 点击触发 `actorRef.send({ type: 'SELECT_ENTITY', id })`，**走和画布点击同一条选中链路**——保证 store 状态、Inspector 重挂载、layer tree 高亮全部一致
- 已删除（dangling）目标：药丸渲染为 line-through 灰底，不可点击

它在所有 InspectorForms 中被**重用**——LaneForm 通过 `LaneInspectorSchema.readonly` 里的 `compute(entity) => <LaneRefList ids={…} />` 调用。

## 组件接口

```ts
interface LaneRefListProps {
  ids: readonly string[];
  short?: boolean; // default true：仅显示尾 6 字符
}

export function LaneRefList(props: LaneRefListProps): JSX.Element;

// Single-id 变体
export function LaneRef({ id }: { id: string | null | undefined }): JSX.Element;
```

| Prop    | 类型                | 默认值 | 说明                            |
| ------- | ------------------- | ------ | ------------------------------- |
| `ids`   | `readonly string[]` | —      | 要显示的 lane id 列表           |
| `short` | `boolean`           | `true` | 是否仅显示尾 6 字符（避免折行） |

`LaneRef` 是 `LaneRefList` 的单 id 包装，常用于 `junctionId` 这种"最多一个"的字段。

## 内部状态

| 钩子                              | 用途                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `useEditorActor()`                | 拿到 XState actor，发送 `SELECT_ENTITY`                                            |
| `useMapStore.getState().entities` | 在 click handler / 渲染时**同步**查 entity 是否存在；不订阅，避免 ids 变更时重渲染 |

::: warning 设计权衡
`useMapStore.getState()` 是**非订阅式**读取。这意味着如果某个 lane id 被其他地方删除，`LaneRefList` 不会自动重渲染来更新"是否禁用"——只有当 ids prop 变化时才会刷新。这是**故意的**：避免每次 store 变更都触发 inspector 中数十个 LaneRefList 的级联重渲染。父级 InspectorForms 在 entity 更新时会自然刷新整片。
:::

## 副作用

无 effect。`onClick` 通过 `useEditorActor().send` 路由 FSM 事件。

## 渲染骨架

空数组：

```jsx
<span className="text-zinc-500">—</span>
```

非空：

```jsx
<div className="flex flex-wrap gap-1">
  {ids.map((id) => (
    <button
      onClick={() => handleClick(id)}
      disabled={!exists}
      title={id}
      className={cn(
        'px-1.5 py-0.5 rounded font-mono text-[10px] leading-none border transition-colors',
        exists
          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 cursor-pointer'
          : 'border-white/5 bg-zinc-800/40 text-zinc-500 cursor-not-allowed line-through',
      )}
    >
      {short && id.length > 12 ? `…${id.slice(-6)}` : id}
    </button>
  ))}
</div>
```

## 性能注释

- **轻量级组件**：典型 lane 的 successors/predecessors ≤ 4，无需虚拟化。
- **Click handler 闭包**：每次 render 创建新闭包，不影响——子按钮没 memo 也无所谓。
- **不订阅 store**：是性能优化的一部分（见上）。

## 已知约束

- 当目标 lane 被删除后，UI 仍然显示禁用药丸——直到 inspector 因父 entity 更新而重渲染。这通常发生在毫秒内（删除会触发 reconcile，reconcile 会更新当前 lane 的 successors 列表），所以视觉上不会停留。
- 不支持反向引用导航——例如"谁在 successors 里指向我？"——这需要全图扫描，目前不在此组件范围内。

## 源码索引

| 关注点               | 文件位置                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| 主组件 `LaneRefList` | `LaneRefList.tsx:20-58`                                                        |
| 单 id 变体 `LaneRef` | `LaneRefList.tsx:65-68`                                                        |
| `useEditorActor`     | `src/context/EditorContext.tsx`                                                |
| Schema 中的使用      | `src/types/inspectorSchema.ts`（lane successors / predecessors readonly 定义） |

## 跨页参考

- [InspectorForms](./inspector-forms.md) — 调用方
- [`editorMachine`](/api/core/) — `SELECT_ENTITY` 事件
- [`mapStore`](/api/store/store-map) — `entities` 验在性

## 英文镜像

[/en/api/components/lane-ref-list](/en/api/components/lane-ref-list)
