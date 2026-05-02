---
title: ToolStrip
description: 36px 高度的工具条——默认/连接模式按钮 + 11 个元素图标 + 元素特定的工具变体 + 视图切换，全部由 Action Registry 驱动。
---

# ToolStrip

> 源码：`src/components/layout/ToolStrip.tsx`

## 用途与 UX 角色

`ToolStrip` 是 MenuBar 下方的 36px 高工具条。它有四个功能区（左→右）：

1. **Default + Connect** — 两个 modal-switch 按钮（不是绘制工具），分别走 `defaultMode` 和 `connectLanes` action。
2. **ElementBar** — 11 个 Apollo 元素图标（lane / road / signal / crosswalk …），点击切换 `currentElement`。
3. **Tool variants**（条件渲染）— 一旦选中 element，只有该 element 允许的工具会出现：例如 lane 支持 `drawCatmullRom` / `drawBezier`，crosswalk 只支持 `drawPolygon`。
4. **Spacer + Command Palette 触发器**。
5. **View slot** — 由 Action Registry 中 `slot=view` 的 action 自动填充（比如 `toggleGrid`、`toggleSnap`）。

## 组件组合树

```mermaid
flowchart TB
  TS[ToolStrip]
  TS --> Modal[ToolButton defaultMode]
  TS --> Conn[ToolButton connectLanes]
  TS --> Div1[Divider]
  TS --> EB[ElementBar 11×]
  TS --> Div2{conditional Divider}
  TS --> TV[Tool variants \(filtered by element\)]
  TS --> Spacer
  TS --> CP[Command Palette button ⌘K]
  TS --> Div3[Divider]
  TS --> View[View slot \(toggleGrid/toggleSnap …\)]
```

## Props 接口

```ts
interface ToolStripProps {
  currentTool: string;
  currentElement: MapElementType | null;
  onSelectTool: (tool: DrawTool, element?: MapElementType) => void;
  onOpenCommandPalette?: () => void;
  onExecuteAction: (actionId: ActionId) => void;
  getToggleState: (actionId: ActionId) => boolean;
}
```

| Prop                   | 类型                                                 | 默认值 | 说明                                                                                      |
| ---------------------- | ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `currentTool`          | `string`                                             | —      | 当前 FSM 状态（`drawPolyline` / `idle` / …）                                              |
| `currentElement`       | `MapElementType \| null`                             | —      | 当前选中元素类型；为 `null` 时隐藏工具变体                                                |
| `onSelectTool`         | `(tool: DrawTool, element?: MapElementType) => void` | —      | 选择 element 或工具时的回调；通常 `actorRef.send({ type: 'SELECT_TOOL', tool, element })` |
| `onOpenCommandPalette` | `() => void`                                         | —      | ⌘K 按钮的 onClick                                                                         |
| `onExecuteAction`      | `(actionId: ActionId) => void`                       | —      | View slot / default / connect 按钮调用此函数                                              |
| `getToggleState`       | `(actionId: ActionId) => boolean`                    | —      | 仅对 `isToggle` action 返回开关状态（Grid / Snap / DefaultMode）                          |

## 子组件

### `ToolButton`

通用图标按钮，激活态使用 `bg-ams-accent/20 text-ams-accent shadow-[inset_0_-2px_0_0_var(--color-ams-accent)]`，未激活悬停时 `hover:bg-ams-surface-hover`。

### `Divider`

竖线 `w-px h-5 bg-ams-border-strong`。

### `ElementBar`

11 个图标按钮，无文本；激活时背景 `bg-ams-surface-active` + 字色取自 `el.color`（每个 element 在 `MAP_ELEMENTS` 里定义自身颜色）。

## 内部状态

`ToolStrip` 是无状态组件——所有状态来自父级（`currentTool` / `currentElement`）或 Action Registry / `useActionDispatcher`（`getToggleState`）。

## 副作用

无 effect。所有交互通过 callback 传到父级。

## 渲染逻辑

1. 从 Action Registry 取 `defaultMode` 与 `connectLanes` 两个 action，渲染顶部按钮（`ToolStrip.tsx:134-161`）。
2. 渲染 `ElementBar`：点击触发 `onSelectTool(def.defaultTool, type)`（`ToolStrip.tsx:113-115`）。
3. 如果 `currentElement` 非空，过滤 `ALL_DRAW_TOOLS` 取该 element 允许的工具，逐一渲染 `ToolButton`（`ToolStrip.tsx:108-186`）。
4. 渲染 `<button>⌘K</button>`，调 `onOpenCommandPalette`。
5. 用 `getToolStripSlotActions('view')` 取所有 `slot==='view'` 的 action，渲染到右侧（`ToolStrip.tsx:204-216`）。

## 性能注释

- **无 memoization**：组件足够轻量；`ALL_DRAW_TOOLS.filter` 数组很小（最多 6 项）。
- **`ACTION_DEFS.find` 每次 render 触发**：考虑改用 `ACTION_MAP.get('defaultMode')`（在 registry 内有 O(1) 查询），但对于 5 项以下的 array 影响可忽略。
- **稳定的 onClick lambda**：每次 render 都是新闭包，但子组件没 memo，影响为 0。

## 设计 token 注释

`ToolStrip` 是 `ams-*` 设计 token 的**示范迁移点**。未激活元素颜色取 `text-ams-text-secondary`，hover `bg-ams-surface-hover`，激活背景 `bg-ams-accent/20` + `shadow-[inset_0_-2px_0_0_var(--color-ams-accent)]` 形成底部高亮线。详见 [架构](/architecture/) 的"设计 tokens"章节。

## 源码索引

| 关注点               | 文件位置                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------ |
| 组件主体             | `ToolStrip.tsx:100-219`                                                                    |
| `ToolButton`         | `ToolStrip.tsx:38-56`                                                                      |
| `ElementBar`         | `ToolStrip.tsx:71-96`                                                                      |
| Default + Connect 段 | `ToolStrip.tsx:134-161`                                                                    |
| Tool variants 过滤   | `ToolStrip.tsx:108-111`, `166-187`                                                         |
| View slot            | `ToolStrip.tsx:204-216`                                                                    |
| Element 注册表       | `src/core/elements.ts` (`MAP_ELEMENTS`, `ELEMENT_MAP`, `ALL_DRAW_TOOLS`)                   |
| Action 注册表        | `src/core/actions/registry.ts` (`ACTION_DEFS`, `getToolAction`, `getToolStripSlotActions`) |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — 父组件
- [MenuBar](./menu-bar.md) / [CommandPalette](./command-palette.md) — 共享 Action Registry
- [`editorMachine`](/api/core) — `SELECT_TOOL` / `DEFAULT_MODE` / `CONNECT_LANES` 事件
- [架构](/architecture/) — Action Registry 设计、ams-\* 设计 token

## 英文镜像

[/en/api/components/tool-strip](/en/api/components/tool-strip)
