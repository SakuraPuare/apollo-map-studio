---
title: 色彩调色板
description: src/index.css @theme 块中所有 ams-* 色彩 token 的语义、十六进制值与暗色变体。
---

# 色彩调色板

本页对 `src/index.css` 中 `@theme` 块定义的全部 `ams-*` 色彩 token 进行
语义、值、用法的逐条说明。Tailwind 4 通过 `@theme` 把这些 CSS 变量自动
转化为 `bg-ams-*`、`text-ams-*`、`border-ams-*`、`ring-ams-*` 等工具类。

::: tip 色彩 token 的设计原则

- **语义命名**：`bg-base / surface-hover / text-secondary / accent`，不直接暴露 hue。
- **暗色优先**：编辑器默认深色主题，亮色主题暂不在 1.0 范围内。
- **可分层**：`bg-base` < `bg-elevated` < `surface-hover` < `surface-active`，与 Photoshop 风格的 panel 层级匹配。
  :::

## 来源

```css
/* src/index.css:37-52 */
@theme {
  --color-ams-bg-base: #09090b;
  --color-ams-bg-elevated: #18181b;
  --color-ams-surface-hover: rgb(255 255 255 / 0.05);
  --color-ams-surface-active: rgb(255 255 255 / 0.1);

  --color-ams-border-subtle: rgb(255 255 255 / 0.07);
  --color-ams-border-strong: rgb(255 255 255 / 0.1);

  --color-ams-text-primary: #e4e4e7;
  --color-ams-text-secondary: #a1a1aa;
  --color-ams-text-muted: #71717a;
  --color-ams-text-disabled: #52525b;

  --color-ams-accent: #22d3ee;
}
```

## 调色板可视化（语义 → 颜色）

```text
┌─────────────────────────────────────────────┐
│ ams-bg-base    █████████   #09090b          │ ← App 底色
├─────────────────────────────────────────────┤
│ ams-bg-elevated █████████   #18181b         │ ← Panel 背景
├─────────────────────────────────────────────┤
│ ams-surface-hover  ░░░░░░  white 5%         │ ← Hover
├─────────────────────────────────────────────┤
│ ams-surface-active ▒▒▒▒▒▒  white 10%        │ ← Selected
├─────────────────────────────────────────────┤
│ ams-text-primary    AaBbCc  #e4e4e7         │ ← 主文字
│ ams-text-secondary  AaBbCc  #a1a1aa         │ ← 次文字 / label
│ ams-text-muted      AaBbCc  #71717a         │ ← caption
│ ams-text-disabled   AaBbCc  #52525b         │ ← disabled
├─────────────────────────────────────────────┤
│ ams-accent          ★★★★★   #22d3ee          │ ← 状态高亮
└─────────────────────────────────────────────┘
```

## Surfaces（背景层级）

| Token                        | 值                       | Tailwind 工具类         | 语义                | 典型用法                  |
| ---------------------------- | ------------------------ | ----------------------- | ------------------- | ------------------------- |
| `--color-ams-bg-base`        | `#09090b`（zinc-950）    | `bg-ams-bg-base`        | App 整体底色        | `<body>` 与 menubar 背景  |
| `--color-ams-bg-elevated`    | `#18181b`（zinc-900）    | `bg-ams-bg-elevated`    | 抬升的 panel / card | Inspector、LayerTree 背景 |
| `--color-ams-surface-hover`  | `rgba(255,255,255,0.05)` | `bg-ams-surface-hover`  | 非破坏性 hover      | 工具按钮 hover            |
| `--color-ams-surface-active` | `rgba(255,255,255,0.10)` | `bg-ams-surface-active` | 选中 / 当前         | 当前选中工具的背景        |

::: tip 层级规则
从 z 轴向用户方向：`bg-base` → `bg-elevated` → `surface-hover` → `surface-active`。
不要把同一个 token 用在两个层级上，否则视觉会扁平。
:::

## Borders（分割线）

| Token                       | 值                       | Tailwind 工具类            | 语义                          |
| --------------------------- | ------------------------ | -------------------------- | ----------------------------- |
| `--color-ams-border-subtle` | `rgba(255,255,255,0.07)` | `border-ams-border-subtle` | 默认分割线                    |
| `--color-ams-border-strong` | `rgba(255,255,255,0.10)` | `border-ams-border-strong` | 强调分割线（如 active panel） |

## Text（文本层级）

