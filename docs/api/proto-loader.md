# proto/loader

Dynamic `.proto` file loading using `protobufjs`.

## loadProtoRoot

```ts
async function loadProtoRoot(protoFile: string): Promise<protobuf.Root>
```

Loads a `.proto` file and all its transitive imports from `public/proto/`, returning a resolved `protobuf.Root`.

**Parameters**

| Name        | Type     | Description                                               |
| ----------- | -------- | --------------------------------------------------------- |
| `protoFile` | `string` | Filename only, e.g. `'map.proto'` or `'topo_graph.proto'` |

**Example**

```ts
const root = await loadProtoRoot('map.proto')
const MapType = root.lookupType('apollo.hdmap.Map')
```

**Path resolution**

Apollo proto files use fully-qualified import paths such as:

```proto
import "modules/common_msgs/map_msgs/map_lane.proto";
```

The loader overrides `root.resolvePath` to strip the deep path and serve all files from `/proto/`:

```ts
root.resolvePath = (_origin, target) => {
  const filename = target.split('/').pop()!
  return `/proto/${filename}`
}
```

---

## getMapType

```ts
async function getMapType(): Promise<protobuf.Type>
```

Convenience wrapper — loads `map.proto` and returns the `apollo.hdmap.Map` type.

---

## getGraphType

```ts
async function getGraphType(): Promise<protobuf.Type>
```

Convenience wrapper — loads `topo_graph.proto` and returns the `apollo.routing.Graph` type.

---

## Proto files available

All files are in `public/proto/`:

| File                      | Top-level type                         |
| ------------------------- | -------------------------------------- |
| `map.proto`               | `apollo.hdmap.Map`                     |
| `map_lane.proto`          | `apollo.hdmap.Lane`                    |
| `map_road.proto`          | `apollo.hdmap.Road`                    |
| `map_junction.proto`      | `apollo.hdmap.Junction`                |
| `map_signal.proto`        | `apollo.hdmap.Signal`                  |
| `map_stop_sign.proto`     | `apollo.hdmap.StopSign`                |
| `map_crosswalk.proto`     | `apollo.hdmap.Crosswalk`               |
| `map_clear_area.proto`    | `apollo.hdmap.ClearArea`               |
| `map_speed_bump.proto`    | `apollo.hdmap.SpeedBump`               |
| `map_parking_space.proto` | `apollo.hdmap.ParkingSpace`            |
| `map_overlap.proto`       | `apollo.hdmap.Overlap`                 |
| `map_geometry.proto`      | `apollo.hdmap.Curve`, `PointENU`, etc. |
| `map_id.proto`            | `apollo.hdmap.Id`                      |
| `topo_graph.proto`        | `apollo.routing.Graph`                 |
| `geometry.proto`          | `apollo.common.PointENU`               |
