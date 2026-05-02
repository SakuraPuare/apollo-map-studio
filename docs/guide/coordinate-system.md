# Coordinate system

Apollo HD maps store geometry in a local UTM frame in meters. The editor
displays geometry in WGS84 lng/lat on a MapLibre web-mercator basemap.
The PROJ.4 string in the imported map's `Header.projection.proj` defines
the transform; if it's missing, the editor prompts for one. This page
covers the projection picker, the coordinate transforms, and how to
recover from a wrong projection.

## Source map

| Concern                                    | File                                          |
| ------------------------------------------ | --------------------------------------------- |
| Coordinate conversions (GeoPoint ↔ LngLat) | `src/core/geometry/coords.ts`                 |
| Projection module (proj4 wrapper)          | `src/io/proto/projection.ts`                  |
| Projection picker dialog                   | `src/components/dialogs/ProjPickerDialog.tsx` |
| Picker store                               | `src/store/projDialogStore.ts`                |
| Imported-map metadata                      | `src/store/apolloMapStore.ts`                 |
| UTM presets                                | `UTM_PRESETS` in `projection.ts:75`           |

## The two coordinate systems

| System                        | Used by                                                   | Units   |
| ----------------------------- | --------------------------------------------------------- | ------- |
| WGS84 lng/lat                 | MapLibre, on-screen rendering, `GeoPoint`, `LngLat`       | degrees |
| Local UTM (Apollo `PointENU`) | Apollo proto `central_curve.points`, all geometry on disk | meters  |

The editor's runtime works exclusively in WGS84. Apollo proto coordinates
in `PointENU` (UTM meters) are converted to WGS84 lng/lat on import and
back to UTM on export.

::: tip Why WGS84 internally
MapLibre's basemap is web-mercator. Authoring in lng/lat aligns directly
with what's on screen. Doing geometry in UTM meters and projecting on
every render frame would be unnecessary computation; the conversion
happens once per import/export.
:::

## The PROJ.4 string

Apollo `Header.projection.proj` is a PROJ.4 string. Examples:

| Region                             | PROJ.4 string                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sunnyvale, CA                      | `+proj=utm +zone=10 +ellps=WGS84 +datum=WGS84 +units=m +no_defs`                                                 |
| Beijing                            | `+proj=utm +zone=50 +ellps=WGS84 +datum=WGS84 +units=m +no_defs`                                                 |
| Shanghai                           | `+proj=utm +zone=51 +ellps=WGS84 +datum=WGS84 +units=m +no_defs`                                                 |
| Custom Sunnyvale (Apollo Borregas) | `+proj=tmerc +lat_0=37.413082 +lon_0=-122.013929 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs` |

The Apollo Borregas map ships with a `+proj=tmerc` string with template
braces (`+lat_0={37.413082}`). proj4 can't parse braces; the
`sanitizeProjString()` helper (`projection.ts:10`) strips them
automatically before parsing.

::: warning Apollo template-style braces are stripped
A proj string like `+proj=tmerc +lat_0={37.413082} +lon_0={-122.013929}`
is valid Apollo input but invalid PROJ.4. The sanitizer in
`projection.ts:10` removes the braces. If you author your own proj
strings, leave the braces out.
:::

## Projection picker dialog

Source: `src/components/dialogs/ProjPickerDialog.tsx`

Opens automatically when an Apollo map is imported without a
`Header.projection.proj` value. The dialog has three modes:

### Mode 1 — Region preset

Four canned options, defined in `projection.ts:75`:

| Preset                  | PROJ.4                   |
| ----------------------- | ------------------------ |
| Sunnyvale, CA (UTM 10N) | `utmProjString(10, 'N')` |
| Beijing (UTM 50N)       | `utmProjString(50, 'N')` |
| Shanghai (UTM 51N)      | `utmProjString(51, 'N')` |
| Shenzhen (UTM 50N)      | `utmProjString(50, 'N')` |

### Mode 2 — UTM zone

Two inputs: zone number (1–60) and hemisphere (N/S). Builds a UTM
PROJ.4 string via `utmProjString(zone, hemisphere)`. The most flexible
option for "I know the UTM zone" cases.

### Mode 3 — Custom PROJ

A textarea where you paste any PROJ.4 string. Apollo template-style
braces are stripped automatically by the sanitizer. The dialog shows
the resolved string before submitting.

