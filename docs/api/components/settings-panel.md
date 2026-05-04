---
title: SettingsPanel
description: Modal 设置弹窗——撤销历史上限、地图视口（lng/lat/zoom）、Lane 半宽与箭头间距，所有写入直接落 settingsStore + 持久化。
---

# SettingsPanel

> 源码：
>
> - `src/components/layout/panels/SettingsPanel.tsx`
> - `src/components/layout/panels/MapMetadataForm.tsx`（在 [MapOutline](./map-outline.md) 中嵌入，本页不重复展开）

## 用途与 UX 角色

`SettingsPanel` 是一个 modal 弹窗，承载所有"用户偏好"设置。当前包含 4 个 section：

1. **Undo History** — `historyLimit`（zundo 内部上限），范围由 `MIN_HISTORY_LIMIT` / `MAX_HISTORY_LIMIT` 限定。
2. **Map Viewport** — `mapCenterLng` / `mapCenterLat` / `mapZoom`（写入后**重启应用方生效**，因为 MapLibre `Map` 实例已挂载）。
3. **Lane** — `laneHalfWidth`（默认半宽，米）+ `laneArrowSpacing`（车道箭头间距，像素）。
4. **Layout** — "Reset Layout to Default" 按钮：清掉两个 layout key 并 reload。

弹窗以 modal 形式覆盖（`bg-black/60 backdrop-blur-sm`），ESC 关闭，点 backdrop 关闭。

## 组件接口

```ts
interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}
```

| Prop      | 类型         | 默认值 | 说明       |
| --------- | ------------ | ------ | ---------- |
| `open`    | `boolean`    | —      | 控制可见性 |
| `onClose` | `() => void` | —      | 关闭回调   |

未打开时返回 `null`，整棵 modal 不在 DOM 中。

## NumInput 子组件

文件内通用受控 number input：

```ts
function NumInput(props: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
  onReset: () => void;
}): JSX.Element;
```

行为：

- 输入时只更新 draft（字符串），不写 store——避免每按一键都触发持久化。
- `onBlur` 调用 `commit()`：`Number(value)` 有效 → clamp 到 `[min,max]` → `onCommit(n)`；无效 → `onReset()`。
- `Enter` 触发 blur。

## 内部状态

| 钩子                                                                      | 用途                               |
| ------------------------------------------------------------------------- | ---------------------------------- |
| `useSettingsStore(s.historyLimit)` + `setHistoryLimit`                    | undo 历史上限                      |
| `useSettingsStore(s.mapCenterLng/Lat/Zoom)` + `setMapCenter / setMapZoom` | 视口                               |
| `useSettingsStore(s.laneHalfWidth/laneArrowSpacing)` + setters            | Lane 默认                          |
| 6 个 `useState<string>` `draft*`                                          | 各字段的临时草稿值，blur 时 commit |

`useEffect([open, onClose])` 挂载 `Escape` 全局监听器，关闭时 cleanup。

## 副作用

| 时机                | 行为                                               |
| ------------------- | -------------------------------------------------- |
| `Esc` keydown       | `onClose()`                                        |
| Backdrop click      | `onClose()`                                        |
| 字段 blur / Enter   | clamp + 写 settingsStore                           |
| `Reset Layout` 按钮 | `clearAllSavedLayouts(); window.location.reload()` |

## 渲染骨架

```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
  <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
    <Header title="Settings" onClose={onClose} />
    <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
      <Section title="Undo History">…</Section>
      <Section title="Map Viewport (restart to apply)">…</Section>
      <Section title="Lane">…</Section>
      <Section title="Layout">…</Section>
    </div>
  </div>
</div>
```

## 性能注释

- **Draft + commit 模式**：避免每次 keystroke 都序列化整个 settings store；blur 才落库。
- **Lazy loaded**：通过 `WorkspaceLayout/lazyPanels.tsx:26-29` 的 `LazySettingsPanel` 懒加载；不在初始 bundle 中。
- **`max-h-[60vh] overflow-y-auto`**：保证小屏也可滚动查看所有选项。

## 已知缺口

- "Restart to apply" 提示仅在 Map Viewport section 显示——其他字段的实时性未做明确提示，用户不一定知道哪些立即生效。
- "Reset Layout" 现在会清当前两个 layout key 后 reload。若 dockview 仍异常，通常需要直接使用 `View → Reset Layout`。

## 源码索引

| 关注点            | 文件位置                     |
| ----------------- | ---------------------------- |
| 组件主体          | `SettingsPanel.tsx:63-240`   |
| `NumInput` 子组件 | `SettingsPanel.tsx:17-54`    |
| Esc 监听          | `SettingsPanel.tsx:86-93`    |
| Undo History 段   | `SettingsPanel.tsx:117-137`  |
| Map Viewport 段   | `SettingsPanel.tsx:139-186`  |
| Lane 段           | `SettingsPanel.tsx:188-219`  |
| Layout reset 按钮 | `SettingsPanel.tsx:221-235`  |
| `settingsStore`   | `src/store/settingsStore.ts` |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — 父组件（modal 在最外层）
- [`settingsStore`](/api/store) — 数据源
- [MapOutline](./map-outline.md) — 嵌入了 `MapMetadataForm`（本页姊妹 docs 中介绍）

## 英文镜像

[/en/api/components/settings-panel](/en/api/components/settings-panel)

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