| Token                        | 值                    | Tailwind 工具类           | 语义           | 应用层级                |
| ---------------------------- | --------------------- | ------------------------- | -------------- | ----------------------- |
| `--color-ams-text-primary`   | `#e4e4e7`（zinc-200） | `text-ams-text-primary`   | 主文本         | inspector value、菜单项 |
| `--color-ams-text-secondary` | `#a1a1aa`（zinc-400） | `text-ams-text-secondary` | 次要 / label   | inspector label、字段名 |
| `--color-ams-text-muted`     | `#71717a`（zinc-500） | `text-ams-text-muted`     | 辅助 / caption | 帮助提示、单位后缀      |
| `--color-ams-text-disabled`  | `#52525b`（zinc-600） | `text-ams-text-disabled`  | 禁用           | disabled 按钮、禁用工具 |

## Accent（高亮）

| Token                | 值                    | Tailwind 工具类                                         | 语义     |
| -------------------- | --------------------- | ------------------------------------------------------- | -------- |
| `--color-ams-accent` | `#22d3ee`（cyan-400） | `text-ams-accent` / `bg-ams-accent` / `ring-ams-accent` | 主高亮色 |

主要应用：

- 当前激活工具的边框 / 文本
- FSM 处于 drawing 状态时的状态条提示
- 进度条 indeterminate 动效（`@keyframes ams-indeterminate`）

## Dockview Theme 变量

`src/index.css:63-81` 定制了 Dockview 5 的暗色主题，与 ams 色板对齐：

| Dockview 变量                                          | 取值                     | 对应 ams 关系      |
| ------------------------------------------------------ | ------------------------ | ------------------ |
| `--dv-paneview-header-border-color`                    | `rgba(255,255,255,0.07)` | = `border-subtle`  |
| `--dv-tabs-and-actions-container-background-color`     | `#0a0a0a`                | 略亮于 `bg-base`   |
| `--dv-activegroup-visiblepanel-tab-background-color`   | `#171717`                | ≈ `bg-elevated`    |
| `--dv-activegroup-hiddenpanel-tab-background-color`    | `#0a0a0a`                | ≈ `bg-base`        |
| `--dv-inactivegroup-visiblepanel-tab-background-color` | `#0f0f0f`                | 介于 base/elevated |
| `--dv-inactivegroup-hiddenpanel-tab-background-color`  | `#0a0a0a`                | ≈ `bg-base`        |
| `--dv-tab-divider-color`                               | `rgba(255,255,255,0.07)` | = `border-subtle`  |
| `--dv-activegroup-visiblepanel-tab-color`              | `#e4e4e7`                | = `text-primary`   |
| `--dv-activegroup-hiddenpanel-tab-color`               | `#71717a`                | = `text-muted`     |
| `--dv-inactivegroup-visiblepanel-tab-color`            | `#a1a1aa`                | = `text-secondary` |
| `--dv-inactivegroup-hiddenpanel-tab-color`             | `#52525b`                | = `text-disabled`  |
| `--dv-separator-border`                                | `rgba(255,255,255,0.07)` | = `border-subtle`  |
| `--dv-paneview-active-outline-color`                   | `#22d3ee40`              | accent 25% 透明    |
| `--dv-drag-over-background-color`                      | `rgba(34,211,238,0.10)`  | accent 10% 透明    |
| `--dv-drag-over-border-color`                          | `rgba(34,211,238,0.30)`  | accent 30% 透明    |
| `--dv-background-color`                                | `#09090b`                | = `bg-base`        |
| `--dv-group-view-background-color`                     | `#0a0a0a`                | 略亮于 `bg-base`   |

## Active Tab 指示

```css
/* src/index.css:90-98 */
.dockview-theme-dark .tab.active-tab::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: #22d3ee; /* accent */
}
```

## Sash Hover 高亮

```css
/* src/index.css:101-108 */
.dockview-theme-dark .sash:hover,
.dockview-theme-dark .sash.active {
  background: rgba(34, 211, 238, 0.3); /* accent 30% */
}
```

## 用法示例

```tsx
<div className="bg-ams-bg-base text-ams-text-primary border-ams-border-subtle">
  <div className="bg-ams-bg-elevated p-4 rounded-md">
    <div className="text-ams-text-secondary text-xs uppercase">Lane</div>
    <div className="text-ams-text-primary text-sm font-mono">CITY_DRIVING</div>
    <span className="text-ams-accent">drawing…</span>
  </div>
</div>
```

::: tip 添加新 token

1. 在 `src/index.css` 的 `@theme` 中添加 `--color-ams-<semantic>: <value>;`
2. 优先用语义命名（`surface-warning`），不要直接命名 hue（`yellow`）
3. 同步本页表格与 [Design Tokens](/reference/design-tokens)
4. 跨章节引用相同 token 的地方，集中改本页一处
   :::

## 暗色 / 亮色变体规划

