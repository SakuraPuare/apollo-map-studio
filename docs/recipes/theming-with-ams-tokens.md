# Theming with `ams-*` Tokens

Apollo Map Studio styles route through semantic Tailwind 4 tokens
declared in `src/index.css` under `@theme`. Every color used in
production components must resolve to a token name (e.g.
`bg-ams-bg-base`) rather than a raw hue (`bg-zinc-950`). This recipe
covers the token catalogue, when to add a new token vs reuse an
existing one, and how the migration is tracked.

## Why tokens

Without semantic tokens, swapping the palette means find-and-replace
across hundreds of files. The codebase used `bg-zinc-950` in the dark
mode PoC; moving to OKLCH or shipping a light theme would require
auditing every component. Tokens decouple intent (`surface-hover`)
from value (`white/5`), so a future palette swap touches one file:
`src/index.css`.

## Token catalogue (current)

The PoC catalogue is documented inline in `src/index.css`:

```css
@theme {
  --color-ams-bg-base: #09090b; /* zinc-950   app/chrome backdrop */
  --color-ams-bg-elevated: #18181b; /* zinc-900   raised panels/cards */
  --color-ams-surface-hover: rgb(255 255 255 / 0.05); /* hover */
  --color-ams-surface-active: rgb(255 255 255 / 0.1); /* active */

  --color-ams-border-subtle: rgb(255 255 255 / 0.07); /* default separators */
  --color-ams-border-strong: rgb(255 255 255 / 0.1); /* emphasised dividers */

  --color-ams-text-primary: #e4e4e7; /* zinc-200   body / values */
  --color-ams-text-secondary: #a1a1aa; /* zinc-400   data labels */
  --color-ams-text-muted: #71717a; /* zinc-500   captions */
  --color-ams-text-disabled: #52525b; /* zinc-600   inactive icons */

  --color-ams-accent: #22d3ee; /* cyan-400   highlights */
}
```

Tailwind 4 picks these up from the `@theme` block and exposes them as
utility classes:

```text
--color-ams-bg-base       → bg-ams-bg-base, text-ams-bg-base, …
--color-ams-text-primary  → text-ams-text-primary, …
--color-ams-accent        → bg-ams-accent, text-ams-accent, ring-ams-accent, border-ams-accent, …
```

## Step 1 — Use existing tokens before adding new ones

Before reaching for a new token, find the closest semantic match.
Common mappings the team has settled on:

| Intent                                      | Token                                                       |
| ------------------------------------------- | ----------------------------------------------------------- |
| App / chrome / canvas background            | `bg-ams-bg-base`                                            |
| Panel / card / inspector surface            | `bg-ams-bg-elevated`                                        |
| Hover state on a surface                    | `bg-ams-surface-hover`                                      |
| Selected / active item                      | `bg-ams-surface-active`                                     |
| Default 1px separator                       | `border-ams-border-subtle`                                  |
| Emphasised divider                          | `border-ams-border-strong`                                  |
| Body text, displayed values                 | `text-ams-text-primary`                                     |
| Field labels, data captions                 | `text-ams-text-secondary`                                   |
| Tertiary captions, hints                    | `text-ams-text-muted`                                       |
| Disabled icons / placeholder text           | `text-ams-text-disabled`                                    |
| Active drawing tool, focus ring, link hover | `text-ams-accent` / `ring-ams-accent` / `border-ams-accent` |

If the closest token is "off by 5% opacity" or "slightly different
hue", **use the existing token**. The point of semantic tokens is
that the whole app drifts together when one value changes; adding a
near-duplicate defeats the purpose.

## Step 2 — Adding a new token

Reach for a new token only when an existing one cannot honestly
describe the intent. Concrete trigger: a designer's spec calls for a
distinct semantic role that isn't in the catalogue (e.g. a "danger"
red, or a separate "selection-stroke" color).

Append the token to `@theme` in `src/index.css`:

```css
@theme {
  /* … existing tokens … */
  --color-ams-danger: #f87171; /* error / destructive action */
}
```

Then update the catalogue comment at the top of the file with the new
entry — the comment is the canonical reference, so keep it current:

