# Design Tokens (`ams-*`)

Source of truth: the `@theme` block in
[`src/index.css`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/src/index.css).
Tailwind 4 emits each `--color-ams-{semantic}` declaration as utility
classes (`bg-ams-*`, `text-ams-*`, `border-ams-*`, `ring-ams-*`, …) so
component code references the token name, never the hex value.

> Tokens follow the **"Precision Cartography Lab"** aesthetic — neutral
> dark surfaces with a single high-chroma cyan accent. Do not introduce
> hue-named tokens (`zinc-700`, `cyan-400`); names must describe intent.

## Catalogue

| Token                      | CSS variable                 | Value                     | Intended use                         | Example references                                  |
| -------------------------- | ---------------------------- | ------------------------- | ------------------------------------ | --------------------------------------------------- |
| `bg-ams-bg-base`           | `--color-ams-bg-base`        | `#09090b` (zinc-950)      | App / chrome backdrop                | `WorkspaceLayout`, dockview `--dv-background-color` |
| `bg-ams-bg-elevated`       | `--color-ams-bg-elevated`    | `#18181b` (zinc-900)      | Raised panels, cards, popovers       | Inspector card, command palette                     |
| `bg-ams-surface-hover`     | `--color-ams-surface-hover`  | `rgb(255 255 255 / 0.05)` | Non-destructive hover state          | Toolstrip buttons, menu items                       |
| `bg-ams-surface-active`    | `--color-ams-surface-active` | `rgb(255 255 255 / 0.10)` | Selected / active item background    | Active tab, selected layer row                      |
| `border-ams-border-subtle` | `--color-ams-border-subtle`  | `rgb(255 255 255 / 0.07)` | Default separators                   | Panel splitters, input borders                      |
| `border-ams-border-strong` | `--color-ams-border-strong`  | `rgb(255 255 255 / 0.10)` | Emphasised dividers                  | Section headings, modal frames                      |
| `text-ams-text-primary`    | `--color-ams-text-primary`   | `#e4e4e7` (zinc-200)      | Body copy, inspector values          | Inspector field values, status bar coordinates      |
| `text-ams-text-secondary`  | `--color-ams-text-secondary` | `#a1a1aa` (zinc-400)      | Data labels                          | Inspector field labels, panel headings              |
| `text-ams-text-muted`      | `--color-ams-text-muted`     | `#71717a` (zinc-500)      | Captions, hints                      | Empty-state text, helper hints                      |
| `text-ams-text-disabled`   | `--color-ams-text-disabled`  | `#52525b` (zinc-600)      | Inactive icons, disabled controls    | Greyed toolstrip icons                              |
| `*-ams-accent`             | `--color-ams-accent`         | `#22d3ee` (cyan-400)      | Primary highlight, active indicators | Drawing-state ribbon, active-tab underline          |

## Tailwind 4 emission

```css
/* src/index.css */
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

Each line generates the matching `bg-ams-bg-base`, `text-ams-text-primary`,
etc. utility automatically. No tailwind config changes are required.

## Dockview bridge

Dockview ships its own theme variables. Where the `ams-*` palette
matches one of dockview's slots, the editor wires the dockview variable
to a literal that mirrors the `ams-*` value. Keeping the two in sync is
manual: when an `ams-*` token changes, update the dockview block in the
same file.

```css
/* src/index.css — dockview-theme-dark */
--dv-paneview-header-border-color: rgba(255, 255, 255, 0.07);
--dv-tabs-and-actions-container-background-color: #0a0a0a;
--dv-activegroup-visiblepanel-tab-background-color: #171717;
--dv-paneview-active-outline-color: #22d3ee40;
--dv-drag-over-background-color: rgba(34, 211, 238, 0.1);
--dv-drag-over-border-color: rgba(34, 211, 238, 0.3);
--dv-background-color: #09090b;
--dv-group-view-background-color: #0a0a0a;
```

## Adding a token

1. Append a `--color-ams-{semantic}: <value>;` line to the `@theme`
   block in `src/index.css`.
2. Update the catalogue comment at the top of that file with the new
   entry.
3. Update this page's table.
4. If the token is meant to drive dockview, mirror it in
   `.dockview-theme-dark`.

Names must be **semantic** (`surface-hover`, `text-muted`) rather than
**hue-based** (`zinc-700`, `gray-400`) so future palette swaps don't
ripple into component code.

## Using a token

Replace raw Tailwind colour classes with their `ams-*` equivalent:

| Before               | After                      |
| -------------------- | -------------------------- |
| `bg-zinc-950`        | `bg-ams-bg-base`           |
| `bg-zinc-900`        | `bg-ams-bg-elevated`       |
| `text-cyan-400`      | `text-ams-accent`          |
| `text-zinc-400`      | `text-ams-text-secondary`  |
| `border-white/[.07]` | `border-ams-border-subtle` |
| `bg-white/5`         | `bg-ams-surface-hover`     |

When in doubt, prefer the closest semantic match — inactive icons →
`text-ams-text-disabled`. Reach for a new token only when an existing
one cannot honestly describe the intent.

## Migration policy

Tokens are introduced **incrementally**. The migration rules from
`ARCHITECTURE.md` apply verbatim:

- New components SHOULD use `ams-*` classes from day one.
- Existing components get migrated **opportunistically** (when otherwise
  touched) or via dedicated PRs.
- `StatusBar` and `ActivityBar` are the reference migrations.
- **Avoid bulk grep-and-replace** passes that touch hundreds of files
  in one go. Prefer one component family at a time so visual review
  stays tractable.

A migrated component:

- references zero `bg-zinc-*` / `text-zinc-*` / explicit `#hhhhhh` for
  the slots covered by the token catalogue;
- uses semantic class names exclusively;
- still falls back to raw colours for slots without a corresponding
  semantic token (with a TODO comment pointing at the gap).

## Out of scope (future work)

The current PoC catalogue covers backgrounds, surfaces, borders, four
text tiers, and the cyan accent. The following are explicitly **not**
part of the PoC and will be added when a real component requires the
distinction:

- Typography tokens (`font-heading`, `font-mono` overrides)
- Elevation / shadow tokens
- Motion tokens (durations, easings)
- The promised oklch palette swap

Until then, components requiring those slots use raw Tailwind utilities.

## See also

- Architecture overview of the design system: [Architecture](/architecture/overview)
- Semantic palette breakdown: [Color Palette](/reference/color-palette)
- Existing token consumers (search):
  ```bash
  git grep -n "ams-" -- 'src/**/*.tsx' 'src/**/*.ts'
  ```