::: warning 1.0 仅暗色
当前调色板只包含暗色主题。亮色主题在路线图中，迁移时所有 `ams-*` token 会
通过 `[data-theme="light"]` 选择器覆盖；调用层无需改动。
:::

## 不属于 ams 的色彩

以下色彩不通过 `ams-*` token 体系，由地图渲染管线直接管理，避免与 UI chrome 混用：

- Lane 边界 stroke 颜色（`SOLID_YELLOW`、`DOTTED_WHITE` 等）由 maplibre layer paint
  expression 决定，详见 [冷热分层](/architecture/cold-hot-layers)。
- Junction 多边形填充由 `ParkingSpace`、`Junction` 等元素的 styling 模块决定。
- Hover / select 视觉由 hot layer 自己持有的 paint 配置决定。

## 可访问性（Accessibility）

| 检查项                                             | 状态                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `text-ams-text-primary` on `bg-ams-bg-base` 对比度 | ≈ 14.5:1（远超 WCAG AAA）                           |
| `text-ams-text-secondary` on `bg-ams-bg-elevated`  | ≈ 7.2:1（AAA）                                      |
| `text-ams-text-muted` on `bg-ams-bg-base`          | ≈ 4.8:1（AA Large）                                 |
| `text-ams-text-disabled` on `bg-ams-bg-base`       | ≈ 3.5:1（仅作为 disabled 视觉提示，不承载关键信息） |
| `text-ams-accent` on `bg-ams-bg-base`              | ≈ 8.5:1（AAA）                                      |

::: warning 不要把 disabled 当 muted
`text-ams-text-disabled` 的对比度刚刚高过 WCAG 3:1 边线，**只**用于禁用态的
视觉降权。承载语义的次要信息使用 `text-ams-text-muted` 或 `text-ams-text-secondary`。
:::

## 颜色语义快速判断表

| 想表达的含义           | 应该用                     |
| ---------------------- | -------------------------- |
| 整页背景               | `bg-ams-bg-base`           |
| 一个独立 panel / card  | `bg-ams-bg-elevated`       |
| 鼠标悬停（不修改语义） | `bg-ams-surface-hover`     |
| 当前选中的元素         | `bg-ams-surface-active`    |
| 默认分割线             | `border-ams-border-subtle` |
| 强调分割线             | `border-ams-border-strong` |
| 主要文字               | `text-ams-text-primary`    |
| 字段名、label          | `text-ams-text-secondary`  |
| 提示语、单位           | `text-ams-text-muted`      |
| 禁用态文字             | `text-ams-text-disabled`   |
| 当前状态 / 正在执行    | `text-ams-accent`          |

## 与 maplibre 渲染颜色的协调

虽然 maplibre 自管 paint expressions，但仍建议在视觉上向 ams 调色板靠拢：

| 元素                    | 推荐 stroke / fill        | 理由                                 |
| ----------------------- | ------------------------- | ------------------------------------ |
| Lane 中心线（idle）     | `#a1a1aa`                 | 与 `text-secondary` 同源             |
| Lane 中心线（selected） | `#22d3ee`                 | accent，强烈区分                     |
| Lane 边界 SOLID_WHITE   | `#e4e4e7`                 | text-primary，避免纯白刺眼           |
| Lane 边界 DOTTED_YELLOW | 自定义 yellow（不走 ams） | 协议语义需要醒目黄                   |
| Junction 多边形 fill    | `rgba(34,211,238,0.10)`   | accent 10%                           |
| Hover 高亮              | `rgba(34,211,238,0.30)`   | accent 30%，与 Dockview drag-over 同 |

::: tip 颜色选择记忆口诀

- chrome / panel → ams 语义 token（始终）
- 数据语义 → maplibre paint（保持协议正确性）
- 交互态 → ams accent 系列（保持视觉一致）
  :::

## 反例与陷阱

::: warning 别这样做

- 不要直接 `text-zinc-400`，丢失 i18n / theme swap 能力。
- 不要把 `bg-ams-bg-base` 用在 panel 上——视觉会塌陷成无层次。
- 不要用 `bg-ams-accent` 作为大块背景——会喧宾夺主。
- 不要用 RGBA 直接写在组件里（例如内联 `background: rgba(34,211,238,0.5)`）——
  这条路径绕过 token 体系，theme 切换时不会跟随。
  :::

## 相关文档

- [Design Tokens](/reference/design-tokens) — 字体 / 间距 / 圆角 / 阴影
- [设计令牌（架构视角）](/architecture/design-tokens)
- [工作台布局](/architecture/workspace-layout)
- [Glossary：shadcn/ui](/reference/glossary#shadcn-ui)
- [Glossary：Dockview](/reference/glossary#dockview)
