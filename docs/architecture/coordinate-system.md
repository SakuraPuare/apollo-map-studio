# Coordinate System

Apollo HD maps use **ENU (East-North-Up)** coordinates in meters, with a user-defined local origin. The editor stores all geometry in **WGS84 longitude/latitude** (GeoJSON standard) and converts to ENU only at export time.

## WGS84 (editor storage)

All `LaneFeature`, `JunctionFeature`, and other editor types hold GeoJSON `Feature` objects whose coordinates are `[longitude, latitude]` pairs in WGS84.

Advantages:

- MapLibre GL natively renders WGS84 GeoJSON
- `turf.js` functions (distance, offset, intersection) operate on WGS84 directly
- No precision loss from repeated ENU↔WGS84 conversions during editing

## ENU (Apollo export format)

Apollo's `PointENU` type is:

```proto
message PointENU {
  double x = 1;  // East, meters
  double y = 2;  // North, meters
  double z = 3;  // Up, meters (default 0 for 2D maps)
}
```

All coordinates in `base_map.bin` and `sim_map.bin` are in ENU relative to the project origin.

## Projection

The editor uses a **Transverse Mercator** projection centered on the project origin, via `proj4`:

```ts
const projStr =
  `+proj=tmerc +lat_0=${originLat} +lon_0=${originLon}` + ` +k=1 +ellps=WGS84 +no_defs`
```

This matches the projection string Apollo writes to `MapHeader.projection.proj`.

### API

```ts
import { createProjection, setGlobalProjection, lngLatToENU } from './geo/projection'

// Create a projection for a specific origin
const proj = createProjection(37.4, -122.0)

// WGS84 → ENU
const [easting, northing] = proj.toENU(-122.0012, 37.4008)
// → approximately [95.8, 88.5]

// ENU → WGS84
const [lng, lat] = proj.toLngLat(95.8, 88.5)
// → approximately [-122.0012, 37.4008]
```

### Global projection singleton

During a session, `setGlobalProjection(lat, lon)` stores the active projection. `lngLatToENU(lng, lat)` uses this singleton, so the export functions don't need to pass projection objects through every call.

```ts
setGlobalProjection(37.4, -122.0)
const enu = lngLatToENU(-122.0012, 37.4008)
// → { x: 95.8, y: 88.5, z: 0 }
```

## Accuracy

Transverse Mercator distortion is negligible for HD map areas:

| Distance from origin | Linear error |
| -------------------- | ------------ |
| 1 km                 | < 0.1 mm     |
| 10 km                | < 1 cm       |
| 50 km                | ~2.5 cm      |
| 100 km               | ~10 cm       |

For city-scale maps (< 20 km across), ENU precision exceeds what mapbox-gl-draw can represent anyway (limited by float64 in GeoJSON).

## Coordinate frame in exports

The `MapHeader` proto records the origin:

```proto
header {
  version: "1.0.0"
  date: "2026-02-19"
  projection {
    proj: "+proj=tmerc +lat_0=37.4 +lon_0=-122.0 +k=1 +ellps=WGS84 +no_defs"
  }
}
```

Apollo modules read this string to initialize their own `proj4` projection, so the ENU → WGS84 conversion is exact when loading the map in Dreamview or the planning module.

## z-coordinate

All exported `PointENU.z` values are `0`. Apollo Map Studio is a 2D editor. For maps with elevation (highway overpasses, tunnels), you would need to post-process the exported `base_map.bin` and set z values externally.