```css
/*
 *   *-ams-accent             #22d3ee  (cyan-400)  primary highlight
 *   *-ams-danger             #f87171  (red-400)   error / destructive
 */
```

Use it in components like any other token:

```tsx
<button className="text-ams-danger hover:bg-ams-danger/10">Delete</button>
```

::: tip Naming
Use semantic names (`danger`, `surface-hover`, `text-muted`), not
hue-based ones (`red-400`, `zinc-700-overlay`). The whole point of
the token system is that future palette swaps don't ripple through
component code.
:::

## Step 3 — Migrating existing components

The migration policy is in `ARCHITECTURE.md` → "Design tokens
(ams-\*)":

- New components SHOULD use `ams-*` from day one.
- Existing components migrate **opportunistically** (when otherwise
  touched) or via a focused PR.
- `ActivityBar` and `StatusBar` are the reference migrations — read
  those PRs for the diff style and review checklist.
- Avoid bulk grep-and-replace passes that touch hundreds of files.
  Visual review breaks down past 5–10 files; do one component family
  at a time.

Migration mechanics:

```diff
- <div className="bg-zinc-950 text-zinc-200 border-white/10">
+ <div className="bg-ams-bg-base text-ams-text-primary border-ams-border-strong">
```

When you encounter a class that **doesn't** map cleanly to an existing
token (e.g. `bg-zinc-800` between `bg-base` and `bg-elevated`), pause
and ask: is this an arbitrary visual choice, or a real semantic
distinction? If it's arbitrary, consolidate to the nearest token. If
it's a new semantic role, add a token (Step 2).

## Token usage outside Tailwind

Some surfaces are not Tailwind-driven:

- **Dockview theme**: `src/index.css` has a `.dockview-theme-dark`
  block that overrides Dockview's CSS variables. These are kept as
  hex literals because Dockview's variable system is independent of
  Tailwind. When migrating a token, also update the matching
  Dockview variable so panel chrome stays consistent.
- **MapLibre layer paint**: layer paint properties (line color, fill
  color) live in TypeScript map-layer config. Reference the CSS
  custom property by name from JS:

  ```ts
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-ams-accent')
    .trim();
  ```

  This keeps the canvas in sync if the token changes at runtime.

## Out of scope (future work)

Listed in `ARCHITECTURE.md` for explicitness:

- Typography tokens (`font-heading`, `font-mono` overrides)
- Elevation / shadow tokens
- Motion tokens (`duration-fast`, `ease-precise`)
- An OKLCH palette swap

None of these are in the PoC. Add them when a real component
genuinely needs the distinction — not preemptively.

## Verification

1. `pnpm typecheck` — token additions are CSS, but the build still
   needs to pass.
2. `pnpm dev` — the new token's utilities (e.g. `bg-ams-danger`) are
   available in DevTools; auto-complete in the editor (with the
   Tailwind CSS IntelliSense extension) recognises them.
3. Visual review: open `src/components/layout/StatusBar.tsx` and
   `src/components/layout/ActivityBar.tsx` for the reference patterns.
4. `pnpm format:check` — the new `@theme` entry follows Prettier's
   CSS conventions.

## Common mistakes

- **Adding `--ams-color-*` instead of `--color-ams-*`.** Tailwind 4's
  utility generation reads `--color-*` specifically. Wrong prefix →
  no utility classes generated.
- **Defining the token outside `@theme`.** `:root` works for raw CSS
  variables but bypasses Tailwind's utility synthesis.
- **Reusing `text-ams-accent` for both "active" and "informational".**
  Two roles, one color — a future palette swap can't distinguish them.
  Add a second token if the meanings really diverge.
- **Bulk grep-and-replace migration.** PRs that touch 200 files for a
  token rename are unreviewable. Migrate by component family.

## Cross-references

- [/architecture/overview](../architecture/overview.md) → "Design tokens (ams-\*)"
  for the canonical SOP and migration policy
- [/api/components](../api/components/) — component-level token usage
  examples
- `src/index.css` — the source of truth, with the inline catalogue
  comment
