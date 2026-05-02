---
title: 设计令牌 (Design Tokens)
description: ams-* token 目录、命名策略、迁移路径、Tailwind 4 @theme 集成；与 reference/color-palette 的交叉引用
---

# 设计令牌 (Design Tokens)

> 主题哲学："Precision Cartography Lab"。
> 关键文件：`src/index.css`（@theme 定义）+ Tailwind 4 自动化原子类。

## 1. 设计哲学：精密制图实验室

- **主色调**：深灰（zinc-950 → zinc-900）打底，避免发光屏在暗光环境下的
  视觉疲劳。
- **强调色**：`#22d3ee`（cyan-400）—— 模拟测量仪表的青色辉光，仅用于
  drawing / active / focus 这类"在动"的状态。
- **字体**：`Syne`（标题）+ `JetBrains Mono`（数据 / 坐标）。
- **零彩色装饰**：除了 cyan accent，UI 中不出现暖色或饱和色 ——
  让用户的注意力始终在地图本身。

## 2. Tailwind 4 `@theme` 集成

`src/index.css:37-52` 是 token 定义的唯一入口：

```css
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

Tailwind 4 自动从 `@theme` 派生原子类：

| Token                      | 生成类（部分）                                        |
| -------------------------- | ----------------------------------------------------- |
| `--color-ams-bg-base`      | `bg-ams-bg-base`, `text-ams-bg-base`, ...             |
| `--color-ams-text-primary` | `text-ams-text-primary`, `border-ams-text-primary`    |
| `--color-ams-accent`       | `bg-ams-accent`, `ring-ams-accent`, `text-ams-accent` |

无需 plugin 也无需 `tailwind.config`，纯 CSS 变量驱动。

## 3. Token 目录

### 3.1 背景层（4 个）

| Token                        | 值                        | 用途                      |
| ---------------------------- | ------------------------- | ------------------------- |
| `--color-ams-bg-base`        | `#09090b` (zinc-950)      | App 整体底色 / 工作区背景 |
| `--color-ams-bg-elevated`    | `#18181b` (zinc-900)      | Panel / Card / Modal      |
| `--color-ams-surface-hover`  | `rgb(255 255 255 / 0.05)` | 非破坏性 hover            |
| `--color-ams-surface-active` | `rgb(255 255 255 / 0.1)`  | 选中 / active 列表项      |

### 3.2 边框层（2 个）

| Token                       | 值                        | 用途                       |
| --------------------------- | ------------------------- | -------------------------- |
| `--color-ams-border-subtle` | `rgb(255 255 255 / 0.07)` | 默认分隔线                 |
| `--color-ams-border-strong` | `rgb(255 255 255 / 0.1)`  | 强调分割（panel boundary） |

### 3.3 文字四档（4 个）

| Token                        | 值        | 语义                      |
| ---------------------------- | --------- | ------------------------- |
| `--color-ams-text-primary`   | `#e4e4e7` | 正文 / 数据值             |
| `--color-ams-text-secondary` | `#a1a1aa` | 字段标签 / 辅助说明       |
| `--color-ams-text-muted`     | `#71717a` | caption / 时间戳          |
| `--color-ams-text-disabled`  | `#52525b` | 不活动图标 / 禁用按钮文字 |

### 3.4 强调色（1 个）

| Token                | 值        | 用途                                 |
| -------------------- | --------- | ------------------------------------ |
| `--color-ams-accent` | `#22d3ee` | 焦点 / 活动指示 / drawing high light |

## 4. Dockview 主题对接

`src/index.css:63-81` 把 ams token 映射到 dockview 私有变量：

```css
.dockview-theme-dark {
  --dv-paneview-header-border-color: rgba(255, 255, 255, 0.07);
  --dv-tabs-and-actions-container-background-color: #0a0a0a;
  --dv-activegroup-visiblepanel-tab-background-color: #171717;
  --dv-paneview-active-outline-color: #22d3ee40;
  --dv-drag-over-background-color: rgba(34, 211, 238, 0.1);
  --dv-drag-over-border-color: rgba(34, 211, 238, 0.3);
  --dv-background-color: #09090b;
  ...
}
```

dockview 自带的 token 命名空间是 `--dv-*`，与 `--color-ams-*` 解耦。
任何主题切换需要双向同步两套变量。

## 5. 命名策略

**语义优先**而非"色阶/色相"：

