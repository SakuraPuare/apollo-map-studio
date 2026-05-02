# Coordinate System

Apollo Map Studio keeps editor geometry in WGS84 longitude/latitude and
converts to/from Apollo `PointENU` only at the IO boundary.

## Storage Model

`GeoPoint` is defined in `src/types/entities.ts`:

```ts
interface GeoPoint {
  x: number; // longitude in editor state
  y: number; // latitude in editor state
  z?: number;
}
```

The name `PointENU` still appears as a compatibility alias in TypeScript
types, but once a map is inside the editor, `x/y` are lon/lat degrees. This
matches GeoJSON and MapLibre's native coordinate convention.

## Apollo File Model

Apollo proto files use `.apollo.common.PointENU` with meter coordinates:

```proto
message PointENU {
  optional double x = 1;
  optional double y = 2;
  optional double z = 3;
}
```

The coordinate reference system is described by `Map.header.projection.proj`.
Real Apollo sample maps may store PROJ strings with numeric values wrapped in
braces, for example `+lat_0={37.413082}`; `sanitizeProjString()` strips those
braces before passing the string to `proj4`.

## Projection Module

Source: `src/io/proto/projection.ts`.

| Function                          | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `sanitizeProjString(s)`           | Remove Apollo `{...}` numeric placeholders and trim whitespace. |
| `makeProjection(projString)`      | Build a bidirectional `Projection` from PROJ.4 to WGS84.        |
| `utmProjString(zone, hemisphere)` | Build a UTM PROJ string for user fallback.                      |
| `utmZoneFromLon(lonDeg)`          | Infer a UTM zone from a known longitude.                        |
| `UTM_PRESETS`                     | `sunnyvale`, `beijing`, `shanghai`, `shenzhen`.                 |

`makeProjection()` returns:

```ts
interface Projection {
  readonly projString: string;
  toLonLat(p: PointXY): PointXY;
  fromLonLat(p: PointXY): PointXY;
}
```

`z` is preserved when present. The conversion only transforms `x/y`.

## Recursive Proto Walk

`src/io/proto/adapter.ts` does not hand-code every coordinate field. It uses
`protobufjs` reflection:

```ts
transformPointsInMessage(type, msg, transform);
```

The function walks the decoded `Map` tree and applies `transform` whenever the
current protobuf type is `.apollo.common.PointENU`. This is why newly supported
Apollo messages that reuse `PointENU` get coordinate conversion without a new
manual loop.

Import:

```text
decode bin/text
  -> readHeaderProjString()
  -> apolloMapToLonLat()
  -> PointENU x/y become lon/lat
  -> apolloMapToEntities()
```

Export:

```text
entitiesToApolloMap()
  -> apolloMapFromLonLat()
  -> PointENU x/y become projected meters
  -> encode bin/text
```

## Missing Projection Handling

If an imported map has no usable `header.projection.proj`, the worker sends
`NEEDS_PROJECTION`. The bridge opens `ProjPickerDialog` through
`projDialogStore.request()`. If the user cancels, the bridge falls back to
`UTM_PRESETS.beijing` so the import can still complete.

That fallback is a usability choice, not a guarantee of geographic accuracy.
For production map editing, use the projection that matches the original
Apollo map region.

## Geometry Calculations In The Editor

Most editing-time geometry uses approximate local meter math:

- `METERS_PER_DEGREE = 111_319.5` in `src/config/mapConstants.ts`.
- longitude deltas are scaled by `cos(latitude)` where needed.
- hit testing scales latitude radius in high latitudes.
- lane topology quantizes endpoints with `toFixed(6)` degrees.

This is sufficient for editor interaction and topology heuristics. File
fidelity comes from projecting back through the original PROJ string at export.

## z Values

The editor preserves `z` when it exists in imported `PointENU`, but the drawing
tools are 2D. Newly drawn or derived geometry generally has no `z`; export
therefore does not synthesize elevation. Maps requiring detailed elevation
should be post-processed or imported from an Apollo source that already carries
z data.
