---
title: Keyboard Shortcuts (跨平台别名表)
description: 平台间快捷键映射别名表，给从 Photoshop / VS Code / QGIS 转入的用户做记忆参考；详细 KeyBinding 见 Shortcuts 主页。
---

# Keyboard Shortcuts / 跨平台映射

> 本页是 [Shortcuts](./shortcuts.md) 的**别名映射**视角：把 AMS 快捷键和 Photoshop / VS Code / QGIS 这三个最常见的同类工具放在同一张对比表中，便于从其它工具迁移过来的用户**口语化记忆**。

::: tip 两页内容关系

- [Shortcuts](./shortcuts.md) — 真相之源（id、KeyBinding 对象、global flag）
- [Keyboard Shortcuts](./keyboard-shortcuts.md)（本页） — 直觉记忆 + 跨平台映射

如果你是新用户、第一次看 AMS，请直接读 [Shortcuts](./shortcuts.md)。
:::

## 跨平台键位 / Per-Platform Mapping

| 操作           | macOS          | Windows        | Linux          | AMS Action id          |
| -------------- | -------------- | -------------- | -------------- | ---------------------- |
| 撤销           | `⌘Z`           | `Ctrl+Z`       | `Ctrl+Z`       | `undo`                 |
| 重做           | `⇧⌘Z`          | `Ctrl+Shift+Z` | `Ctrl+Shift+Z` | `redo`                 |
| 导出 .bin      | `⌘S`           | `Ctrl+S`       | `Ctrl+S`       | `exportApolloBin`      |
| 导出 .txt      | `⇧⌘S`          | `Ctrl+Shift+S` | `Ctrl+Shift+S` | `exportApolloText`     |
| 命令面板       | `⌘K`           | `Ctrl+K`       | `Ctrl+K`       | `commandPalette`       |
| 设置           | `⌘,`           | `Ctrl+,`       | `Ctrl+,`       | `settings`             |
| 切换栅格       | `⌘G`           | `Ctrl+G`       | `Ctrl+G`       | `toggleGrid`           |
| 删除           | `Delete` / `⌫` | `Delete`       | `Delete`       | `delete`               |
| Default Pan    | `H`            | `H`            | `H`            | `defaultMode`          |
| Connect Lanes  | `C`            | `C`            | `C`            | `connectLanes`         |
| 绘制 Polyline  | `P`            | `P`            | `P`            | `tool:drawPolyline`    |
| 绘制 Bezier    | `B`            | `B`            | `B`            | `tool:drawBezier`      |
| 绘制 Arc       | `A`            | `A`            | `A`            | `tool:drawArc`         |
| 绘制 Rectangle | `R`            | `R`            | `R`            | `tool:drawRotatedRect` |
| 绘制 Polygon   | `G`            | `G`            | `G`            | `tool:drawPolygon`     |

## 与 Photoshop 对照 / vs Photoshop

| Photoshop | 含义           | AMS 等价         | 备注                                         |
| --------- | -------------- | ---------------- | -------------------------------------------- |
| `H`       | Hand 手形抓    | `H` Default(Pan) | 完全一致                                     |
| `P`       | Pen 钢笔       | `P` Polyline     | 一致                                         |
| `R`       | Rotate / Rect  | `R` Rectangle    | 用于绘制旋转矩形                             |
| `B`       | Brush 笔刷     | `B` Bezier       | 含义不同（笔刷 vs 贝塞尔曲线），但首字母一致 |
| `M`       | Marquee 选区   | —                | AMS 无对应                                   |
| `⌘+T`     | Free Transform | —                | AMS 通过 control points 直接拖拽             |
| `⌘Z`      | Undo           | `⌘Z`             | 一致                                         |

## 与 VS Code 对照 / vs VS Code

| VS Code               | AMS 等价             | 备注                           |
| --------------------- | -------------------- | ------------------------------ |
| `⌘P` Quick Open       | —                    | AMS 无对应（用 `⌘K` 命令面板） |
| `⌘⇧P` Command Palette | `⌘K` Command Palette | 不同键，相同概念               |
| `⌘B` Toggle Sidebar   | —                    | AMS 通过 ActivityBar tab 切换  |
| `⌘,` Settings         | `⌘,` Settings        | 一致                           |
| `⌘W` Close Tab        | —                    | AMS dockview 用 × 关闭         |

