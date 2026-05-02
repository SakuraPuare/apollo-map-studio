---
title: WorkspaceLayout
description: 编辑器根 shell——挂载 MenuBar / LicenseBanner / ToolStrip / Dockview / StatusBar，注入 EditorProvider + SidebarProvider，托管所有 modal 与 overlay。
---

# WorkspaceLayout

> 源码：
>
> - `src/components/layout/WorkspaceLayout.tsx`
> - `src/components/layout/WorkspaceLayout/dockviewLayout.ts`
> - `src/components/layout/WorkspaceLayout/lazyPanels.tsx`

## 用途与 UX 角色

`WorkspaceLayout` 是 Apollo Map Studio 的**根 chrome**——Photoshop 风格的桌面编辑器外壳，包含：

1. **顶部 MenuBar**（File / Edit / View / Tools / Help + 模式切换）。
2. **LicenseBanner**（试用倒计时 / 过期警示）。
3. **ToolStrip**（默认工具 + 11 元素图标 + 工具变体 + 视图切换）。
4. **Dockview shell**——左 Sidebar、中 MapCanvas、右 Inspector，外加 Scene 模式下的 Timeline 底部面板。
5. **底部 StatusBar**（模式 / 实体计数 / 光标坐标 / Zoom / Apollo 信息）。
6. **Overlays**：CommandPalette（⌘K）、SettingsPanel（modal）、ProjPickerDialog、TaskProgressOverlay、ActivationDialog。

它同时挂载两个 React Context：

- **`EditorProvider`** — 提供 XState 5 actor（`editorMachine`），供 ToolStrip / MapCanvas / Inspector 通过 `useEditorActor()` 获取。
- **`SidebarProvider`** — 持有 `activeTab`（`ActivityBar`）、搜索查询等侧边栏临时状态。

## 组件组合树

```mermaid
flowchart TB
  WL[WorkspaceLayout]
  WL --> EP[EditorProvider \(actor\)]
  EP --> SP[SidebarProvider \(tabs/search\)]
  SP --> Inner[WorkspaceLayoutInner]
  Inner --> MB[MenuBar]
  Inner --> LB[LicenseBanner]
  Inner --> TS[ToolStrip]
  Inner --> AB[ActivityBar]
  Inner --> DV[DockviewReact]
  DV --> MapPanel
  DV --> SidebarPanel
  DV --> InspectorPanel
  DV --> TimelinePanel
  Inner --> SB[StatusBar]
  Inner --> CP[CommandPalette \(lazy\)]
  Inner --> SetP[SettingsPanel \(lazy modal\)]
  Inner --> PPD[ProjPickerDialog \(lazy\)]
  Inner --> TPO[TaskProgressOverlay]
  Inner --> AD[ActivationDialog]
```

## Props 接口

`WorkspaceLayout` 是入口组件，**无 props**。

```ts
export function WorkspaceLayout(): JSX.Element;
```

`WorkspaceLayoutInner`（默认未导出）也无 props。所有跨子树通信通过 `EditorProvider` / `SidebarProvider` / Zustand 完成。

## 内部状态

| 钩子                                             | 类型                                  | 用途                                                                     |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------ |
| `useActorRef(editorMachine)`                     | `ActorRefFrom<editorMachine>`         | 顶层创建 XState actor，注入 `EditorProvider`                             |
| `useSelector(actorRef, s.value)`                 | `string`                              | 当前 FSM 状态名（`idle` / `selected` / `drawPolyline` / …）              |
| `useSelector(actorRef, s.context.activeElement)` | `MapElementType \| null`              | 当前选中元素类型                                                         |
| `useMapStore(s.entities.size)`                   | `number`                              | 实体数量，注入到 StatusBar                                               |
| `useUIStore(s.appMode)`                          | `'drawing' \| 'scene'`                | 应用模式；用于 Dockview 布局 keying（`<DockviewReact key={appMode} />`） |
| `useSidebar()`                                   | `{ activeTab, setActiveTab }`         | 活动栏当前选中页                                                         |
| `useState(false)` × 2                            | `commandPaletteOpen` / `settingsOpen` | overlay 开关                                                             |
| `useRef<DockviewApi>()`                          | `apiRef`                              | Dockview 命令式 API 句柄（保存/加载布局）                                |
| `useRef({...components})`                        | 稳定引用                              | Dockview 要求 component map 引用稳定，重建只在 `openSettings` 改变时     |
| `useActionDispatcher`                            | `{ execute, getToggleState }`         | Action Registry 唯一调度入口；同时绑定全局键盘快捷键                     |
| `useLicenseSync()`                               | `void`                                | 副作用：拉取 + 监听许可状态                                              |

