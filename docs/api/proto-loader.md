# io/proto/loader

Apollo `.proto` loading using `protobufjs`.

## loadApolloProtoRoot

```ts
function loadApolloProtoRoot(): Promise<protobuf.Root>;
```

Loads the bundled Apollo HD map schema from `src/proto/`, returning a resolved
`protobuf.Root`. The root is cached after the first call.

**Example**

```ts
const root = await loadApolloProtoRoot();
const MapType = root.lookupType('apollo.hdmap.Map');
```

## Path Resolution

The loader uses `import.meta.glob('/src/proto/**/*.proto', { query: '?raw' })`
so Vite bundles every proto file as raw text. Apollo imports use paths such as:

```proto
import "map_msgs/map_lane.proto";
```

`protobufjs` would normally resolve that relative to the importing file. The
loader instead treats every import as root-relative:

```ts
root.resolvePath = (_origin, target) => target;
```

## getMapType

```ts
async function getMapType(): Promise<protobuf.Type>;
```

Loads the bundled schema and returns the `apollo.hdmap.Map` type.

## Proto Files

Files are bundled from `src/proto/`:

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
| `geometry.proto`          | `apollo.common.PointENU`               |