::: tip 记忆要点
AMS 命令面板用 `⌘K`（cmdk 默认），不同于 VS Code 的 `⌘⇧P`。两者都是 fuzzy 搜索盒。
:::

## 与 QGIS 对照 / vs QGIS

| QGIS                     | AMS 等价                     | 备注                                       |
| ------------------------ | ---------------------------- | ------------------------------------------ |
| Pan tool (Spacebar+drag) | `H`                          | QGIS 用空格切到 pan，AMS 用 H 切回 default |
| `Ctrl+S` Save Project    | `Ctrl+S` Export base_map.bin | 概念类似——把工作产出落盘                   |
| Identify (`I`)           | 单击实体                     | AMS 直接点开 Inspector，不需要专门工具     |
| Snap toggle              | `Toggle Snap` 按钮           | 无键位（在 ToolStrip View 槽）             |

## 修饰键速记 / Modifier Cheat Sheet

| AMS 修饰键 | macOS 实键      | Win/Linux 实键 |
| ---------- | --------------- | -------------- |
| `⌘`        | Command (左/右) | Ctrl           |
| `⇧`        | Shift           | Shift          |
| `⌥`        | Option          | Alt            |
| `⌃`        | Control（罕用） | Ctrl           |

::: warning ⌘ vs Ctrl 同一键码
AMS 内部 KeyBinding 用 `ctrl: true` 同时表示 mac ⌘ 和 PC Ctrl——单一字段，平台自动适配。
:::

## 操作步骤 / Steps

1. 选择你的平台一栏。
2. 找到要做的操作。
3. 按下对应键位。
4. 不需要先点按钮——所有快捷键在地图焦点下就能触发；带 `global` 的甚至在输入框内也能。

## 常见迁移问题 / Migration FAQ

| 来源           | 困惑                        | 答案                                                                   |
| -------------- | --------------------------- | ---------------------------------------------------------------------- |
| Photoshop 用户 | `T` Type 在哪？             | AMS 没有文本工具，用 Inspector 字段                                    |
| VS Code 用户   | `⌘+S` 一直触发导出？        | 是的，因为 AMS 没“工作区”概念，文件保存就是导出                        |
| QGIS 用户      | `Ctrl+Z` 撤销的粒度是什么？ | 单个 entity 操作（`mapStore` 提交一次=一步），细于 QGIS 的整体编辑会话 |
| AutoCAD 用户   | 没有命令行                  | 用命令面板 `⌘K` 替代                                                   |

## 配置存储位置 / Persistence

本身不持久化任何状态。键位映射由 `definitions.ts` 静态注册，重新打包才能生效。

## 相关源码 / Source

- `src/core/actions/registry/helpers.ts` — `isMacPlatform` / `formatShortcut`
- `src/core/actions/registry/definitions.ts` — KeyBinding 字段

## 与 Sketchfab / Blender 对照 / vs Sketchfab & Blender

某些团队从 3D 建模工具切到 AMS 做 HD map 标注：

| Blender         | AMS 等价                    | 备注                     |
| --------------- | --------------------------- | ------------------------ |
| `G` Grab/Move   | 直接拖控制点                | AMS 没专门 “G” move 模式 |
| `R` Rotate      | 选中后拖 rotate handle      | AMS 用控制柄而非键位     |
| `S` Scale       | Shift+drag handle           | 等比                     |
| `Tab` Edit Mode | 双击 entity 进 editingPoint | XState `editingPoint`    |
| `N` Properties  | Inspector 已常驻            | AMS 不需要 toggle        |

## ESC / Enter 在不同状态的含义 / ESC and Enter

`Escape` 与 `Enter` 在 AMS 不是普通快捷键，是 FSM 上下文事件：

| 状态              | ESC                    | Enter                           |
| ----------------- | ---------------------- | ------------------------------- |
| `idle`            | 无                     | 无                              |
| `drawPolyline` 等 | CANCEL（丢弃当前绘制） | CONFIRM（落盘当前 entity）      |
| `selected`        | 取消选中               | 无                              |
| `editingPoint`    | 退出编辑               | 应用当前拖拽                    |
| 任何模态对话框    | 关闭                   | 提交（`ActivationDialog` 不绑） |

