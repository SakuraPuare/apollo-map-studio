# Core / elements

Source: `src/core/elements.ts`.

`MAP_ELEMENTS` defines Apollo element buttons shown in the ToolStrip. Each row
contains:

- `type`;
- user label;
- allowed draw tools;
- default draw tool;
- render color;
- geometry kind;
- React icon.

`ALL_DRAW_TOOLS` defines draw-tool labels and colors. `elementColor()` and
`laneTypeColor()` provide render color helpers.

See [Map Elements](/guide/map-elements).
