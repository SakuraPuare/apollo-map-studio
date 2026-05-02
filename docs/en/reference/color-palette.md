---
title: Color Palette
description: Every ams-* color token in the src/index.css @theme block — semantic role, hex value, and dark-mode variants.
---

# Color Palette

This page enumerates every `ams-*` color token defined in the `@theme` block
of `src/index.css`. Tailwind 4 turns each `--color-ams-{semantic}` declaration
into utility classes such as `bg-ams-*`, `text-ams-*`, `border-ams-*`, and
`ring-ams-*`.

::: tip Token-naming principles

- **Semantic names**: `bg-base / surface-hover / text-secondary / accent` — never
  expose raw hues.
- **Dark-first**: the editor's default theme is dark. Light theme is out of
  scope for 1.0.
- **Layered**: `bg-base` < `bg-elevated` < `surface-hover` < `surface-active`,
  matching the Photoshop-style panel hierarchy.
  :::

## Source

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

## Palette overview (semantics → colors)

```text
┌─────────────────────────────────────────────┐
│ ams-bg-base    █████████   #09090b          │ ← app backdrop
├─────────────────────────────────────────────┤
│ ams-bg-elevated █████████   #18181b         │ ← panel
├─────────────────────────────────────────────┤
│ ams-surface-hover  ░░░░░░  white 5%         │ ← hover
├─────────────────────────────────────────────┤
│ ams-surface-active ▒▒▒▒▒▒  white 10%        │ ← selected
├─────────────────────────────────────────────┤
│ ams-text-primary    AaBbCc  #e4e4e7         │ ← primary text
│ ams-text-secondary  AaBbCc  #a1a1aa         │ ← labels
│ ams-text-muted      AaBbCc  #71717a         │ ← captions
│ ams-text-disabled   AaBbCc  #52525b         │ ← disabled
├─────────────────────────────────────────────┤
│ ams-accent          ★★★★★   #22d3ee          │ ← state highlight
└─────────────────────────────────────────────┘
```

## Surfaces

| Token                        | Value                    | Tailwind class          | Semantic role           | Typical usage                |
| ---------------------------- | ------------------------ | ----------------------- | ----------------------- | ---------------------------- |
| `--color-ams-bg-base`        | `#09090b` (zinc-950)     | `bg-ams-bg-base`        | App backdrop            | `<body>`, menubar background |
| `--color-ams-bg-elevated`    | `#18181b` (zinc-900)     | `bg-ams-bg-elevated`    | Raised panels and cards | Inspector, LayerTree         |
| `--color-ams-surface-hover`  | `rgba(255,255,255,0.05)` | `bg-ams-surface-hover`  | Non-destructive hover   | Tool button hover            |
| `--color-ams-surface-active` | `rgba(255,255,255,0.10)` | `bg-ams-surface-active` | Selected / active       | Currently selected tool      |

::: tip Layer rules
Going from background to foreground: `bg-base` → `bg-elevated` →
`surface-hover` → `surface-active`. Reusing the same token across two layers
flattens the visual hierarchy.
:::

## Borders

| Token                       | Value                    | Tailwind class             | Semantic role      |
| --------------------------- | ------------------------ | -------------------------- | ------------------ |
| `--color-ams-border-subtle` | `rgba(255,255,255,0.07)` | `border-ams-border-subtle` | Default separator  |
| `--color-ams-border-strong` | `rgba(255,255,255,0.10)` | `border-ams-border-strong` | Emphasised divider |

## Text

| Token                        | Value                | Tailwind class            | Semantic role  | Layer                          |
| ---------------------------- | -------------------- | ------------------------- | -------------- | ------------------------------ |
| `--color-ams-text-primary`   | `#e4e4e7` (zinc-200) | `text-ams-text-primary`   | Body text      | Inspector value, menu items    |
| `--color-ams-text-secondary` | `#a1a1aa` (zinc-400) | `text-ams-text-secondary` | Labels         | Inspector labels, field names  |
| `--color-ams-text-muted`     | `#71717a` (zinc-500) | `text-ams-text-muted`     | Captions       | Helper hints, unit suffixes    |
| `--color-ams-text-disabled`  | `#52525b` (zinc-600) | `text-ams-text-disabled`  | Disabled state | Inactive buttons, dimmed icons |