## 副作用

| 时机                                | 行为                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useEffect(() => keydown listener)` | `Cmd/Ctrl+K` 切换 CommandPalette；`Esc` 关闭 CommandPalette。在组件卸载时 cleanup。                                                              |
| `onReady(event)` Dockview           | 优先 `loadLayout(api, appMode)`（从 localStorage），失败则 `createDefaultLayout`。订阅 `onDidLayoutChange` 自动持久化。布局键按 `appMode` 拆开。 |
| `<DockviewReact key={appMode}>`     | `appMode` 变化时强制重建 Dockview 实例——避免 `drawing` ↔ `scene` 间布局污染。                                                                    |
| `useActionDispatcher` 内部          | 注册全局键盘事件监听器；此处同时把 `onOpenCommandPalette` / `onOpenSettings` / `onResetLayout` 三个 callback 注入。                              |

::: warning 撤销与绘制状态一致性
`useActionDispatcher` 在 `undo` action 之前发送 `CANCEL` 给 actor，确保 mid-draw `Ctrl+Z` 不会让 FSM `drawPoints` 与 `mapStore.entities` 错位。详见 [`useActionDispatcher`](/api/hooks/) 与 [架构](/architecture/) 的绘制状态说明。
:::

## 渲染骨架

```jsx
<div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100">
  <MenuBar onExecute={execute} getToggleState={getToggleState} />
  <LicenseBanner />
  <ToolStrip … />
  <div className="flex-1 flex overflow-hidden">
    <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
    <div className="flex-1">
      <DockviewReact key={appMode} components={components} onReady={onReady} className="dockview-theme-dark" />
    </div>
  </div>
  <StatusBar mode={currentState} entityCount={entityCount} />
  {commandPaletteOpen && <Suspense><LazyCommandPalette … /></Suspense>}
  {settingsOpen && <Suspense><LazySettingsPanel … /></Suspense>}
  <Suspense fallback={null}><LazyProjPickerDialog /></Suspense>
  <TaskProgressOverlay />
  <ActivationDialog />
