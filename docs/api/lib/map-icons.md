# Map Icons

> Source: `src/lib/mapIcons.ts`

## Overview

`mapIcons.ts` is the registry that rasterises React-Icons SVGs into
MapLibre image symbols. MapLibre's `symbol` layer renders inside a
WebGL canvas where React DOM cannot reach — so icons must be turned
into `ImageData` and registered via `map.addImage(id, data)` before
any `symbol-image` style expression can reference them.

The module owns four concerns:

1. **A registry** mapping icon ids to React-Icons components.
2. **A rasteriser** that walks SVG → blob URL → `Image` → `<canvas>` →
   `ImageData`.
3. **A bulk-register helper** (`registerMapIcons`) that the map
   lifecycle hook calls once after `map.load`.
4. **An `ICON_PX` constant** (currently `64`) exposed as
   `MAP_ICON_PX` for downstream layers that want consistent sizing.

The icon set was selected to map cleanly onto Apollo entity types that
are visually represented as point symbols (parking spaces, signals,
barrier gates, stop signs, yield signs, speed bumps).

## Exports

| Symbol             | Signature                                                                | Purpose                          |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------- |
| `MAP_ICON_PX`      | `number` (= 64)                                                          | Canonical icon raster size.      |
| `registerMapIcons` | `(map: Pick<maplibregl.Map, 'hasImage' \| 'addImage'>) => Promise<void>` | Register every icon. Idempotent. |

The `REGISTRY` itself is module-private — callers reference icons by
id string, not by component.

## Behavior

### Icon registry

```ts
const REGISTRY: Record<string, ComponentType<IconProps>> = {
  'icon-parking': FaSquareParking,
  'icon-signal': FaTrafficLight,
  'icon-barrier': FaRoadBarrier,
  'icon-stop': BsSignStop,
  'icon-yield': BsSignYieldFill,
  'icon-speed-bump': PiWarningDiamondFill,
};
```

Naming convention: kebab-case `icon-*`. The id is what cold-layer
GeoJSON features reference via `properties.icon`, and what MapLibre
style expressions look up:

```js
'icon-image': ['get', 'icon']
```

### Rasterisation pipeline

```ts
async function rasterize(Icon: ComponentType<IconProps>): Promise<ImageData> {
  const node = createElement(Icon, { size: ICON_PX, color: ICON_COLOR });
  const inner = renderToStaticMarkup(node);
  const svg = inner.includes('xmlns=')
    ? inner
    : inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(ICON_PX, ICON_PX);
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('icon svg load failed'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.clearRect(0, 0, ICON_PX, ICON_PX);
    ctx.drawImage(img, 0, 0, ICON_PX, ICON_PX);
    return ctx.getImageData(0, 0, ICON_PX, ICON_PX);
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

Five stages:

1. **React render to static markup.** `renderToStaticMarkup` produces
   a string of HTML; for an icon component this is the SVG element.
2. **xmlns shim.** React-Icons doesn't always include the SVG xmlns
   attribute. `<Image>` requires it to load the blob. The shim is a
   simple string replace.
3. **Blob URL.** SVG → `Blob` → `URL.createObjectURL`. The URL is
   revoked in `finally` so it doesn't leak even if `Image` errors.
4. **Image decode.** `Image.onload` resolves an `HTMLImageElement`
   that the canvas can draw.
5. **Canvas rasterise.** `drawImage` + `getImageData` returns the RGBA
   `ImageData` that `map.addImage` expects.

### `ICON_COLOR = '#ffffff'`

Every icon is rendered white so the layer can tint it via
`icon-color`. MapLibre's image-tint is a multiplicative filter — a
pure white source can be coloured arbitrarily without anti-aliasing
artefacts.

### `registerMapIcons`

```ts
export async function registerMapIcons(map: MapIconRegistry): Promise<void> {
  const tasks = Object.entries(REGISTRY).map(async ([id, Icon]) => {
    if (map.hasImage(id)) return;
    try {
      const data = await rasterize(Icon);
      if (!map.hasImage(id)) map.addImage(id, data);
    } catch (err) {
      console.error(`[mapIcons] failed to register ${id}`, err);
    }
  });
  await Promise.all(tasks);
}
```

Three robustness properties:

- **Idempotent.** The first `hasImage(id)` check skips icons already
  registered; a second `hasImage(id)` after the async rasterisation
  defends against a race where another HMR / re-mount registered the
  icon while we awaited.
- **Per-icon try/catch.** A failed icon (e.g. invalid SVG markup
  upstream) does not abort the whole batch — the error is logged and
  the other icons proceed.
- **Loose map type.** The function accepts `Pick<Map, 'hasImage' |
'addImage'>`, making it easy to mock in unit tests without a full
  MapLibre instance.

## Examples

### Wire into the map lifecycle

```ts
// src/hooks/useMap.ts (sketch)
import { registerMapIcons } from '@/lib/mapIcons';

map.on('load', async () => {
  await registerMapIcons(map);
  // safe to add symbol layers now
});
```

### Use in a MapLibre style

```js
{
  id: 'cold-symbols',
  type: 'symbol',
  source: 'cold',
  filter: ['has', 'icon'],
  layout: {
    'icon-image': ['get', 'icon'],
    'icon-size': 0.35,
    'icon-allow-overlap': true,
  },
  paint: {
    'icon-color': '#ffffff',  // tint as needed
  },
}
```

### Reference an icon from a feature

```ts
const feature: GeoJSON.Feature<GeoJSON.Point> = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { icon: 'icon-signal', entityId: 'signal_3' },
};
```

### Add a new icon

1. Import the React-Icons component at the top of `mapIcons.ts`.
2. Add an entry to `REGISTRY` with a kebab-case id.
3. Reference the id from any feature `properties.icon`.

The icon is registered automatically on the next `registerMapIcons`
call — no other wiring needed.

## Related

- [/api/core/cold-layer](/api/core/cold-layer) — produces features
  with `properties.icon` set.
- [/api/hooks/use-map](/api/hooks/use-map) — calls `registerMapIcons`
  after `map.on('load')`.
- [Geo JSON Helpers](./geo-json-helpers.md) — hot-layer counterpart
  (no icon registration; uses circles for handles).