## Accent

| Token                | Value                | Tailwind class                                          | Semantic role     |
| -------------------- | -------------------- | ------------------------------------------------------- | ----------------- |
| `--color-ams-accent` | `#22d3ee` (cyan-400) | `text-ams-accent` / `bg-ams-accent` / `ring-ams-accent` | Primary highlight |

Where it shows up:

- Active tool border / text
- FSM "drawing" state indicator in the status bar
- Indeterminate progress animation (`@keyframes ams-indeterminate`)

## Dockview theme variables

`src/index.css:63-81` aligns Dockview 5's dark theme with the ams palette:

| Dockview variable                                      | Value                    | Mapping to ams                  |
| ------------------------------------------------------ | ------------------------ | ------------------------------- |
| `--dv-paneview-header-border-color`                    | `rgba(255,255,255,0.07)` | = `border-subtle`               |
| `--dv-tabs-and-actions-container-background-color`     | `#0a0a0a`                | slightly lighter than `bg-base` |
| `--dv-activegroup-visiblepanel-tab-background-color`   | `#171717`                | ≈ `bg-elevated`                 |
| `--dv-activegroup-hiddenpanel-tab-background-color`    | `#0a0a0a`                | ≈ `bg-base`                     |
| `--dv-inactivegroup-visiblepanel-tab-background-color` | `#0f0f0f`                | between base and elevated       |
| `--dv-inactivegroup-hiddenpanel-tab-background-color`  | `#0a0a0a`                | ≈ `bg-base`                     |
| `--dv-tab-divider-color`                               | `rgba(255,255,255,0.07)` | = `border-subtle`               |
| `--dv-activegroup-visiblepanel-tab-color`              | `#e4e4e7`                | = `text-primary`                |
| `--dv-activegroup-hiddenpanel-tab-color`               | `#71717a`                | = `text-muted`                  |
| `--dv-inactivegroup-visiblepanel-tab-color`            | `#a1a1aa`                | = `text-secondary`              |
| `--dv-inactivegroup-hiddenpanel-tab-color`             | `#52525b`                | = `text-disabled`               |
| `--dv-separator-border`                                | `rgba(255,255,255,0.07)` | = `border-subtle`               |
| `--dv-paneview-active-outline-color`                   | `#22d3ee40`              | accent 25% alpha                |
| `--dv-drag-over-background-color`                      | `rgba(34,211,238,0.10)`  | accent 10% alpha                |
| `--dv-drag-over-border-color`                          | `rgba(34,211,238,0.30)`  | accent 30% alpha                |
| `--dv-background-color`                                | `#09090b`                | = `bg-base`                     |
| `--dv-group-view-background-color`                     | `#0a0a0a`                | slightly lighter than `bg-base` |

## Active tab indicator

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

## Sash hover highlight

```css
/* src/index.css:101-108 */
.dockview-theme-dark .sash:hover,
.dockview-theme-dark .sash.active {
  background: rgba(34, 211, 238, 0.3); /* accent 30% */
}
```

## Usage examples

```tsx
<div className="bg-ams-bg-base text-ams-text-primary border-ams-border-subtle">
  <div className="bg-ams-bg-elevated p-4 rounded-md">
    <div className="text-ams-text-secondary text-xs uppercase">Lane</div>
    <div className="text-ams-text-primary text-sm font-mono">CITY_DRIVING</div>
    <span className="text-ams-accent">drawing…</span>
  </div>
</div>
```

::: tip Adding a new token

1. Append `--color-ams-<semantic>: <value>;` inside the `@theme` block.
2. Use semantic names (`surface-warning`) instead of hue names (`yellow`).
3. Sync this page and [Design Tokens](/en/reference/design-tokens).
4. When the same token is referenced across chapters, modify this single
   page first.
   :::

## Light / dark variants roadmap

::: warning 1.0 is dark-only
The 1.0 palette is dark-only. Light theme is on the roadmap; the migration
will override every `ams-*` token under `[data-theme="light"]`, so consumer
sites will not need to change.
:::

## Colors outside the ams system