</div>
```

### Dockview 默认布局

`createDefaultLayout(api, mode)` 按以下顺序添加面板：

1. `map`（中央，title=`Map Editor`）
2. `sidebar`（左，`width: 240`）
3. `inspector`（右，`width: 280`）
4. `timeline`（底，仅 `scene` 模式，`height: 180`）

布局序列化键：

```ts
const LAYOUT_KEY_BY_MODE = {
  drawing: 'ams-layout-v3-drawing',
  scene: 'ams-layout-v3-scene',
};
```

### 懒加载面板

`lazyPanels.tsx` 把以下面板封装为 `React.lazy(...)`：

- `MapCanvas` → `MapPanelContent`
- `SidebarPanelContent`（探索者/层/搜索/设置 tabs）
- `TimelinePanel`
- `CommandPalette` / `SettingsPanel` / `ProjPickerDialog` / `EntityForm`

每个 lazy 边界外都有 `<Suspense fallback={<PanelFallback label="Loading…" />}>`，未加载时显示加载占位符。

## 性能注释

- **Dockview component map 引用稳定**：在 `useRef({...}).current` 中固化，避免 React 每次 re-render 重新挂载面板。
- **App mode 边界 re-mount**：`<DockviewReact key={appMode}>` 通过 React key 强制重建。`scene` 模式额外的 timeline 面板因此能干净地 mount/unmount。
- **Lazy boundaries**：所有 modal/overlay 都通过 `React.lazy` 拆 chunk；CommandPalette / SettingsPanel / ProjPicker 的代码不在初始包内。
- **入口 actor 唯一**：`useActorRef` 在最外层调用一次。所有子组件通过 `useEditorActor()` 拿到同一个引用，避免重复实例化 FSM。

## 源码索引

| 关注点                        | 文件位置                                  |
| ----------------------------- | ----------------------------------------- |
| 入口 / Provider 装配          | `WorkspaceLayout.tsx:186-195`             |
| Internal layout               | `WorkspaceLayout.tsx:41-182`              |
| Keyboard `⌘K` / `Esc`         | `WorkspaceLayout.tsx:63-77`               |
| Reset layout                  | `WorkspaceLayout.tsx:80-86`               |
| `useActionDispatcher` 调用    | `WorkspaceLayout.tsx:89-94`               |
| Dockview onReady + 布局持久化 | `WorkspaceLayout.tsx:106-115`             |
| 默认布局 builder              | `WorkspaceLayout/dockviewLayout.ts:34-60` |
| Lazy 面板封装                 | `WorkspaceLayout/lazyPanels.tsx:6-39`     |
| Inspector 内嵌实体表单分发    | `WorkspaceLayout/lazyPanels.tsx:79-112`   |

## 跨页参考

- [MenuBar](./menu-bar.md) / [ToolStrip](./tool-strip.md) / [ActivityBar](./activity-bar.md) / [StatusBar](./status-bar.md) — 子组件
- [MapCanvas](./map-canvas.md) — 中央面板内容
- [InspectorForms](./inspector-forms.md) — Inspector 面板内容
- [CommandPalette](./command-palette.md) / [SettingsPanel](./settings-panel.md) / [ProjPickerDialog](./proj-picker-dialog.md) / [TaskProgressOverlay](./task-progress-overlay.md) / [ActivationDialog](./activation-dialog.md) — overlay
- [`useActionDispatcher`](/api/hooks) — 单一 action 分发与全局快捷键
- [架构总览](/architecture/) — 层级约束、撤销与绘制状态一致性
- [布局演变](/architecture/) — VS Code → Photoshop 重新设计

## 英文镜像

[/en/api/components/workspace-layout](/en/api/components/workspace-layout)

## 详细生命周期

### 应用启动时序

```mermaid
sequenceDiagram
  participant ER as Electron Renderer
  participant App as <App />
  participant WL as WorkspaceLayout
  participant Actor as useActorRef(editorMachine)
  participant License as useLicenseSync
  participant Dock as DockviewReact
  participant LS as localStorage

  ER->>App: ReactDOM.createRoot
  App->>WL: <WorkspaceLayout />
  WL->>Actor: 创建 actor
  Actor-->>WL: actorRef
  WL->>License: useLicenseSync()
  License->>License: bridge.getInitialState()
  WL->>Dock: <DockviewReact key={appMode} onReady />
  Dock->>WL: onReady(event)
  WL->>LS: loadLayout('ams-layout-v3-drawing')
  LS-->>WL: saved layout JSON
  WL->>Dock: api.fromJSON(saved) 或 createDefaultLayout
  Dock->>Dock: onDidLayoutChange → saveLayout
