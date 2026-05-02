---
title: MenuBar
description: 顶部 8px 高度的菜单条——动态从 Action Registry 读取菜单项，附带绘图/场景模式分段切换。
---

# MenuBar

> 源码：`src/components/layout/MenuBar.tsx`

## 用途与 UX 角色

`MenuBar` 是 WorkspaceLayout 顶端的 32px 菜单条，由四块组成（从左到右）：

1. **Logo + 应用名称** — `Apollo Map Studio` 文本与渐变图标徽标。
2. **菜单组**（File / Edit / View / Tools / Help）— **完全由 Action Registry 驱动**，菜单项不在组件里硬编码。
3. **Spacer**（`flex-1`）。
4. **ModeToggle** — 一对中文标签的分段按钮：`绘图` / `场景`，绑定 `useUIStore.appMode`。

它和 [ToolStrip](./tool-strip.md)、[CommandPalette](./command-palette.md) 一起构成 Action Registry 的三个 UI 出口（详见 [架构](/architecture/) 的"Action Registry"章节）。

## 组件组合树

```mermaid
flowchart TB
  MB[MenuBar]
  MB --> Logo[Logo + 应用名]
  MB --> MenuRow[Menu loop \(getMenuNames\)]
  MenuRow --> M1[Menu File]
  MenuRow --> M2[Menu Edit]
  MenuRow --> M3[Menu View]
  MenuRow --> M4[Menu Tools]
  MenuRow --> M5[Menu Help]
  MB --> Spacer
  MB --> MT[ModeToggle 绘图 / 场景]
```

## Props 接口

```ts
export interface MenuBarProps {
  onExecute: (actionId: ActionId) => void;
  getToggleState: (actionId: ActionId) => boolean;
}
```

| Prop             | 类型                              | 默认值 | 说明                                                                                 |
| ---------------- | --------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `onExecute`      | `(actionId: ActionId) => void`    | —      | 当用户点击某个菜单项时调用——通常是 `useActionDispatcher().execute`                   |
| `getToggleState` | `(actionId: ActionId) => boolean` | —      | 对 `isToggle` 属性为 true 的 action（如 `toggleGrid`）返回当前开关状态，用于渲染勾选 |

## 子组件

### `Menu`

```ts
function Menu(props: {
  label: string;
  actions: ActionDef[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExecute: (id: ActionId) => void;
  getToggleState: (id: ActionId) => boolean;
}): JSX.Element;
```

行为：

- 点击按钮 toggle 打开/关闭。
- 打开时挂载 `mousedown` 全局监听器，点外部即关闭（`MenuBar.tsx:32-41`）。
- 按 `menuOrder` 把 actions 分组，每 10 一档插入分隔线（`MenuBar.tsx:44-53`）。
- 渲染勾选时使用 `getToggleState(item.id) ? '✓' : ''`。

### `ModeToggle`

```ts
function ModeToggle(): JSX.Element;
```

- 直接读 `useUIStore` 的 `appMode` 与 `setAppMode`。
- `'drawing' | 'scene'` 两个按钮，每个 11px 字号、3px padding，激活时 `bg-cyan-500/20 text-cyan-300`。

## 内部状态

| 钩子                             | 作用                                  |
| -------------------------------- | ------------------------------------- |
| `useState<string \| null>(null)` | `openMenu` — 当前打开的菜单名（互斥） |
| `useUIStore(s.appMode)`          | 当前应用模式（绘图/场景）             |
| `useUIStore(s.setAppMode)`       | 切换模式                              |

## 副作用

- **Click outside**：每个 `Menu` 在 `isOpen=true` 时挂 `mousedown` 监听，点击非自身区域关闭。**必须**在 cleanup 中 `removeEventListener`，否则多个菜单切换时会泄漏。
- **菜单项执行**：`onExecute(item.id)` 由父组件的 `useActionDispatcher` 处理，包括 R1 撤销 CANCEL 修复。

## 渲染骨架

```jsx
<div className="h-8 bg-zinc-950 border-b border-white/[0.07] flex items-center px-2 shrink-0">
  <div className="flex items-center gap-2 mr-4">
    <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-400 to-cyan-600" />
    <span className="text-xs font-medium text-zinc-300 tracking-wide">Apollo Map Studio</span>
  </div>
  <div className="flex items-center">
    {menuNames.map((name) => (
      <Menu key={name} label={name} actions={getMenuActions(name)} … />
    ))}
  </div>
  <div className="flex-1" />
  <ModeToggle />
</div>
```

下拉面板：

```jsx
<div className="absolute top-full left-0 mt-1 py-1 min-w-[200px] bg-zinc-900 border border-white/10 rounded-md shadow-xl z-50">
  {/* 每项: ✓ 标记 / 标签 / 快捷键 */}
</div>
```

## 性能注释

- **`getMenuNames()` 每次 render 都调用**，但内部基于 `MENU_ORDER` 常量数组 + `Map.has`，O(N)，可以忽略。如果将来菜单极多，可在父组件 `useMemo`。
- **`Menu` 组件未 `memo`**：因为父组件传入的 `onExecute` / `getToggleState` 来自 `useActionDispatcher`，每次 render 都是新引用。`Menu` 内部的下拉面板已在 `isOpen=false` 时不渲染，浪费可忽略。
- **键盘快捷键不在此处理**：`useActionDispatcher` 在 WorkspaceLayout 顶层挂一个全局 `keydown` 监听器；`MenuBar` 只显示 `formatShortcut(item.shortcut)` 文本。

## 源码索引

| 关注点               | 文件位置                                                                            |
| -------------------- | ----------------------------------------------------------------------------------- |
| MenuBar 主体         | `MenuBar.tsx:142-177`                                                               |
| `Menu` 子组件        | `MenuBar.tsx:13-97`                                                                 |
| Click outside 监听   | `MenuBar.tsx:32-41`                                                                 |
| 菜单分隔符插入       | `MenuBar.tsx:44-53`                                                                 |
| ModeToggle           | `MenuBar.tsx:108-140`                                                               |
| Action Registry 入口 | `src/core/actions/registry.ts` (`getMenuNames`, `getMenuActions`, `formatShortcut`) |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — 父组件
- [ToolStrip](./tool-strip.md) / [CommandPalette](./command-palette.md) — 共享 Action Registry 的另外两个出口
- Action Registry → `src/core/actions/registry.ts`
- `useActionDispatcher` → [`/api/hooks`](/api/hooks)
- 模式切换 → [`uiStore.appMode`](/api/store/store-ui)

## 英文镜像

[/en/api/components/menu-bar](/en/api/components/menu-bar)
