import { getMapType } from './loader';
import { decodeMessage } from './textCodec/decoder';
import { encodeMessage } from './textCodec/encoder';

export { decodeMessage } from './textCodec/decoder';
export { encodeMessage } from './textCodec/encoder';

export async function decodeMapText(text: string): Promise<Record<string, unknown>> {
  const Map = await getMapType();
  return decodeMessage(Map, text);
}

export async function encodeMapText(obj: Record<string, unknown>): Promise<string> {
  const Map = await getMapType();
  return encodeMessage(Map, obj);
}
