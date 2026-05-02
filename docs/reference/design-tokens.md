---
title: 设计令牌
description: Apollo Map Studio 设计令牌的总参考——字体、间距、圆角、阴影、动效，并交叉链接色彩调色板。
---

# 设计令牌

本页是 Apollo Map Studio 设计语言的「token 总目录」。色彩 token 已经在
[Color Palette](/reference/color-palette) 单独成章，本页聚焦 **typography /
spacing / radius / shadow / motion** 五大类。

::: tip 单一来源

- **色彩**：`src/index.css` 的 `@theme` 块。
- **typography 与 spacing**：Tailwind 4 默认 token 加项目级覆盖。
- **shadcn/ui**：组件级 token 跟随上游库语义，由项目自定义覆盖。
  :::

## 字体（Typography）

### 字体家族

| 角色              | 字体                 | 用途                          | 备注                                     |
| ----------------- | -------------------- | ----------------------------- | ---------------------------------------- |
| Display / Heading | **Syne**             | App 标题、大字号品牌区        | 现代几何衬线，呼应「精密制图实验室」气质 |
| Body / UI Sans    | system-ui sans stack | 默认正文、表单、按钮          | Tailwind 4 默认 sans 栈                  |
| Mono / Numeric    | **JetBrains Mono**   | inspector 数值、坐标、ID、log | 等宽 + 高辨识度 0/O                      |

```css
/* 实际加载策略：通过 docs/.vitepress 与 src/index.css 中的 @import / fontsource 引入 */
font-family-display: 'Syne', sans-serif;
font-family-mono: 'JetBrains Mono', monospace;
```

### 字阶

| 类名        | 实际尺寸         | 用途                      |
| ----------- | ---------------- | ------------------------- |
| `text-xs`   | 12 px / 16 px lh | 状态条、单位后缀、caption |
| `text-sm`   | 14 px / 20 px lh | 默认 UI 文本、菜单项      |
| `text-base` | 16 px / 24 px lh | 文档段落                  |
| `text-lg`   | 18 px / 28 px lh | section 小标题            |
| `text-xl`   | 20 px / 28 px lh | dialog 标题               |
| `text-2xl`  | 24 px / 32 px lh | panel 大标题              |

### 字重

| 类名            | font-weight | 推荐用途                   |
| --------------- | ----------- | -------------------------- |
| `font-normal`   | 400         | 默认正文                   |
| `font-medium`   | 500         | 强调字段名、菜单项         |
| `font-semibold` | 600         | 标题、当前激活的工具 label |
| `font-bold`     | 700         | 极少使用，仅大屏标题       |

### 文本颜色

直接复用 [Color Palette](/reference/color-palette) 的 `text-ams-*` 工具类。

```tsx
<h2 className="font-display text-2xl text-ams-text-primary">Inspector</h2>
<span className="text-ams-text-secondary text-xs uppercase">Field</span>
<span className="font-mono text-ams-text-primary">120.521 m</span>
```

## 间距（Spacing）

Apollo Map Studio 使用 Tailwind 4 的默认 spacing scale（4px 基线），
适合工程化精确布局。

| 类名        | 数值  | 用例               |
| ----------- | ----- | ------------------ |
| `p-0`       | 0     | flush layout       |
| `p-1`       | 4 px  | icon 与 label 紧邻 |
| `p-2`       | 8 px  | 紧凑工具按钮       |
| `p-3`       | 12 px | 列表 item          |
| `p-4`       | 16 px | 默认 panel 内边距  |
| `p-6`       | 24 px | dialog 主区域      |
| `p-8`       | 32 px | 引导页面留白       |
| `space-y-1` | 4 px  | 工具组纵向间距     |
| `space-y-2` | 8 px  | 表单字段间距       |
| `space-y-4` | 16 px | section 之间       |

::: tip 项目级约定

- panel 内边距统一 `p-4`，避免参差。
- 表单 label 与 field 之间使用 `space-y-1` 或 `gap-1`。
- 列表项之间用 `divide-y divide-ams-border-subtle`，不要用 `space-y-*` 模拟。
  :::

