---
title: Design Tokens
description: The full Apollo Map Studio token reference — typography, spacing, radius, shadow, motion. Cross-links the color palette.
---

# Design Tokens

This page is the authoritative token catalogue for the Apollo Map Studio
design language. Color tokens have their own page in
[Color Palette](/en/reference/color-palette); this page focuses on
**typography / spacing / radius / shadow / motion**.

::: tip Source of truth

- **Colors**: the `@theme` block in `src/index.css`.
- **Typography & spacing**: Tailwind 4 defaults with project-level overrides.
- **shadcn/ui**: component tokens follow upstream semantics with project-level
  overrides.
  :::

## Typography

### Font families

| Role              | Family               | Where it shows up                       | Notes                                                         |
| ----------------- | -------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Display / Heading | **Syne**             | App titles, brand-heavy areas           | Geometric serif, matches the "precision cartography lab" tone |
| Body / UI Sans    | system-ui sans stack | Default body, forms, buttons            | Tailwind 4 default sans stack                                 |
| Mono / Numeric    | **JetBrains Mono**   | Inspector values, coordinates, IDs, log | Monospaced with high 0/O contrast                             |

```css
/* Loading: imported via VitePress @import / fontsource and src/index.css */
font-family-display: 'Syne', sans-serif;
font-family-mono: 'JetBrains Mono', monospace;
```

### Font scale

| Class       | Computed size    | Usage                               |
| ----------- | ---------------- | ----------------------------------- |
| `text-xs`   | 12 px / 16 px lh | Status bar, unit suffixes, captions |
| `text-sm`   | 14 px / 20 px lh | Default UI text, menu items         |
| `text-base` | 16 px / 24 px lh | Documentation paragraphs            |
| `text-lg`   | 18 px / 28 px lh | Section subheaders                  |
| `text-xl`   | 20 px / 28 px lh | Dialog titles                       |
| `text-2xl`  | 24 px / 32 px lh | Panel headers                       |

### Font weights

| Class           | font-weight | Recommended use                 |
| --------------- | ----------- | ------------------------------- |
| `font-normal`   | 400         | Default body                    |
| `font-medium`   | 500         | Emphasised labels, menu items   |
| `font-semibold` | 600         | Headers, active tool labels     |
| `font-bold`     | 700         | Reserved for hero headings only |

### Text colors

Reuse the `text-ams-*` utility classes from
[Color Palette](/en/reference/color-palette).

```tsx
<h2 className="font-display text-2xl text-ams-text-primary">Inspector</h2>
<span className="text-ams-text-secondary text-xs uppercase">Field</span>
<span className="font-mono text-ams-text-primary">120.521 m</span>
```

## Spacing

Apollo Map Studio uses Tailwind 4's default 4 px-based scale. The 4 px
baseline keeps engineering-precise layouts predictable.

| Class       | Value | Example                     |
| ----------- | ----- | --------------------------- |
| `p-0`       | 0     | Flush layouts               |
| `p-1`       | 4 px  | Icon flush with label       |
| `p-2`       | 8 px  | Compact tool buttons        |
| `p-3`       | 12 px | List items                  |
| `p-4`       | 16 px | Default panel padding       |
| `p-6`       | 24 px | Dialog primary region       |
| `p-8`       | 32 px | Onboarding empty space      |
| `space-y-1` | 4 px  | Tool group vertical spacing |
| `space-y-2` | 8 px  | Form field spacing          |
| `space-y-4` | 16 px | Between sections            |

::: tip Project-level conventions

- Panel padding is uniformly `p-4` to avoid jagged baselines.
- Use `space-y-1` or `gap-1` between a label and its field.
- Separate list items with `divide-y divide-ams-border-subtle` instead of
  faking it with `space-y-*`.
  :::

## Radius

| Class          | Value   | Example                          |
| -------------- | ------- | -------------------------------- |
| `rounded-none` | 0       | Edge-aligned status bar elements |
| `rounded-sm`   | 2 px    | Tags, stubs                      |
| `rounded`      | 4 px    | Default buttons / inputs         |
| `rounded-md`   | 6 px    | shadcn default                   |
| `rounded-lg`   | 8 px    | Dialogs, cards                   |
| `rounded-xl`   | 12 px   | Hero or promo cards              |
| `rounded-full` | 9999 px | Avatars, status dots             |

::: tip Aligning with shadcn
shadcn/ui's `--radius: 0.5rem` (≈ 8 px) is already aligned with `rounded-lg`
through `tailwind.config` / `@theme`, so no extra overrides are needed in
this codebase.
:::

## Shadow

Precision-cartography styling avoids heavy shadows; only critical floating
overlays use them.

| Class         | Strength                            | Example                     |
| ------------- | ----------------------------------- | --------------------------- |
| `shadow-none` | None                                | Panels, inspector (default) |
| `shadow-sm`   | `0 1px 2px 0 rgba(0,0,0,0.20)`      | Popover edges               |
| `shadow`      | `0 1px 3px 0 rgba(0,0,0,0.30)`      | Dropdowns                   |
| `shadow-md`   | `0 4px 6px -1px rgba(0,0,0,0.30)`   | Dialogs                     |
| `shadow-lg`   | `0 10px 15px -3px rgba(0,0,0,0.40)` | Command palette             |
| `shadow-xl`   | Heavier                             | Discouraged                 |

::: warning Shadows on dark
Shadows are barely visible on a near-black backdrop. For "halo" effects use
`ring-ams-accent` or `outline-ams-accent` instead.
:::

## Borders

