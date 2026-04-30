import * as protobuf from 'protobufjs';

let cached: Promise<protobuf.Root> | null = null;

/**
 * Load Apollo HD-map proto schema. Resolves once and is reused.
 *
 * Uses `import.meta.glob` so that:
 *   - In Vite browser builds, every .proto under `src/proto/` is bundled as
 *     raw text and made available offline (no network round-trip).
 *   - In Vitest (which inherits Vite's resolver) the same mechanism works
 *     in Node, so tests don't need filesystem access.
 *
 * Internal proto imports use paths like `map_msgs/map_lane.proto` and
 * `basic_msgs/geometry.proto`; we satisfy those by registering each file
 * twice (with and without the leading `/src/proto/` prefix).
 */
const PROTO_SOURCES = import.meta.glob('/src/proto/**/*.proto', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function loadApolloProtoRoot(): Promise<protobuf.Root> {
  if (cached) return cached;
  const root = new protobuf.Root();
  // Apollo proto imports are written relative to src/proto/ root
  // (e.g. `import "map_msgs/map_lane.proto"`). protobufjs's default
  // resolvePath joins import paths with the origin file's directory,
  // which would yield `map_msgs/map_msgs/map_lane.proto`. Override
  // resolvePath to treat every target as a root-relative key.
  root.resolvePath = (_origin: string, target: string) => target;
  // protobufjs's FetchCallback types `error` as `Error` (non-null), but the
  // success path needs to signal "no error" — pass `null as unknown as Error`
  // and rely on the source-arg sentinel that protobufjs already supports.
  root.fetch = (filename: string, callback) => {
    const key = '/src/proto/' + filename.replace(/^\/+/, '');
    const text = PROTO_SOURCES[key];
    // Must be deferred: protobufjs counts pending fetches with a `queued`
    // counter; if the callback fires synchronously the counter dips to 0
    // mid-import-tree-walk, which triggers resolveAll() before all imports
    // are loaded → "no such Type" errors during type resolution.
    Promise.resolve().then(() => {
      if (text !== undefined) callback(null as unknown as Error, text);
      else callback(new Error(`Proto file not found in bundle: ${filename} (key=${key})`));
    });
  };
  cached = root.load('map_msgs/map.proto', { keepCase: true });
  return cached;
}

/** Convenience accessor for the top-level `apollo.hdmap.Map` message type. */
export async function getMapType(): Promise<protobuf.Type> {
  const root = await loadApolloProtoRoot();
  return root.lookupType('apollo.hdmap.Map');
}
