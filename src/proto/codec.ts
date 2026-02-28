import { getMapType, getGraphType } from './loader'
import type { ApolloMap } from '../types/apollo-map'
import type { TopoGraph } from '../types/apollo-routing'

/**
 * Encode an Apollo Map object to binary protobuf.
 */
export async function encodeMap(map: ApolloMap): Promise<Uint8Array> {
  const MapType = await getMapType()

  // Convert camelCase to proto field names (protobufjs handles this)
  const err = MapType.verify(map)
  if (err) {
    console.warn('Map verification warning:', err)
  }

  const message = MapType.create(map)
  return MapType.encode(message).finish()
}

/**
 * Encode a Routing Graph to binary protobuf.
 */
export async function encodeGraph(graph: TopoGraph): Promise<Uint8Array> {
  const GraphType = await getGraphType()

  const err = GraphType.verify(graph)
  if (err) {
    console.warn('Graph verification warning:', err)
  }

  const message = GraphType.create(graph)
  return GraphType.encode(message).finish()
}

/**
 * Decode a binary protobuf buffer to an Apollo Map object.
 */
export async function decodeMap(buffer: Uint8Array): Promise<ApolloMap> {
  const MapType = await getMapType()
  const message = MapType.decode(buffer)
  return MapType.toObject(message, {
    longs: Number,
    enums: Number,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
  }) as unknown as ApolloMap
}

/**
 * Download a string as a text file.
 */
export function downloadText(data: string, filename: string): void {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadBinary(data: Uint8Array, filename: string): void {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