## 修饰键组合速记 / Modifier Combos

| 组合                   | 在哪生效      | 行为                       |
| ---------------------- | ------------- | -------------------------- |
| `Shift` + 单击         | LayerTree     | 多选                       |
| `Cmd/Ctrl` + 单击      | LayerTree     | 加/减选                    |
| `Shift` + 拖拽控制柄   | 编辑模式      | 等比缩放                   |
| `Alt` + 拖拽控制柄     | 编辑模式      | 镜像约束                   |
| `Cmd/Ctrl` + 滚轮      | 地图          | 浏览器缩放（dev 可能触发） |
| `Cmd/Ctrl` + 单击 lane | Connect Lanes | 直接 wire 不必两步         |

## 相关文档 / See also

- [Shortcuts](./shortcuts.md) — 完整快捷键参考（推荐）
- [MenuBar & ToolStrip](./menubar-and-toolstrip.md) — 菜单/工具条对应关系
- [Command Palette](./command-palette.md) — `⌘K` 全局搜索
- [Drawing Tools](./drawing-tools.md) — 绘制工具与字母键映射
- [Editing & Snapping](./editing-and-snapping.md) — Shift / Alt 拖拽语义

## 平台键码映射表 / Per-platform Keycode Cheatsheet

| 通用       | macOS Apple键盘 | Windows 键盘 | Chrome OS |
| ---------- | --------------- | ------------ | --------- |
| Cmd / Meta | ⌘ Command       | Win          | Search    |
| Ctrl       | ⌃ Control       | Ctrl         | Ctrl      |
| Alt        | ⌥ Option        | Alt          | Alt       |
| Shift      | ⇧               | Shift        | Shift     |
| Backspace  | ⌫               | Backspace    | Backspace |
| Delete     | ⌦               | Delete       | Delete    |
| Enter      | Return ↵        | Enter        | Enter     |
| Esc        | Esc             | Esc          | Esc       |

## 最小动手习惯 / Muscle-memory drills

如果你刚开始用 AMS，建议先把以下 7 个键位打成手感：

```
⌘K → 命令面板（什么都能查）
⌘S → 保存（导出 bin）
⌘Z / ⇧⌘Z → 撤销 / 重做
⌫ → 删除选中
H → 回 default
C → connect lanes
```

掌握这 7 个，AMS 95% 的日常工作流即可不离手。

## 常见错按 / Common mistakes

| 误按               | 实际效果      | 改正                        |
| ------------------ | ------------- | --------------------------- |
| 想 `⌘P` 找 entity  | 浏览器打印    | 用 SearchPanel 或 LayerTree |
| 想 `⌘W` 关闭 panel | Electron 关窗 | 用 dockview ×               |
| 想 `⌘+` 放大画布   | 浏览器缩放    | 滚轮或 MapLibre 内置        |
| 想 `⌘Y` 重做       | 浏览器历史    | AMS 用 `⇧⌘Z`                |

## 修饰键并发约定 / Concurrent Modifiers

`KeyBinding` 没有“顺序”概念——按下任何主键瞬间，AMS 检查所有当前按下的修饰键状态。这意味着：

| 序列                                  | 是否触发 `⌘S`?                 |
| ------------------------------------- | ------------------------------ |
| `Cmd 按下 → S 按下`                   | ✅                             |
| `S 按下 → Cmd 按下 → 松开`            | ❌（S 按下时 Cmd 还没有）      |
| `Cmd 按下 → Shift 按下 → S 按下`      | ❌（Shift 修饰带使其匹配 ⇧⌘S） |
| `Cmd 按下 → S 按下 → S 抬起 → S 按下` | ✅✅（连按两次都触发）         |

## 长按 / 松开 / Long-press

AMS **没有**长按行为。每个 KeyBinding 在 `keydown` 时触发一次；浏览器 `repeat` 事件被忽略（除了 `editorMachine.SELECT_TOOL` 这种业务态）。

