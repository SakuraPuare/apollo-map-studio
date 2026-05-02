# Design Tokens

The app uses Tailwind utilities plus CSS custom properties defined in
`src/index.css`.

## Token Families

Common token names use the `ams-*` prefix:

- background surfaces;
- borders;
- text colors;
- accent colors;
- hover/active surfaces.

Layout components use those tokens through utility classes such as
`bg-ams-bg-base`, `border-ams-border-subtle`, `text-ams-text-muted` and
`bg-ams-surface-active`.

## Practical Rule

When adding UI, prefer existing `ams-*` tokens over raw color literals. Raw
colors are acceptable in map-rendering geometry where the color is part of
domain visualization, for example `MAP_ELEMENTS` colors or lane type colors.