::: tip Cancel = fallback projection
Pressing Cancel resolves the dialog with `null`. The current
`apolloIOBridge` falls back to `UTM_PRESETS.beijing` so import can still
finish. Re-import and choose the correct projection if the map appears in the
wrong region.
:::

::: warning Wrong projection = visually offset map
If you pick the wrong projection (e.g. UTM 50N for a Sunnyvale map),
the geometry will appear in the wrong place — typically miles away
from where it should be. The map still loads; it's just at the wrong
place on the basemap. Re-import with the correct projection.
:::

## What changes when projection changes

Switching projection is a **destructive** operation: every coordinate
in `mapStore.entities` is in lng/lat, and re-projecting them
back-and-forth introduces floating-point drift. The editor's design
assumption is that projection is fixed for the lifetime of an import.

| Operation                                 | Re-projects?                                                    |
| ----------------------------------------- | --------------------------------------------------------------- |
| Import (with projection in header)        | Yes — header proj used                                          |
| Import (no projection in header → picker) | Yes — user-chosen proj used                                     |
| Edit / draw / move                        | No — coordinates stay in lng/lat                                |
| Export                                    | Yes — back to UTM meters using `apolloMapStore.info.projString` |
| Re-import a different file                | New projection from the new file's header                       |

If you need to switch projections mid-session: export the current map,
delete the editor state, re-import, pick a different projection. There
is no in-place re-projection UI.

## Coordinate helpers

`src/core/geometry/coords.ts` exposes the lng/lat ↔ GeoPoint helpers used
across the codebase:

```ts
toLngLat(p: GeoPoint): LngLat            // [x, y]  ← {x, y}
toGeoPoint(p: LngLat): GeoPoint          // {x, y}  ← [x, y]
pointsToCoords(points: GeoPoint[]): LngLat[]
coordsToPoints(coords: LngLat[]): GeoPoint[]
```

These are pure helpers that do no projection — they convert between the
two in-memory shapes. Both are in WGS84 lng/lat.

## Projection at runtime (export path)

On export, `apolloIO.worker.ts` reads `apolloMapStore.info.projString`
and creates a `Projection` via `makeProjection()`:

```ts
const proj = makeProjection(projString);
// For each GeoPoint in lng/lat:
const utmPoint = proj.fromLonLat({ x: lng, y: lat });
//  utmPoint is now in UTM meters
//  Stored as Apollo PointENU
```

The reverse on import:

```ts
const proj = makeProjection(headerProj || userPickedProj);
// For each PointENU in UTM:
const wgs = proj.toLonLat({ x: utmEast, y: utmNorth });
// stored as GeoPoint in WGS84
```

::: tip Per-import projection
The projection is stored on `apolloMapStore.info.projString` per-import.
Multiple imports in the same session would each carry their own
projection. The current store assumes a single active map, so this
isn't exercised — re-importing replaces the previous map entirely.
:::

## Inferring zone from longitude

If you know your map's WGS84 longitude but not the UTM zone, use
`utmZoneFromLon(lonDeg)` (`projection.ts:61`):

```ts
utmZoneFromLon(116.4); // 50  (Beijing)
utmZoneFromLon(-122.0); // 10  (Sunnyvale)
utmZoneFromLon(121.5); // 51  (Shanghai)
```

UTM zones are 6° wide starting at -180. Hemisphere is N for positive
latitudes, S for negative.

## Common projection scenarios

### Apollo Borregas demo map

The demo ships with a `+proj=tmerc` string with template braces. The
sanitizer strips them; no picker prompt because the header is present.

### Self-collected fleet map (no header)

Picker opens. Pick the appropriate UTM zone for your collection
region (or paste your fleet's PROJ.4 string).

### Re-importing after edit

The previous projection is discarded. The new file's header (or
picker) drives the new transform.

### Map straddling UTM zone boundaries

Pick one zone for the whole map. Apollo's coordinate system is
single-zone by design; if your geometry truly spans multiple zones,
you'll see distortion at the edges. Split the map into per-zone
sub-maps in this case.

## Where to next

- [Importing](/guide/import) — file picker flow that triggers the
  projection picker.
- [Exporting](/guide/export) — projection used to re-encode UTM.
- [Architecture / IO pipeline](/architecture/worker-protocol) — full
  worker-backed encode/decode.
- Projection mismatch: re-import with the correct projection string or UTM
  zone.
