# geo/projection

WGS84 ↔ ENU coordinate conversion using `proj4`.

## createProjection

```ts
function createProjection(
  originLat: number,
  originLon: number
): {
  toENU: (lng: number, lat: number) => [number, number]
  toLngLat: (x: number, y: number) => [number, number]
}
```

Creates a Transverse Mercator projection centered on `(originLat, originLon)`.

**Parameters**

| Name        | Type     | Description                                |
| ----------- | -------- | ------------------------------------------ |
| `originLat` | `number` | WGS84 latitude of the ENU origin, degrees  |
| `originLon` | `number` | WGS84 longitude of the ENU origin, degrees |

**Returns** an object with two conversion functions:

- `toENU(lng, lat)` — converts a WGS84 point to `[easting_m, northing_m]`
- `toLngLat(x, y)` — converts ENU meters back to `[longitude, latitude]`

**Example**

```ts
const proj = createProjection(37.4, -122.0)

const [e, n] = proj.toENU(-122.0012, 37.4008)
// e ≈ -95.8, n ≈ 88.5

const [lng, lat] = proj.toLngLat(e, n)
// lng ≈ -122.0012, lat ≈ 37.4008
```

---

## setGlobalProjection

```ts
function setGlobalProjection(
  originLat: number,
  originLon: number
): ReturnType<typeof createProjection>
```

Creates a projection and stores it as the module-level singleton. Returns the same object as `createProjection`.

Called once during **New Project** creation and once during **import** (to restore the origin from the proto header).

---

## getGlobalProjection

```ts
function getGlobalProjection(): ReturnType<typeof createProjection> | null
```

Returns the current global projection, or `null` if not yet initialized.

---

## lngLatToENU

```ts
function lngLatToENU(lng: number, lat: number): PointENU
```

Convenience wrapper around the global projection's `toENU`. Returns a `PointENU` object:

```ts
{ x: easting_m, y: northing_m, z: 0 }
```

Used extensively in `buildBaseMap.ts` to convert each GeoJSON coordinate.

**Throws** if no global projection has been set via `setGlobalProjection`.
