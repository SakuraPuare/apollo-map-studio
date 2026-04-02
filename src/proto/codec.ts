import { getMapType, getGraphType } from './loader'
import { parseTextProto } from './textProtoParser'
import type { ApolloMap } from '../types/apollo-map'
import type { TopoGraph } from '../types/apollo-routing'
import type { Type } from 'protobufjs'

/**
 * Recursively normalise a plain object so that every `repeated` proto field
 * is always an array.  The text-proto parser only creates arrays when a field
 * name appears more than once; protobufjs `fromObject` requires arrays for
 * every repeated field.
 */
function normalizeRepeatedFields(obj: Record<string, unknown>, type: Type): void {
  for (const field of Object.values(type.fields)) {
    const key = field.name // camelCase name
    const val = obj[key]
    if (val === undefined || val === null) continue

    if (field.repeated && !Array.isArray(val)) {
      obj[key] = [val]
    }

    // Recurse into message-typed fields
    if (field.resolvedType && 'fields' in field.resolvedType) {
      const childType = field.resolvedType as Type
      const items = Array.isArray(obj[key])
        ? (obj[key] as Record<string, unknown>[])
        : [obj[key] as Record<string, unknown>]
      for (const item of items) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          normalizeRepeatedFields(item, childType)
        }
      }
    }
  }
}

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
 * Decode a protobuf text-format string to an Apollo Map object.
 * This handles the native Apollo text proto format (field { ... } style).
 */
export async function decodeMapFromText(text: string): Promise<ApolloMap> {
  const MapType = await getMapType()
  const raw = parseTextProto(text)

  // Header bytes fields (version, date, district, etc.) appear as plain strings
  // in text proto but protobufjs fromObject expects Uint8Array or base64 for
  // bytes fields. Encode them as UTF-8 bytes so they round-trip correctly.
  const header = raw.header as Record<string, unknown> | undefined
  if (header) {
    const encoder = new TextEncoder()
    for (const key of [
      'version',
      'date',
      'district',
      'generation',
      'revMajor',
      'revMinor',
      'vendor',
    ]) {
      if (typeof header[key] === 'string') {
        header[key] = encoder.encode(header[key] as string)
      }
    }
  }

  normalizeRepeatedFields(raw as Record<string, unknown>, MapType)

  const message = MapType.fromObject(raw)
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
