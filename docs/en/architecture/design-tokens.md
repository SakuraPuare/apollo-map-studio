---
title: Design Tokens
description: ams-* token catalogue, naming policy, migration path, Tailwind 4 @theme integration; cross-references to the reference color palette
---

# Design Tokens

> Theme philosophy: "Precision Cartography Lab".
> Source: `src/index.css` (`@theme` block) + Tailwind 4's automatic
> utility class generation.

## 1. Aesthetic intent

- **Base**: deep zinc (zinc-950 → zinc-900) to avoid eye strain in
  low-light authoring sessions.
- **Accent**: `#22d3ee` (cyan-400), the cyan glow of measurement
  instruments. Reserved for in-motion states (drawing, active,
  focus).
- **Type**: `Syne` for headings, `JetBrains Mono` for data and
  coordinates.
- **No decorative colour**: aside from the cyan accent the UI carries
  no warm or saturated hues — keep attention on the map.

## 2. Tailwind 4 `@theme` integration

`src/index.css:37-52` is the single source of truth:

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

Tailwind 4 derives utilities from `@theme` automatically:

| Token                      | Generated utilities (selection)                       |
| -------------------------- | ----------------------------------------------------- |
| `--color-ams-bg-base`      | `bg-ams-bg-base`, `text-ams-bg-base`, ...             |
| `--color-ams-text-primary` | `text-ams-text-primary`, `border-ams-text-primary`    |
| `--color-ams-accent`       | `bg-ams-accent`, `ring-ams-accent`, `text-ams-accent` |

No plugin or `tailwind.config` is required — pure CSS variables.

## 3. Token catalogue

### 3.1 Backgrounds (4)

| Token                        | Value                     | Use                          |
| ---------------------------- | ------------------------- | ---------------------------- |
| `--color-ams-bg-base`        | `#09090b` (zinc-950)      | App backdrop / workspace     |
| `--color-ams-bg-elevated`    | `#18181b` (zinc-900)      | Panels, cards, modals        |
| `--color-ams-surface-hover`  | `rgb(255 255 255 / 0.05)` | Non-destructive hover        |
| `--color-ams-surface-active` | `rgb(255 255 255 / 0.1)`  | Selected / active list items |

### 3.2 Borders (2)

| Token                       | Value                     | Use                               |
| --------------------------- | ------------------------- | --------------------------------- |
| `--color-ams-border-subtle` | `rgb(255 255 255 / 0.07)` | Default separators                |
| `--color-ams-border-strong` | `rgb(255 255 255 / 0.1)`  | Emphasised dividers (panel edges) |

### 3.3 Text tiers (4)

| Token                        | Value     | Semantic                          |
| ---------------------------- | --------- | --------------------------------- |
| `--color-ams-text-primary`   | `#e4e4e7` | Body / data values                |
| `--color-ams-text-secondary` | `#a1a1aa` | Field labels / hints              |
| `--color-ams-text-muted`     | `#71717a` | Captions / timestamps             |
| `--color-ams-text-disabled`  | `#52525b` | Inactive icons / disabled buttons |

### 3.4 Accent (1)

| Token                | Value     | Use                                         |
| -------------------- | --------- | ------------------------------------------- |
| `--color-ams-accent` | `#22d3ee` | Focus, active indicators, drawing highlight |

## 4. Dockview theme bridge

`src/index.css:63-81` maps ams tokens onto Dockview's private CSS
variables:

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

Dockview uses the `--dv-*` namespace; it is intentionally decoupled
from `--color-ams-*` so theme swaps can update both sides.

## 5. Naming policy

**Semantic over hue**:

| ✓ Semantic       | ✗ Hue         |
| ---------------- | ------------- |
| `surface-hover`  | `zinc-800`    |
| `text-secondary` | `gray-400`    |
| `accent`         | `cyan-400`    |
| `border-subtle`  | `white/[.07]` |

The reason: future palette swaps (e.g. moving to oklch) become a
one-file change — components don't move.

## 6. Adding a new token

1. Append `--color-ams-{semantic}: <value>;` inside `@theme` in
   `src/index.css`.
2. Update the catalogue comment at the top of the same file.
3. Pick a semantic name; reject hue-based naming.
4. In the same PR that introduces the token, replace one or more raw
   Tailwind classes (`bg-zinc-900`) with the new utility.

## 7. Migration policy

From ARCHITECTURE.md:

- New components **should** use `ams-*` from day one.
- Existing components migrate **opportunistically** when otherwise
  touched.
- `StatusBar` / `ActivityBar` are the reference migrations.
- Avoid bulk grep-and-replace passes touching hundreds of files —
  visual review breaks down. Migrate one component family at a time.

## 8. Usage examples

### 8.1 Basic panel

```tsx
<aside className="bg-ams-bg-elevated border-r border-ams-border-subtle text-ams-text-primary">
  <header className="text-ams-text-secondary text-[11px] uppercase tracking-wide">Inspector</header>
  <div className="text-ams-text-muted">{entity.id}</div>
</aside>
```

### 8.2 Focus / active

```tsx
<button
  className="text-ams-text-secondary hover:text-ams-text-primary
                   focus:ring-1 focus:ring-ams-accent
                   active:text-ams-accent"
>
  Confirm
</button>
```

### 8.3 Disabled

```tsx
<svg className="text-ams-text-disabled" />
```

## 9. Relationship to general Tailwind colour scale

Tokens do not replace every zinc / cyan use:

- A few map overlay colours (lane fill, signal subsignal R/Y/G)
  remain raw — these are **domain semantic** colours, not theme
  colours.
- MapLibre paint properties take string colours and bypass tokens;
  there we keep hex literals with comments explaining provenance.

## 10. Out of scope (future work)

- **Typography tokens** (`font-heading`, `font-mono` overrides) —
  currently using Tailwind defaults.
- **Elevation / shadow tokens** — none yet; we use inset borders.
- **Motion tokens** — only `@keyframes ams-indeterminate` is defined
  inline in `index.css:110-117`.
- **oklch palette swap** — backlog item.

Do not pre-introduce empty tokens before a real component needs them.

## 11. Consistency checklist (PR review)

1. New components have no raw `bg-zinc-*` / `text-zinc-*` — replace
   with tokens.
2. Token names are semantic, not hue-based.
3. Every new token updates the catalogue comment.
4. Dockview colours stay in sync with ams.
5. Accent is reserved for "active / drawing / focus" — no
   decorative use.

## 12. Accessibility

- AA contrast (4.5:1):
  - `text-primary on bg-base` ≈ 16:1 ✓
  - `text-disabled on bg-base` ≈ 4.6:1 ✓ (do not use for critical info)
- Accent #22d3ee on bg-base ≈ 8.4:1 ✓
- Every focus state combines ring + accent — never colour-only.

## 13. Performance

- CSS variables are runtime-free; resolution happens natively in the
  browser.
- Tailwind 4 derives utilities at build time; final CSS grows by
  ~2 KB.
- Theme swaps are a `@theme` rewrite + rebuild; runtime swap requires
  attaching tokens to `<html data-theme="...">` (not yet
  implemented).

## 14. Pitfalls

1. **Hard-coding `#22d3ee` in a component** — always use
   `text-ams-accent`.
2. **Reaching for `gray-*`** — splits the namespace and pollutes grep.
3. **Alpha lives inside the token** (`/0.05` is in the value), so
   components write `bg-ams-surface-hover`, not `bg-ams-bg-base/5`.
4. **Dockview drift** — every ams change must verify both ams and
   `--dv-*` mirrors.
5. **Hex literals in MapLibre paint** are acceptable but require a
   provenance comment.

## 15. Tests

Tokens have no dedicated unit tests; visual consistency is enforced
through future Storybook + PR review. If we add visual regression,
start from `LicenseBanner` and `MapMetadataForm` — high-contrast
panels with stable layout.

## 16. Public API summary

| Token                     | Use                      |
| ------------------------- | ------------------------ |
| bg-ams-bg-base            | Workspace base           |
| bg-ams-bg-elevated        | Elevated panel           |
| bg-ams-surface-hover      | Hover                    |
| bg-ams-surface-active     | Active / selected        |
| border-ams-border-subtle  | Default border           |
| border-ams-border-strong  | Strong divider           |
| text-ams-text-primary     | Body                     |
| text-ams-text-secondary   | Labels                   |
| text-ams-text-muted       | Captions                 |
| text-ams-text-disabled    | Disabled                 |
| (bg/ring/text)-ams-accent | Active / focus / drawing |

## 17. Source map

```
src/index.css                ← @theme + dockview bridge
src/components/ui/           ← shadcn-style primitives consume ams-*
src/components/layout/       ← StatusBar / ActivityBar reference migrations
docs/reference/color-palette ← visual reference (screenshots)
```

## 18. Relation to shadcn / radix

The project pulls in `shadcn` and a few `@radix-ui/*` primitives
(dialog, dropdown, context-menu, tooltip), but **we do not adopt
shadcn's default theme variables** (`--background`, `--foreground`,
`--primary`, etc.). Reasons:

1. shadcn tokens are marketing-friendly defaults; we want a
   cartography-instrument feel.
2. The naming abstractions differ — shadcn is "product UI", ams is
   "measurement tool".
3. Two systems side-by-side confuses component authors about which
   to use.

When copying a shadcn template into `src/components/ui/`, rewrite
`bg-background` / `text-foreground` etc. into the matching ams token.

## 18.1 PR review checklist (token-related)

For any PR introducing a new component or changing colour:

- [ ] No raw `bg-zinc-*` / `text-zinc-*` / `border-white/*`.
- [ ] If a new token is introduced, the catalogue comment in
      `index.css` is updated.
- [ ] Any Dockview colour change (if applicable) syncs ams tokens.
- [ ] Accent is only used in active / focus / drawing contexts.
- [ ] Before/after screenshots in the PR description show no
      unintended visual regression.

## 19. Boundary with MapLibre style

Map overlays (lane fill, signal subsignal, drawing preview) use
MapLibre paint expressions:

```ts
'line-color': ['case',
  ['boolean', ['feature-state', 'selected'], false], '#22d3ee',
  ['boolean', ['feature-state', 'hover'], false],    '#a1a1aa',
  '#52525b'
]
```

Hex literals only. Reason: MapLibre paint cannot read CSS variables.
For visual consistency the convention is:

- Map selected = `--color-ams-accent`
- Map hover = `--color-ams-text-secondary`
- Map idle = `--color-ams-text-disabled`

A comment near each paint expression names the corresponding ams
token so future palette swaps stay in sync.

## 20. See also

- [Workspace Layout](./workspace-layout.md)
- [Reference / Color Palette](/en/reference/color-palette)
- ARCHITECTURE.md → "Design tokens (ams-\*)"
