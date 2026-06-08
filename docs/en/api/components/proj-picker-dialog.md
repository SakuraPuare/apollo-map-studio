---
title: ProjPickerDialog
description: 'Modal that opens whenever an Apollo map is imported without a Header.projection.proj — three input modes: region preset / UTM zone / custom PROJ.4.'
---

# ProjPickerDialog

> Source: `src/components/dialogs/ProjPickerDialog.tsx`

## Purpose & UX role

`ProjPickerDialog` is the **last guardrail** of the Apollo `.bin/.txt` import pipeline. Apollo's `Map.header.projection.proj` is a PROJ.4 string and drives every conversion from local-metric coordinates to WGS84. When the file is missing this field, the editor cannot resolve local coordinates into longitude/latitude — this dialog steps in to let the user choose:

1. **Region preset**: 4 presets (Sunnyvale / Beijing / Shanghai / Shenzhen, covering the canonical Apollo borregas demo and common Chinese fleets).
2. **UTM zone**: manual UTM zone (1–60) + hemisphere (N/S).
3. **Custom PROJ**: paste any PROJ.4 string; sanitized automatically (Apollo template braces `+lat_0={37.4}` are stripped).

A live preview at the bottom shows the **resolved PROJ string**, so the user can sanity-check before clicking "Use this projection".

## Component API

`ProjPickerDialog` takes no props. It communicates with the outside world via `useProjDialogStore`:

```ts
export function ProjPickerDialog(): JSX.Element | null;

// External callers:
const { resolve } = useProjDialogStore.getState();
useProjDialogStore.getState().request(); // returns Promise<string | null>
```

| Store field          | Description                                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| `pending: boolean`   | Whether a request is awaiting input                                         |
| `resolve(s \| null)` | Called by the dialog on submit — returns the PROJ.4 string or null (cancel) |

If `resolve(null)` is invoked, the import pipeline aborts and the file is not loaded into `mapStore`.

## Internal state

```ts
type Mode = 'preset' | 'utm' | 'custom';
```

| `useState`                  | Initial     | Description               |
| --------------------------- | ----------- | ------------------------- |
| `mode: Mode`                | `'preset'`  | Tab switch                |
| `preset: PresetEntry['id']` | `'beijing'` | Currently selected preset |
| `zone: number`              | `50`        | UTM zone number           |
| `hemisphere: 'N' \| 'S'`    | `'N'`       | Hemisphere                |
| `custom: string`            | `''`        | Pasted custom PROJ        |

Every time the dialog reopens (`pending` flips false → true), `useEffect([pending])` resets all 5 state atoms (`ProjPickerDialog.tsx:38-46`), preventing stale carry-over.

## Side effects

| When                                | Behavior                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| `useEffect([pending])` reset        | Reset all state on open                                   |
| `useEffect([pending, resolve])` Esc | Mounts a global `keydown` listener; Esc → `resolve(null)` |
| `submit()` button / Enter           | Calls `resolve(computed)` if `canSubmit` is true          |
| Backdrop click                      | `resolve(null)`                                           |

`computed` derivation (`ProjPickerDialog.tsx:63-67`):

```ts
const computed =
  mode === 'preset'
    ? UTM_PRESETS[preset]
    : mode === 'utm'
      ? utmProjString(zone, hemisphere)
      : sanitizeProjString(custom);
```

## Render anatomy

```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => resolve(null)} />
  <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
    <Header title="Choose Coordinate System" hint="imported map has no Header.projection.proj" onClose={() => resolve(null)} />
    <div className="px-5 py-4 space-y-4">
      <ModeTabs mode={mode} setMode={setMode} />
      {mode === 'preset' && <PresetList … />}
      {mode === 'utm' && <UTMInputs … />}
      {mode === 'custom' && <CustomTextarea … />}
      <ResolvedPreview computed={computed} />
    </div>
    <Footer cancel={() => resolve(null)} submit={submit} canSubmit={canSubmit} />
  </div>
</div>
```

## Helpers

Imported from `@/io/proto/projection`:

- `UTM_PRESETS: Record<id, projString>` — preset dictionary
- `utmProjString(zone, hemisphere)` — `+proj=utm +zone={n} +ellps=WGS84 +datum=WGS84 +units=m +no_defs` (north omits `+south`)
- `sanitizeProjString(custom)` — strips `{...}` templates, trims whitespace, validates basic shape

## Performance notes

- Single modal — no real performance concern.
- The Esc listener mounts only while `pending=true`; it is detached on close.
- The preset list is a 4-element constant array — no virtualization needed.

## Known gaps

- **No EPSG code support**: e.g. `EPSG:32650`. A proper implementation would need the `proj4` library for lookup.
- No "test projection" round-trip — the preview is just a string, not a forward/inverse sanity check.
- The preset list is hardcoded; a future enhancement could add "Recently used" or "Project-saved".

## Source map

| Concern               | File location                  |
| --------------------- | ------------------------------ |
| Main component        | `ProjPickerDialog.tsx:27-230`  |
| `PRESETS` constant    | `ProjPickerDialog.tsx:14-19`   |
| Reset effect          | `ProjPickerDialog.tsx:38-46`   |
| Esc listener          | `ProjPickerDialog.tsx:48-59`   |
| `computed` derivation | `ProjPickerDialog.tsx:63-67`   |
| Mode tabs             | `ProjPickerDialog.tsx:103-117` |
| Preset list           | `ProjPickerDialog.tsx:119-144` |
| UTM inputs            | `ProjPickerDialog.tsx:146-179` |
| Custom textarea       | `ProjPickerDialog.tsx:181-196` |
| Resolved preview      | `ProjPickerDialog.tsx:198-204` |
| Footer cancel/submit  | `ProjPickerDialog.tsx:206-227` |
| Projection helpers    | `src/io/proto/projection.ts`   |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — mounts `LazyProjPickerDialog`
- [`projDialogStore`](/en/api/store/) — request/resolve API
- Apollo import → `src/io/mapIO.ts` → `src/io/apolloIO.worker.ts` (message contract in `src/io/apolloIOProtocol.ts`)
- Projection helpers → `src/io/proto/projection.ts`