```

### 模式切换

切换 `appMode` 时序：

1. 用户点击 ModeToggle（MenuBar 内）。
2. `setAppMode('scene')` 写入 `useUIStore`。
3. `WorkspaceLayoutInner` re-render，`<DockviewReact key="scene">` —— React 视为新组件，旧实例 unmount。
4. 旧实例 unmount 时 `apiRef.current` 的 `onDidLayoutChange` 监听一并解绑。
5. 新实例 mount，`onReady(event)` 重新执行：
   - 尝试 `loadLayout('ams-layout-v3-scene')`
   - 没有则 `createDefaultLayout(api, 'scene')`，比 drawing 多一个 `timeline` 面板。

::: warning 跨模式拖布局不互通
布局存储 key 按 mode 拆分。在 drawing 模式调好的 sidebar/inspector 宽度，**不会**自动同步到 scene 模式——这是有意为之，让两种模式有完全不同的工作区。
:::

## Slot 一览

下表枚举 WorkspaceLayout 提供的所有"插槽"，让二开开发者知道在何处嵌入新组件：

| Slot 位置           | 文件位置                                 | 何时考虑使用                            |
| ------------------- | ---------------------------------------- | --------------------------------------- |
| MenuBar 菜单组      | `src/core/actions/registry.ts` 加 action | 添加新菜单项                            |
| ToolStrip view slot | `slot: 'view'` 的 action                 | 添加视图切换（如 toggle minimap）       |
| ActivityBar tab     | `ActivityBar.tsx:11-17` `tabs` 数组      | 加新的 sidebar 视图                     |
| Sidebar tab content | `SidebarPanel.tsx`                       | 实现某个 ActivityTab 的内容             |
| Inspector 子表单    | `InspectorForms.tsx:46-80` switch        | 给新的 entityType 增加表单              |
| Modal overlay       | `WorkspaceLayout.tsx:152-180`            | 加全局 modal（参考 SettingsPanel 模式） |
| Status bar 段       | `StatusBar.tsx`                          | 加底部状态指示器                        |

## 故障排查

| 症状                           | 可能原因                                                                 | 修复路径                                                       |
| ------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Dockview 永远显示空白          | localStorage 中的 layout JSON 与组件 ID 不匹配（升级后旧 layout 不兼容） | `clearSavedLayout(appMode)` 或更新 `LAYOUT_KEY_BY_MODE` 版本号 |
| ⌘K 无反应                      | CommandPalette 未懒加载完成 / `onOpenCommandPalette` 未传入              | 检查 `WorkspaceLayout.tsx:91` callback                         |
| 切换模式后旧 timeline 面板残留 | `key={appMode}` 缺失或被绕过                                             | 确保 `<DockviewReact key={appMode}>` 存在                      |
| 撤销时绘制状态错位             | `useActionDispatcher` 的取消绘制顺序被破坏                               | 检查 `useActionDispatcher.ts:76-82`                            |
| 多个 actor 实例                | 误在子组件 `useActorRef`                                                 | 仅在 `WorkspaceLayout` 顶层创建一次                            |

## 测试要点

1. **布局持久化**：mock localStorage 验证 saveLayout / loadLayout 往返。
2. **模式切换**：使用 testing-library 的 `userEvent.click` 触发 ModeToggle，断言 timeline 面板出现/消失。
3. **快捷键**：模拟 `keydown`（`{ key: 'k', metaKey: true }`），断言 CommandPalette 状态切换。
4. **Esc 关闭**：CommandPalette open 时按 Esc，断言关闭。
5. **Dockview 重置**：调用 `handleResetLayout`，断言面板回到默认布局。

E2E 覆盖位于 `e2e/workspace-layout.spec.ts`（如果未来添加 Playwright）。

## 常见问答

**Q：为什么 Dockview 用 React key 而不是 effect 销毁？**
A：Dockview 内部维护非 React 的 DOM 状态。React key 触发的 unmount → mount 是干净的销毁路径，比 ref-based 销毁可靠。

**Q：`useRef({...components}).current` 而不是 `useMemo` 的原因？**
A：`useMemo` 不保证不在 cache miss 时重算；`useRef` 保证 component map 引用永远稳定。Dockview 在 component map 变化时会重 mount 所有面板，必须避免。

**Q：为什么 ActivationDialog 和 TaskProgressOverlay 不通过 lazy 加载？**
A：两者都很轻（< 4KB），且需要在 mount 时立即注册全局 callback / 监听 store——延迟会让 `licenseStore.promptActivation` 初次调用无响应。