| Class                                                   | Example              |
| ------------------------------------------------------- | -------------------- |
| `border`                                                | Default 1 px         |
| `border-2`                                              | Emphasised outline   |
| `border-ams-border-subtle`                              | Default separator    |
| `border-ams-border-strong`                              | Emphasised separator |
| `ring-1 ring-ams-accent`                                | Selected highlight   |
| `outline outline-2 outline-offset-2 outline-ams-accent` | Keyboard focus       |

## Motion

The only keyframe declared in `src/index.css`:

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

| Class                       | Duration              | Example                            |
| --------------------------- | --------------------- | ---------------------------------- |
| `transition-colors`         | 150 ms                | Hover / active swaps               |
| `transition-transform`      | 200 ms                | Dropdown reveal                    |
| `animate-ams-indeterminate` | 1.5 s linear infinite | TaskProgressOverlay indeterminate  |
| `motion-reduce:*`           | —                     | Respects OS prefers-reduced-motion |

::: tip Motion principles

- `transition-colors` covers ~90% of cases.
- No bouncy / heavy easing — they conflict with the CAD aesthetic.
- Any animation ≥ 300 ms requires explicit justification in the PR.
  :::

## Z-index layers

| Class    | Value | Example                            |
| -------- | ----- | ---------------------------------- |
| `z-0`    | 0     | maplibre canvas, cold / hot layers |
| `z-10`   | 10    | Tool strip overlay                 |
| `z-20`   | 20    | Activity bar                       |
| `z-30`   | 30    | Menubar, status bar                |
| `z-40`   | 40    | Dropdown, popover                  |
| `z-50`   | 50    | Dialog, command palette            |
| `z-[60]` | 60    | Toast, TaskProgressOverlay         |

## Focus / hover / active interaction tokens

| State            | Recommended class                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Hover            | `hover:bg-ams-surface-hover`                                                                                    |
| Active / pressed | `active:bg-ams-surface-active`                                                                                  |
| Selected         | `data-[state=selected]:bg-ams-surface-active`                                                                   |
| Focus            | `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ams-accent` |
| Disabled         | `disabled:text-ams-text-disabled disabled:cursor-not-allowed`                                                   |

## Font loading and fallbacks

::: warning Fallbacks
If Syne or JetBrains Mono fail to load:

- Syne → `system-ui sans-serif`
- JetBrains Mono → `'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace`

The Electron build ships fonts inline; the Web build relies on hosted or
self-hosted fonts.
:::

## Mapping to shadcn/ui

shadcn/ui aligns with the project via `@theme` CSS variables. Common
mappings:

| shadcn variable      | Project mapping                 |
| -------------------- | ------------------------------- |
| `--background`       | `--color-ams-bg-base`           |
| `--foreground`       | `--color-ams-text-primary`      |
| `--muted`            | `--color-ams-bg-elevated`       |
| `--muted-foreground` | `--color-ams-text-secondary`    |
| `--border`           | `--color-ams-border-subtle`     |
| `--ring`             | `--color-ams-accent`            |
| `--primary`          | `--color-ams-accent` (cyan-400) |
| `--radius`           | `0.5rem` (≈ rounded-lg)         |

::: tip Token resolution path for new components

1. Prefer ams semantic tokens.
2. Otherwise, use shadcn `--*` variables.
3. Otherwise, fall back to native Tailwind utilities (such as `text-zinc-400`).
4. File a documentation issue so the gap can be closed with a new ams token.
   :::

## How Tailwind 4 `@theme` injection works

```css
@theme {
  --font-display: 'Syne', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --color-ams-bg-base: #09090b;
  /* ... */
}
```

At build time Tailwind 4 expands every entry in `@theme` into:

- **CSS variables**: usable in any inline style or `var(--font-display)`.
- **Utility classes**: `font-display`, `font-mono`, `bg-ams-bg-base`,
  `text-ams-accent`, and so on.

::: tip Project guidance

- Prefer utility classes (most consistent).
- Reach for raw CSS variables only inside animations or inline styles.
- Avoid mixing `@apply` with inline styles — specificity becomes hard to
  trace.
  :::

## Font loading strategy

| Scenario         | Strategy                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Web build (Vite) | `@fontsource/syne` and `@fontsource/jetbrains-mono` are imported at the top of `src/index.css` with latin and latin-ext subsets |
| Electron         | Same as Web — packaged into dist, no online requests                                                                            |
| Docs (VitePress) | VitePress styles are independent of ams tokens; docs include fonts only as needed                                               |

## Subsets and fallback performance

::: warning Latin-only
The current bundle only includes `latin` + `latin-ext`. CJK characters fall
back to the system font. This keeps the first-paint font payload small.
Introducing CJK requires the corresponding subset via CDN or self-hosting.
:::

## Mapping to Apollo data display

| Data                         | Suggested font | Suggested token           |
| ---------------------------- | -------------- | ------------------------- |
| Lane ID                      | `font-mono`    | `text-ams-text-primary`   |
| Lane type / turn / direction | sans           | `text-ams-text-primary`   |
| Field labels                 | sans           | `text-ams-text-secondary` |
| Units (m, m/s)               | sans           | `text-ams-text-muted`     |
| Lat/lng values               | `font-mono`    | `text-ams-text-primary`   |
| Status bar "Drawing…"        | sans           | `text-ams-accent`         |

## Related pages

- [Color Palette](/en/reference/color-palette) — color tokens
- [Design tokens (architecture)](/en/architecture/design-tokens) — how Tailwind
  4 `@theme` injection works
- [Workspace layout](/en/architecture/workspace-layout)
- [Activity Bar and panels](/en/guide/activity-bar-and-panels)
- [Glossary: shadcn/ui](/en/reference/glossary#shadcn-ui)
- [Glossary: Dockview](/en/reference/glossary#dockview)