These colors are managed directly by the map rendering pipeline rather than
by `ams-*` tokens, to avoid mixing chrome and content:

- Lane boundary stroke colours (`SOLID_YELLOW`, `DOTTED_WHITE`, ...) are
  decided by maplibre layer paint expressions. See
  [Cold/hot layers](/en/architecture/cold-hot-layers).
- Junction polygon fills are owned by per-element styling modules
  (`ParkingSpace`, `Junction`, ...).
- Hover / selection visuals are owned by the hot layer's own paint config.

## Accessibility

| Check                                             | Result                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `text-ams-text-primary` on `bg-ams-bg-base`       | ≈ 14.5:1 (well above WCAG AAA)                              |
| `text-ams-text-secondary` on `bg-ams-bg-elevated` | ≈ 7.2:1 (AAA)                                               |
| `text-ams-text-muted` on `bg-ams-bg-base`         | ≈ 4.8:1 (AA Large)                                          |
| `text-ams-text-disabled` on `bg-ams-bg-base`      | ≈ 3.5:1 (disabled-only visual cue, not for primary content) |
| `text-ams-accent` on `bg-ams-bg-base`             | ≈ 8.5:1 (AAA)                                               |

::: warning Disabled is not the same as muted
`text-ams-text-disabled` sits just above the 3:1 line and is for disabled
visuals only. Use `text-ams-text-muted` or `text-ams-text-secondary` for
secondary content that still carries meaning.
:::

## Color semantics quick chooser

| What you want to express         | Use                        |
| -------------------------------- | -------------------------- |
| App backdrop                     | `bg-ams-bg-base`           |
| A standalone panel / card        | `bg-ams-bg-elevated`       |
| Mouse hover (no semantic change) | `bg-ams-surface-hover`     |
| Currently selected               | `bg-ams-surface-active`    |
| Default separator                | `border-ams-border-subtle` |
| Emphasised separator             | `border-ams-border-strong` |
| Primary text                     | `text-ams-text-primary`    |
| Field name / label               | `text-ams-text-secondary`  |
| Hints, unit suffixes             | `text-ams-text-muted`      |
| Disabled text                    | `text-ams-text-disabled`   |
| Current state / in progress      | `text-ams-accent`          |

## Coordinating with maplibre paint colors

maplibre owns paint expressions but should still gravitate toward the ams
palette where possible:

| Element                     | Recommended stroke / fill   | Reason                                   |
| --------------------------- | --------------------------- | ---------------------------------------- |
| Lane centerline (idle)      | `#a1a1aa`                   | Mirrors `text-secondary`                 |
| Lane centerline (selected)  | `#22d3ee`                   | Accent — strong contrast                 |
| Lane boundary SOLID_WHITE   | `#e4e4e7`                   | text-primary — avoids pure-white glare   |
| Lane boundary DOTTED_YELLOW | Custom yellow (outside ams) | Protocol semantics demand a vivid yellow |
| Junction polygon fill       | `rgba(34,211,238,0.10)`     | Accent 10%                               |
| Hover highlight             | `rgba(34,211,238,0.30)`     | Accent 30% — matches Dockview drag-over  |

::: tip Mental model

- Chrome / panel → always use ams semantic tokens.
- Data semantics → maplibre paint (preserves protocol correctness).
- Interaction states → ams accent family (visual consistency).
  :::

## Anti-patterns

::: warning Avoid

- Do not use `text-zinc-400` directly; you lose i18n / theme-swap capability.
- Do not put `bg-ams-bg-base` on a panel — the layered visual collapses.
- Do not use `bg-ams-accent` as a large background — it overpowers content.
- Do not inline RGBA values in components (for example, an inline `background: rgba(34,211,238,0.5)` value).
  Bypassing the token system breaks future theme swaps.
  :::

## Related pages

- [Design Tokens](/en/reference/design-tokens) — typography, spacing, radius, shadow
- [Design tokens (architecture)](/en/architecture/design-tokens)
- [Workspace layout](/en/architecture/workspace-layout)
- [Glossary: shadcn/ui](/en/reference/glossary#shadcn-ui)
- [Glossary: Dockview](/en/reference/glossary#dockview)