::: tip 防误触
按住快捷键不会重复触发 export 等操作，避免标注员手指卡住时反复触发 IO。
:::

## 测试覆盖 / Test Coverage

| 测试                   | 文件                                                  | 校验               |
| ---------------------- | ----------------------------------------------------- | ------------------ |
| matchesKeybinding 单测 | `src/core/actions/registry/__tests__/helpers.test.ts` | 平台、修饰键、case |
| 集成测试               | `e2e/shortcuts.spec.ts`                               | Playwright 模拟键  |

## Sketch 风格速查表 / Quick Lookup Card

```
┌─────────────────────────────────────────────────┐
│           AMS Quick Lookup                      │
├─────────────────────────────────────────────────┤
│ ⌘K     Command Palette                          │
│ ⌘S     Export .bin                              │
│ ⇧⌘S    Export .txt                              │
│ ⌘Z     Undo                                     │
│ ⇧⌘Z    Redo                                     │
│ ⌫      Delete selection                         │
│ ⌘G     Toggle Grid                              │
│ ⌘,     Settings                                 │
│ H      Default (Pan)                            │
│ C      Connect Lanes                            │
│ P/B/A  Polyline / Bezier / Arc                  │
│ R/G    Rectangle / Polygon                      │
│ Esc    Cancel / Close                           │
│ Enter  Confirm draw                             │
└─────────────────────────────────────────────────┘
```

## 键位选取理由 / Rationale

| 键               | 为什么是它                                   |
| ---------------- | -------------------------------------------- |
| `H` 默认         | Photoshop / GIMP / Figma 都是 Hand           |
| `C` Connect      | "C" for Connect，简单记忆                    |
| `P/B/A/R/G` 绘制 | 与 Photoshop Pen/Brush/Arc/Rect/Polygon 对齐 |
| `⌘K` 命令面板    | cmdk 默认；Linear / Slack / Notion 共识      |
| `⌘,` 设置        | macOS Preferences 标准                       |

## A11y / 可访问性补充

| 项                   | 行为                                       |
| -------------------- | ------------------------------------------ |
| 屏幕阅读器朗读快捷键 | aria-label 或 `kbd` 标签                   |
| 高对比模式           | Tailwind 自动跟随 `prefers-contrast: more` |
| 仅键盘操作           | 所有 ActionDef 都可只用键盘触发            |
| Focus ring           | 默认 Tailwind `focus-visible`              |

## 桌面端额外快捷键 / Desktop-only

Electron 41 在 macOS 注册了系统标准菜单：

| 菜单                      | 快捷键 | 行为              |
| ------------------------- | ------ | ----------------- |
| Apollo Map Studio → About | —      | 打开 About 对话框 |
| Apollo Map Studio → Hide  | `⌘H`   | 系统隐藏          |
| Apollo Map Studio → Quit  | `⌘Q`   | 退出              |
| Window → Minimize         | `⌘M`   | 系统最小化        |
| Window → Close            | `⌘W`   | 关窗              |

::: tip 桌面 vs Web 差别
Web 端没有这些“系统级”菜单。如有标注员混合桌面+Web 工作，可能习惯 `⌘W` 关窗口而误触；切换平台时注意。
:::

## 习惯迁移练习 / Migration Drills

### 来自 Photoshop

```
1. 启动 AMS。
2. 按 H —— 应该看到鼠标变成 hand 图标，状态栏 Mode 切回 idle。
3. 按 P —— 选中 Lane 之后再按 P，应进入 Polyline 绘制模式。
4. 按 ⌘Z —— 撤销最近一次操作。
5. 按 ⌘S —— 弹出文件保存。
```

### 来自 VS Code

```
1. 按 ⌘K —— 命令面板出现（不同于 VS Code 的 ⌘⇧P，但功能等价）。
2. 输入 "settings"，回车 —— 应打开 Settings 模态。
3. ESC 关闭。
```

### 来自 QGIS

```
1. 按 H 切到 default mode。
2. 拖拽地图 —— 平移视图。
3. 滚轮 —— 缩放。
4. ⌘S —— 等价于 QGIS 的 Save Project，但实际是 Export Apollo Map。
```