## 圆角（Radius）

| 类名           | 数值    | 用例             |
| -------------- | ------- | ---------------- |
| `rounded-none` | 0       | 状态条等贴边元素 |
| `rounded-sm`   | 2 px    | tag、stub        |
| `rounded`      | 4 px    | 默认按钮、输入框 |
| `rounded-md`   | 6 px    | shadcn 默认      |
| `rounded-lg`   | 8 px    | dialog、cards    |
| `rounded-xl`   | 12 px   | hero / promo 卡  |
| `rounded-full` | 9999 px | avatar、状态点   |

::: tip shadcn 适配
shadcn/ui 默认的 `--radius: 0.5rem`（≈ 8 px）已通过 `tailwind.config` /
`@theme` 对齐为 `rounded-lg`，在 Apollo Map Studio 使用时无需额外覆盖。
:::

## 阴影（Shadow）

精密制图风格强调「无重阴影」，仅在关键浮层使用。

| 类名          | 强度                                | 用例                     |
| ------------- | ----------------------------------- | ------------------------ |
| `shadow-none` | 无                                  | panel、inspector（默认） |
| `shadow-sm`   | `0 1px 2px 0 rgba(0,0,0,0.20)`      | popover 外缘             |
| `shadow`      | `0 1px 3px 0 rgba(0,0,0,0.30)`      | dropdown                 |
| `shadow-md`   | `0 4px 6px -1px rgba(0,0,0,0.30)`   | dialog                   |
| `shadow-lg`   | `0 10px 15px -3px rgba(0,0,0,0.40)` | command palette          |
| `shadow-xl`   | 较强                                | 不推荐使用               |

::: warning 暗色阴影问题
深色主题下白光阴影几乎不可见，若需要「光晕」效果，使用
`ring-ams-accent` 或 `outline-ams-accent`。
:::

## 边框（Border）

| 类名                                                    | 用例         |
| ------------------------------------------------------- | ------------ |
| `border`                                                | 默认 1px     |
| `border-2`                                              | 强调 outline |
| `border-ams-border-subtle`                              | 默认分割线   |
| `border-ams-border-strong`                              | 强调分割线   |
| `ring-1 ring-ams-accent`                                | 选中态高亮   |
| `outline outline-2 outline-offset-2 outline-ams-accent` | 键盘 focus   |

## 动效（Motion）

仅在 `src/index.css` 中显式声明的 keyframe：

```css
/* src/index.css:110-117 */
@keyframes ams-indeterminate {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(330%);
  }
}
```

| 类名                        | duration            | 用例                           |
| --------------------------- | ------------------- | ------------------------------ |
| `transition-colors`         | 150 ms              | hover、active 切换             |
| `transition-transform`      | 200 ms              | dropdown 展开                  |
| `animate-ams-indeterminate` | 1.5 s（线性，无限） | TaskProgressOverlay 不定进度   |
| `motion-reduce:*`           | —                   | 尊重 OS prefers-reduced-motion |

::: tip 动效原则

- 默认 `transition-colors` 即可覆盖 90% 场景。
- 不使用弹跳 / 大幅缓动；与 CAD 风格不符。
- 任何 ≥ 300ms 的动效都需要在 PR 中说明理由。
  :::

## Z-index 层级

| 类名     | 数值 | 用例                         |
| -------- | ---- | ---------------------------- |
| `z-0`    | 0    | maplibre 画布、cold/hot 图层 |
| `z-10`   | 10   | tool strip 浮层              |
| `z-20`   | 20   | activity bar                 |
| `z-30`   | 30   | menubar、status bar          |
| `z-40`   | 40   | dropdown、popover            |
| `z-50`   | 50   | dialog、command palette      |
| `z-[60]` | 60   | toast、TaskProgressOverlay   |

## Focus / hover / active 互动 token

| 状态             | 推荐方式                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Hover            | `hover:bg-ams-surface-hover`                                                                                    |
| Active / pressed | `active:bg-ams-surface-active`                                                                                  |
| Selected         | `data-[state=selected]:bg-ams-surface-active`                                                                   |
| Focus            | `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ams-accent` |
| Disabled         | `disabled:text-ams-text-disabled disabled:cursor-not-allowed`                                                   |

