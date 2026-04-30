import { getMapType } from './loader';

/** Decode an Apollo HD-map binary protobuf into a plain object. */
export async function decodeMapBin(bytes: Uint8Array): Promise<Record<string, unknown>> {
  const Map = await getMapType();
  const msg = Map.decode(bytes);
  return Map.toObject(msg, {
    longs: Number,
    enums: Number,
    defaults: false,
    arrays: true,
    objects: true,
  });
}

/** Encode a plain object (matching the schema) back to wire-format bytes. */
export async function encodeMapBin(obj: Record<string, unknown>): Promise<Uint8Array> {
  const Map = await getMapType();
  const err = Map.verify(obj);
  if (err) throw new Error(`Map.verify failed: ${err}`);
  const msg = Map.fromObject(obj);
  return Map.encode(msg).finish();
}
