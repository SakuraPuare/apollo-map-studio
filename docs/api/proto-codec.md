# proto/codec

Protobuf encode/decode and browser file download utilities.

## encodeMap

```ts
async function encodeMap(mapObj: ApolloMap): Promise<Uint8Array>
```

Encodes an `ApolloMap` JavaScript object to Protocol Buffer binary format.

1. Loads `map.proto` via `loadProtoRoot`
2. Looks up `apollo.hdmap.Map`
3. Calls `MapType.verify(mapObj)` — logs a warning if structure has issues
4. Returns `MapType.encode(MapType.create(mapObj)).finish()`

**Example**

```ts
const bytes = await encodeMap(apolloMap)
downloadBinary(bytes, 'base_map.bin')
```

---

## encodeGraph

```ts
async function encodeGraph(graphObj: TopoGraph): Promise<Uint8Array>
```

Encodes a `TopoGraph` object to binary using `topo_graph.proto` → `apollo.routing.Graph`.

---

## decodeMap

```ts
async function decodeMap(buffer: Uint8Array): Promise<ApolloMap>
```

Decodes a `base_map.bin` binary buffer back to a JavaScript object shaped as `ApolloMap`.

1. Loads `map.proto`
2. Calls `MapType.decode(buffer)`
3. Returns `MapType.toObject(decoded, { longs: Number, enums: Number, defaults: true })`

The `{ defaults: true }` option ensures all optional fields have their zero/empty defaults present, which simplifies the import parser.

---

## downloadBinary

```ts
function downloadBinary(data: Uint8Array, filename: string): void
```

Triggers a browser file download for a binary blob:

```ts
const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = filename
a.click()
URL.revokeObjectURL(url)
```

The `data.buffer as ArrayBuffer` cast is required because `Uint8Array` may have a `SharedArrayBuffer` backing in some environments, which `Blob` does not accept.