## 字体加载与回退

::: warning 字体回退
若 Syne / JetBrains Mono 加载失败，回退栈如下：

- Syne → `system-ui sans-serif`
- JetBrains Mono → `'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace`

桌面 Electron 形态会内置字体，Web 形态依赖在线字体或自托管。
:::

## 与 shadcn/ui 的对接

shadcn/ui 通过 `@theme` 与 CSS 变量与项目对齐。常见关系：

| shadcn 变量          | 项目映射                         |
| -------------------- | -------------------------------- |
| `--background`       | `--color-ams-bg-base`            |
| `--foreground`       | `--color-ams-text-primary`       |
| `--muted`            | `--color-ams-bg-elevated`        |
| `--muted-foreground` | `--color-ams-text-secondary`     |
| `--border`           | `--color-ams-border-subtle`      |
| `--ring`             | `--color-ams-accent`             |
| `--primary`          | `--color-ams-accent`（cyan-400） |
| `--radius`           | `0.5rem`（≈ rounded-lg）         |

::: tip 新组件的 token 路径

1. 优先用 ams 语义 token；
2. 找不到合适的 ams token 时，用 shadcn `--*` 变量；
3. 仍找不到，回退 Tailwind 原生工具类（如 `text-zinc-400`）；
4. 同时把这一缺口提一个文档 issue，便于后续补 token。
   :::

## Tailwind 4 `@theme` 注入机制速查

```css
@theme {
  --font-display: 'Syne', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --color-ams-bg-base: #09090b;
  /* ... */
}
```

Tailwind 4 在编译期把 `@theme` 中的变量翻译为：

- **CSS 变量**：可在任何 inline style / `var(--font-display)` 中使用。
- **工具类**：`font-display`、`font-mono`、`bg-ams-bg-base`、`text-ams-accent` 等。

::: tip 项目使用建议

- 优先用工具类（一致性最强）。
- 需要在动效 / inline style 时再使用 CSS 变量。
- 不要混用 `@apply` 与 inline style，否则 specificity 难追踪。
  :::

## 字体加载策略

| 场景             | 策略                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Web build (Vite) | 通过 `@fontsource/syne` 与 `@fontsource/jetbrains-mono` 在 `src/index.css` 顶部 import 子集（latin、latin-ext） |
| Electron         | 与 Web 相同，本地化打包到 dist 中，无需在线请求                                                                 |
| 文档 (VitePress) | VitePress 自身样式独立，不依赖 ams token；文档可视情况引入                                                      |

## 字体子集与 fallback 性能

::: warning 仅 Latin
当前仅打包 `latin` + `latin-ext` 子集。中日韩字符回退到系统字体。这是为了
压缩首屏字体体积；如未来需要 CJK 显示，请引入对应 subset 的 CDN 或自托管。
:::

## 与 Apollo 数据展示的关系

| 数据类型                     | 推荐字体    | 推荐 token                |
| ---------------------------- | ----------- | ------------------------- |
| Lane ID                      | `font-mono` | `text-ams-text-primary`   |
| Lane 类型 / Turn / Direction | sans        | `text-ams-text-primary`   |
| 字段 label                   | sans        | `text-ams-text-secondary` |
| 单位 (m, m/s)                | sans        | `text-ams-text-muted`     |
| 经纬度数值                   | `font-mono` | `text-ams-text-primary`   |
| 状态条「Drawing…」           | sans        | `text-ams-accent`         |

## 相关文档

- [Color Palette](/reference/color-palette) — 色彩 token
- [设计令牌（架构视角）](/architecture/design-tokens) — Tailwind 4 `@theme` 注入机制
- [工作台布局](/architecture/workspace-layout)
- [Activity Bar 与面板](/guide/activity-bar-and-panels)
- [Glossary：shadcn/ui](/reference/glossary#shadcn-ui)
- [Glossary：Dockview](/reference/glossary#dockview)
