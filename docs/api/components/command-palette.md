---
title: CommandPalette
description: 基于 cmdk 的 ⌘K 命令面板——按 category 分组渲染所有 inCommandPalette=true 的 actions，绑定 Action Registry。
---

# CommandPalette

> 源码：`src/components/layout/panels/CommandPalette.tsx`

## 用途与 UX 角色

`CommandPalette` 是经典的 ⌘K 浮层——通过 [`cmdk`](https://cmdk.paco.me/) 实现，用法和 VS Code / Linear / Raycast 一致：

- ⌘K（Mac） / Ctrl+K（Win/Linux）打开
- 输入框聚焦后实时 fuzzy 搜索
- 上下方向键导航；Enter 执行；Esc 关闭
- 命令按 `category` 分组（capitalize 后做组标题）
- 行右侧显示 toggle 状态勾选 `✓` 与快捷键 `formatShortcut`

它是 [Action Registry](/architecture/) 的第三个 UI 出口（与 [MenuBar](./menu-bar.md) / [ToolStrip](./tool-strip.md) 并列）——所有命令均来自 `getCommandPaletteActions()`，加新命令只需修改 `src/core/actions/registry.ts`。

## 组件接口

```ts
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExecute: (actionId: ActionId) => void;
  getToggleState?: (actionId: ActionId) => boolean;
}
```

| Prop             | 类型                              | 默认值      | 说明                                              |
| ---------------- | --------------------------------- | ----------- | ------------------------------------------------- |
| `open`           | `boolean`                         | —           | 显隐控制                                          |
| `onOpenChange`   | `(open: boolean) => void`         | —           | 打开/关闭回调；通常绑 `setCommandPaletteOpen`     |
| `onExecute`      | `(actionId: ActionId) => void`    | —           | 执行 action；通常 `useActionDispatcher().execute` |
| `getToggleState` | `(actionId: ActionId) => boolean` | `undefined` | 用于 isToggle action 渲染 ✓                       |

`open=false` 时返回 `null`——modal 不在 DOM 中。

## 内部状态

| 钩子                                        | 用途                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `useState<string>('')` `search`             | 当前输入字符串（cmdk 自身 fuzzy 算法）                                 |
| `useMemo(() => getCommandPaletteActions())` | 一次性读取所有可用 actions（registry 是常量，依赖空）                  |
| `useMemo(() => grouped)`                    | 按 `action.category`（首字母大写）分组成 `Record<string, ActionDef[]>` |
| `useCallback runCommand`                    | 调 `onExecute(action.id) → onOpenChange(false) → setSearch('')`        |

## 副作用

| 时机           | 行为                                             |
| -------------- | ------------------------------------------------ |
| `useEffect`    | 挂 `keydown` 全局监听：⌘/Ctrl+K toggle、Esc 关闭 |
| Backdrop click | `onOpenChange(false)`                            |
| `runCommand`   | 执行后立即关闭面板并清空 search                  |

::: warning 双重 keydown 监听
`WorkspaceLayout` 也挂了一个 ⌘K 监听器（在 inner 组件 `useEffect` 里），主要用于**关闭**时的 toggle。这里 CommandPalette 自身的 keydown 仅在 `open=true` 时挂——两者不冲突，因为 cmdk 的输入框在打开后会拦截事件优先级。
:::

## 渲染骨架

```jsx
<div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
  <div
    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
    onClick={() => onOpenChange(false)}
  />
  <Command
    className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
    loop
  >
    <div className="flex items-center border-b border-white/10 px-4">
      <FaMagnifyingGlass />
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Type a command or search..."
      />
      <kbd>ESC</kbd>
    </div>
    <Command.List className="max-h-[300px] overflow-y-auto p-2">
      <Command.Empty>No results found.</Command.Empty>
      {Object.entries(grouped).map(([group, items]) => (
        <Command.Group heading={group}>
          {items.map((action) => (
            <Command.Item value={`${action.label} ${group}`} onSelect={() => runCommand(action)}>
              <Icon /> <span>{action.label}</span>
              {isChecked && <span>✓</span>}
              {action.shortcut && <kbd>{formatShortcut(action.shortcut)}</kbd>}
            </Command.Item>
          ))}
        </Command.Group>
      ))}
    </Command.List>
    <div className="border-t … flex items-center gap-4 text-[10px] text-zinc-600">
      <span>↑↓ Navigate</span>
      <span>↵ Select</span>
      <span>ESC Close</span>
    </div>
  </Command>
</div>
```

## 性能注释

- **`Command` 自带 fuzzy 索引**：cmdk 对 `Command.Item` 的 `value` 字段建索引；输入时 O(N) 过滤但常数极小。
- **lazy load**：`WorkspaceLayout/lazyPanels.tsx:21-24` 把它包成 `LazyCommandPalette`，初次打开才下载 cmdk + 本组件。
- **空 `useMemo` deps**：`getCommandPaletteActions()` 在 registry 是 module-level 常量数组，不会变化。

## 已知缺口

- **没有最近使用记录**：每次打开列表顺序固定。可加 `localStorage` recent buffer。
- **没有命令参数化**：所有 action 是无参 button-style；将来需要"Go to entity by id"这类输入参数命令时，需扩展 cmdk 的子状态机。

## 源码索引

| 关注点               | 文件位置                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| 组件主体             | `CommandPalette.tsx:22-139`                                                   |
| 分组逻辑             | `CommandPalette.tsx:31-42`                                                    |
| `runCommand`         | `CommandPalette.tsx:44-51`                                                    |
| ⌘K / Esc 监听        | `CommandPalette.tsx:53-66`                                                    |
| Action Registry 入口 | `src/core/actions/registry.ts` (`getCommandPaletteActions`, `formatShortcut`) |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — `LazyCommandPalette` 在此 mount
- [MenuBar](./menu-bar.md) / [ToolStrip](./tool-strip.md) — 共享 Action Registry
- [`useActionDispatcher`](/api/hooks)
- [架构](/architecture/) — Action Registry

## 英文镜像

[/en/api/components/command-palette](/en/api/components/command-palette)