| ✓ 语义           | ✗ 色相        |
| ---------------- | ------------- |
| `surface-hover`  | `zinc-800`    |
| `text-secondary` | `gray-400`    |
| `accent`         | `cyan-400`    |
| `border-subtle`  | `white/[.07]` |

理由：未来 swap 调色板（例如换成 oklch）时 component 代码完全不动 ——
只改 `@theme` 的值。

## 6. 添加新 Token 的 SOP

1. 在 `src/index.css` 的 `@theme` 块内 append `--color-ams-{semantic}: <value>;`。
2. 同步更新文件顶部的 catalogue 注释（搜 `Token catalogue`），新增 1 行。
3. 命名遵守"语义优先"，避免色相名。
4. 在引入它的第一个组件 PR 里把 raw Tailwind 类（`bg-zinc-900` 等）
   替换为新 token。

## 7. Token 迁移（migration policy）

来自 ARCHITECTURE.md：

- 新组件 **应** 一上来就用 `ams-*`。
- 现有组件**机会主义迁移**：在因别的原因被改动时顺手换。
- `StatusBar` / `ActivityBar` 是参考迁移；模式可参考。
- 避免一次 grep-and-replace 替换数百文件 —— 视觉 review 会失控；
  按组件家族（一个文件夹）逐家迁移。

## 8. 用法示例

### 8.1 基本面板

```tsx
<aside className="bg-ams-bg-elevated border-r border-ams-border-subtle text-ams-text-primary">
  <header className="text-ams-text-secondary text-[11px] uppercase tracking-wide">Inspector</header>
  <div className="text-ams-text-muted">{entity.id}</div>
</aside>
```

### 8.2 焦点 / 活动指示

```tsx
<button
  className="text-ams-text-secondary hover:text-ams-text-primary
                   focus:ring-1 focus:ring-ams-accent
                   active:text-ams-accent"
>
  Confirm
</button>
```

### 8.3 disabled

```tsx
<svg className="text-ams-text-disabled" />
```

## 9. 与 Tailwind 通用色阶的关系

token 不替代所有 zinc / cyan：

- 极少数地图叠加色（lane fill / signal subsignal red-yellow-green）
  仍走 raw 色 —— 这些是**业务语义色**而非"主题颜色"。
- map style 里 maplibre 的 paint 属性接受字符串，不走 ams token；
  在那里使用 hex 直写并保留注释来源。

## 10. 不在 PoC 内的 token（未来工作）

- **typography token**：`font-heading`, `font-mono`，目前直接用 Tailwind 默认。
- **elevation / shadow token**：未引入；使用 inset border 模拟。
- **motion token**：唯一动效 `@keyframes ams-indeterminate` 直接定义在
  `index.css:110-117`。
- **oklch palette swap**：色彩空间升级是 P3 backlog。

新需求出现前不要预先引入，避免空 token。

## 11. 一致性检查

PR review 关注：

1. 新写的组件没有 raw `bg-zinc-*` / `text-zinc-*` —— 有就要换 token。
2. token 名遵守语义而非色相。
3. 每加一个 token 都更新 catalogue 注释。
4. dockview 颜色随 ams 同步更新。
5. accent 不滥用：只用在"active / drawing / focus"语境。

## 12. 无障碍

- AA 对比度（4.5:1）：`text-primary on bg-base` ≈ 16:1 ✓；
  `text-disabled on bg-base` ≈ 4.6:1 ✓（critical 信息别用 disabled）。
- accent #22d3ee on bg-base 对比度 ≈ 8.4:1 ✓。
- 所有 focus 状态必须叠加 ring + accent，不能仅靠颜色变化。

## 13. 性能

- CSS 变量 = 零运行时；变量解析在浏览器原生层面完成。
- Tailwind 4 的 token 派生在编译期；最终 CSS 体积只增 ~2KB。
- 切主题的成本 = 改 `@theme` 几行 + 重新 build；运行时切换需要把 token
  挂到 `<html data-theme="...">` 选择器（未实现）。

## 14. 陷阱

1. **不要在组件里硬编码 `#22d3ee`** —— 必须走 `text-ams-accent`。
2. **不要用 `gray-*`** —— 与 ams 命名分离的旧分支会污染 grep。
3. **alpha 写在 token 内**而非组件层（`/0.05` 已经在 token），
   组件层用 `bg-ams-surface-hover` 即可，无需再 `bg-ams-bg-base/5`。
