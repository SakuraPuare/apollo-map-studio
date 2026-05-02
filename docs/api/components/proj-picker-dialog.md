# ProjPickerDialog

> Source: `src/components/dialogs/ProjPickerDialog.tsx`

## Overview

`ProjPickerDialog` is the modal that opens whenever an Apollo `.bin`
or `.txt` map is imported without a `Header.projection.proj` value.
The user picks one of three modes — region preset, UTM zone number,
or a custom PROJ.4 string — and the dialog resolves the pending
import promise so the worker can finish projection.

It's the only modal that's conditionally mounted by
`WorkspaceLayout` rather than the action dispatcher, because it's
triggered from a non-React caller (the IO worker bridge).

## Component props

```ts
export function ProjPickerDialog(): JSX.Element | null;
```

No props. Reads `useProjDialogStore` for the pending request and
calls `resolve(string | null)` when the user chooses or cancels.

## Behavior

### Three modes

| Mode     | Resolves to                                                       |
| -------- | ----------------------------------------------------------------- |
| `preset` | One of `UTM_PRESETS[id]` (Sunnyvale, Beijing, Shanghai, Shenzhen) |
| `utm`    | `utmProjString(zone, hemisphere)`                                 |
| `custom` | `sanitizeProjString(text)` — strips Apollo `{template}` braces    |

### Region presets

```ts
const PRESETS: PresetEntry[] = [
  { id: 'sunnyvale', label: 'Sunnyvale, CA (UTM 10N)', hint: 'Apollo borregas demo' },
  { id: 'beijing', label: 'Beijing (UTM 50N)', hint: 'Most common Chinese fleet' },
  { id: 'shanghai', label: 'Shanghai (UTM 51N)' },
  { id: 'shenzhen', label: 'Shenzhen (UTM 50N)' },
];
```

The radio list defaults to Beijing — the most common case for the
target user base. The hint column documents notable demos / fleets.

### UTM mode

```tsx
<input type="number" min={1} max={60} value={zone} onChange={...} />
<button>Northern (N)</button>
<button>Southern (S)</button>
```

The zone input is bounded to `[1, 60]`. Hemisphere is a two-button
segmented control.

### Custom mode

```tsx
<textarea
  value={custom}
  placeholder="+proj=utm +zone=50 +ellps=WGS84 +datum=WGS84 +units=m +no_defs"
/>
```

The dialog runs `sanitizeProjString(text)` on resolve. The sanitiser
strips Apollo's template-style braces (e.g. `+lat_0={37.4}` → `+lat_0=37.4`)
so unfilled-in templates round-trip cleanly.

### Live preview

```tsx
<div className="text-zinc-500">Resolved</div>
<div className="font-mono break-all">{computed || '— enter a PROJ string above —'}</div>
```

Each keystroke / radio change recomputes the resolved PROJ string
live so the user sees exactly what the IO worker will receive.

### Reset on open

```ts
useEffect(() => {
  if (pending) {
    setMode('preset');
    setPreset('beijing');
    setZone(50);
    setHemisphere('N');
    setCustom('');
  }
}, [pending]);
```

Each new request starts from a clean Beijing preset, so a previous
custom entry doesn't bleed into the next import.

### Resolve / cancel

| Action                        | Effect                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Click "Use this projection"   | `resolve(computed)` — IO worker proceeds with this PROJ                         |
| Click Cancel / backdrop / ESC | `resolve(null)` — IO worker aborts the import (or falls back per-bridge policy) |

## ProjDialog store contract

```ts
interface ProjDialogStore {
  pending: boolean; // dialog open/closed
  resolve: (s: string | null) => void;
  request(): Promise<string | null>; // called from IO worker bridge
}
```

`request()` returns a promise that the dialog resolves. The IO
worker awaits it; on `null` it gives up the import.

## Examples

### Mounting

```tsx
<Suspense fallback={null}>
  <LazyProjPickerDialog />
</Suspense>
```

The dialog is lazy-loaded so its bundle stays out of the initial
render — most sessions never trigger an import.

### Triggering from a worker bridge

```ts
import { useProjDialogStore } from '@/store/projDialogStore';

const proj = await useProjDialogStore.getState().request();
if (proj) {
  return await projectMap(rawProto, proj);
}
throw new Error('No projection chosen — import aborted');
```

### UTM helpers

```ts
import { UTM_PRESETS, utmProjString, sanitizeProjString } from '@/io/proto/projection';

UTM_PRESETS.beijing; // pre-baked PROJ.4 string
utmProjString(50, 'N'); // dynamic zone build
sanitizeProjString('+proj=utm +zone={50} +north'); // strips braces
```

These are imported by both the dialog and the IO worker — single
source of truth for PROJ generation.

## Related

- [Apollo IO pipeline](/api/io/import-parse-base-map)
- [projection module](/api/io/proto-loader)
- [useApolloLayer](/api/hooks/use-apollo-layer)
- [apolloMapStore](/api/store/apollo-map-store)
