# import/parseBaseMap

Decodes a `base_map.bin` binary buffer and restores it as editor GeoJSON state.

## parseBaseMap

```ts
async function parseBaseMap(buffer: Uint8Array): Promise<ParsedMapState>
```

**Parameters**

| Name     | Type         | Description                        |
| -------- | ------------ | ---------------------------------- |
| `buffer` | `Uint8Array` | Raw bytes of a `base_map.bin` file |

**Returns**

```ts
interface ParsedMapState {
  project: ProjectConfig
  lanes: LaneFeature[]
  junctions: JunctionFeature[]
  signals: SignalFeature[]
  stopSigns: StopSignFeature[]
  crosswalks: CrosswalkFeature[]
  clearAreas: ClearAreaFeature[]
  speedBumps: SpeedBumpFeature[]
  parkingSpaces: ParkingSpaceFeature[]
  roads: RoadDefinition[]
}
```

**Steps**

1. `decodeMap(buffer)` — binary → `ApolloMap` JS object
2. Extract `originLat` / `originLon` from `map.header.projection.proj`
3. `setGlobalProjection(originLat, originLon)`
4. For each `ApolloLane`:
   - Convert `central_curve` PointENU → WGS84 `LineString`
   - Estimate width from `left_sample` + `right_sample` averages
   - Extract boundary types from `left_boundary.boundary_type[0].types[0]`
   - Restore topology IDs from `predecessor_id`, `successor_id`, etc.
5. For each polygon element (junction, crosswalk, clear area, parking space):
   - Convert `polygon.point[]` PointENU → WGS84 `Polygon`
6. For each line element (stop sign, speed bump):
   - Convert `stop_line[0]` or `position[0]` curve → WGS84 `LineString`
7. For each signal:
   - Convert stop line → WGS84 `LineString`
   - Derive position from stop line midpoint

**Example**

```ts
const buffer = new Uint8Array(await file.arrayBuffer())
const parsed = await parseBaseMap(buffer)

useMapStore.getState().setProject(parsed.project)
useMapStore.getState().loadState({
  lanes: Object.fromEntries(parsed.lanes.map((l) => [l.id, l])),
  // ...
})
```

---

## parseProjString (internal)

```ts
function parseProjString(projStr: string): { lat: number; lon: number } | null
```

Extracts `+lat_0` and `+lon_0` values from a proj4 string using regex. Returns `null` if the string is absent or malformed.

---

## Width estimation

```ts
const widthSamples = lane.leftSample.map((s, i) => {
  const rightS = lane.rightSample[i]
  return s.width + (rightS?.width ?? s.width)
})
const width = mean(widthSamples) || 3.75
```

This produces a single uniform width value, which is acceptable for lanes with approximately constant width.

---

## Header bytes decoding

Proto `Header` fields `version`, `date`, `district`, and `vendor` are `bytes` type. The `bytesToString()` helper decodes them from base64 (protobufjs `toObject` output) or `Uint8Array` back to UTF-8 strings.

## Known limitations

- `overlap_id` arrays are not restored (recomputed on next export)
- Signal `subsignal` geometry is not restored
- `z` coordinates are discarded (editor is 2D)