4. **dockview 主题与 ams 不一致**会有几像素不同色 —— 任何 token 改动
   要看 ams + dockview 两处。
5. **颜色直写在 maplibre paint** 不是错，但要写注释解释来源。

## 15. 测试

token 没有专门的单元测试；视觉一致性靠 Storybook（计划中）+ PR review。
未来若引入视觉回归，建议从 `LicenseBanner` / `MapMetadataForm` 这类
高对比度 panel 起步。

## 16. Public API（事实清单）

| 公开 token                | 用途总结                 |
| ------------------------- | ------------------------ |
| bg-ams-bg-base            | App 工作区底色           |
| bg-ams-bg-elevated        | 浮起面板                 |
| bg-ams-surface-hover      | hover                    |
| bg-ams-surface-active     | 选中                     |
| border-ams-border-subtle  | 默认边框                 |
| border-ams-border-strong  | 强分隔                   |
| text-ams-text-primary     | 主文字                   |
| text-ams-text-secondary   | 标签                     |
| text-ams-text-muted       | caption                  |
| text-ams-text-disabled    | 禁用                     |
| (bg/ring/text)-ams-accent | active / focus / drawing |

## 17. 源码地图

```
src/index.css                ← @theme 定义 + dockview 桥
src/components/ui/           ← shadcn-style primitives 使用 ams-*
src/components/layout/       ← StatusBar / ActivityBar 参考迁移
docs/reference/color-palette ← 视觉参考（截图）
```

## 18. 与 shadcn / radix 的关系

虽然项目用了 `shadcn` 与 `@radix-ui/*` 几个 primitive（dialog, dropdown,
context-menu, tooltip），但 **我们不引入 shadcn 默认主题变量**
（`--background`, `--foreground`, `--primary` 等）。原因：

1. shadcn token 是 marketing-friendly 默认；我们要的是 cartography
   工具感。
2. token 命名抽象度不同 —— shadcn 是"产品 UI"，ams 是"测量工具"。
3. 双系统并存会让组件作者困惑该用哪个。

实际接入：在 `src/components/ui/` 内复制 shadcn 模板时，把
`bg-background` / `text-foreground` 等替换为对应的 ams token。

## 18.1 token review checklist（PR 审查辅助）

每个引入新组件 / 改色的 PR：

- [ ] 没有 raw `bg-zinc-*` / `text-zinc-*` / `border-white/*`
- [ ] 引入 token 时同步更新 `index.css` 顶部 catalogue 注释
- [ ] dockview 颜色（如有）随 ams token 同步
- [ ] accent 仅用于 active / focus / drawing 三种语境
- [ ] 截图前后对比无破坏性变化（PR 描述贴对比）

## 19. 与 maplibre 样式的边界

地图叠加层（lane fill / signal subsignal / drawing preview）使用
maplibre paint expression：

```ts
'line-color': ['case',
  ['boolean', ['feature-state', 'selected'], false], '#22d3ee',
  ['boolean', ['feature-state', 'hover'], false],    '#a1a1aa',
  '#52525b'
]
```

颜色字面量直写。原因：maplibre paint 不接受 CSS 变量。
要保持视觉一致，约定：

- 地图选中色 = `--color-ams-accent`
- 地图悬停色 = `--color-ams-text-secondary`
- 地图静态色 = `--color-ams-text-disabled`

注释里写明对应 ams token 名，便于未来同步。

## 19.1 主题切换路径（未来）

token 当前是单一深色主题（"Precision Cartography Lab"）。要支持运行时
主题切换：

1. 在 `<html>` 上挂 `data-theme="light"` 等。
2. `@theme` 改为多份选择器：

   ```css
   :root            { --color-ams-bg-base: #09090b; ... }
   [data-theme="light"] { --color-ams-bg-base: #fafafa; ... }
   ```

3. Dockview `--dv-*` 同步多份。
4. 用户偏好持久化到 `settingsStore`，应用启动时挂 `data-theme`。

切换成本几乎全在 token 值；组件代码完全不动 —— 这正是"语义命名"的红利。

## 20. See also

- [Workspace Layout](./workspace-layout.md)
- [Reference / Color Palette](/reference/color-palette)
- ARCHITECTURE.md → "Design tokens (ams-\*)"
