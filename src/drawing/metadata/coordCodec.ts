import type { PointENU } from '../../types/apollo-map'
import type { ToolMeta, PrimitiveTool } from '../primitives/types'

/**
 * ENU coordinate mantissa encoding/decoding.
 *
 * Each ENU x,y coordinate is split into:
 *   - High part: actual coordinate with 4 decimal places (0.1mm precision)
 *   - Low part:  6-digit metadata integer encoded in the mantissa tail
 *
 * Protocol:
 *   Vertex 0 x-slot: TT * 10000 + PPPP  (TT=tool type 01-05, PPPP=payload slot count)
 *   Vertex 0 y-slot: 314159              (magic number for detection)
 *   Vertex 1+ slots: tool-specific payload
 */

const PRECISION = 1e4 // 4 decimal places
const META_SPACE = 1e6 // 6-digit metadata per slot
const COMBINED_SCALE = PRECISION * META_SPACE // 1e10
const MAGIC = 314159
const SIGNED_BIAS = 500000 // Bias for signed mm values: value_mm + 500000

const TOOL_TYPE_MAP: Record<PrimitiveTool, number> = {
  point: 1,
  line: 2,
  bezier: 3,
  rotatable_rect: 4,
  polygon: 5,
}

const TOOL_TYPE_REVERSE: Record<number, PrimitiveTool> = {
  1: 'point',
  2: 'line',
  3: 'bezier',
  4: 'rotatable_rect',
  5: 'polygon',
}

/** Encode a 6-digit metadata integer into a coordinate value */
function encodeSlot(coord: number, meta: number): number {
  const sign = coord >= 0 ? 1 : -1
  const rounded = Math.round(Math.abs(coord) * PRECISION)
  const packed = rounded * META_SPACE + Math.round(meta)
  return (sign * packed) / COMBINED_SCALE
}

/** Decode the 6-digit metadata integer from a coordinate value */
function decodeSlot(coord: number): { cleanCoord: number; meta: number } {
  const combined = Math.round(Math.abs(coord) * COMBINED_SCALE)
  const meta = combined % META_SPACE
  const rounded = Math.floor(combined / META_SPACE)
  const cleanCoord = (Math.sign(coord) || 1) * (rounded / PRECISION)
  return { cleanCoord, meta }
}

/**
 * Encode tool metadata into the mantissa tail of ENU coordinate points.
 * Mutates the points array in-place.
 */
export function encodeToolMeta(points: PointENU[], meta: ToolMeta): void {
  if (points.length < 1) return

  const toolType = TOOL_TYPE_MAP[meta.tool]
  if (!toolType) return

  // Build payload slots based on tool type
  const payload: number[] = []

  if (meta.tool === 'rotatable_rect') {
    // Payload: [rotation_centideg, 0, width_mm, height_mm]
    const rotCentideg = Math.round((((meta.rotation ?? 0) * 180) / Math.PI) * 100) % 36000
    payload.push(rotCentideg < 0 ? rotCentideg + 36000 : rotCentideg)
    payload.push(0) // reserved
    payload.push(Math.round((meta.width ?? 0) * 1000)) // mm
    payload.push(Math.round((meta.height ?? 0) * 1000)) // mm
  } else if (meta.tool === 'bezier' && meta.bezierControlPoints) {
    // Payload: control point offsets as signed biased mm values
    // Each bezier segment has 2 control points, each with (dx, dy) offset from
    // the corresponding anchor point
    const cps = meta.bezierControlPoints
    const anchors = meta.bezierAnchors ?? []

    for (let i = 0; i < cps.length; i += 2) {
      const segIdx = Math.floor(i / 2)
      // cp1 (near anchor[segIdx]): offset from anchor
      const anchor0 = anchors[segIdx] ?? [0, 0]
      const anchor1 = anchors[segIdx + 1] ?? [0, 0]

      const cp1 = cps[i]
      const cp2 = cps[i + 1]

      if (cp1) {
        // Convert lng/lat offset to approximate mm (very rough, but sufficient)
        // At equator: 1° lng ≈ 111,320m. We store as relative offset.
        // Better: store as raw coordinate differences × 1e7 (gives ~0.01m precision)
        payload.push(encodeSignedMm(cp1[0] - anchor0[0]))
        payload.push(encodeSignedMm(cp1[1] - anchor0[1]))
      }
      if (cp2) {
        payload.push(encodeSignedMm(cp2[0] - anchor1[0]))
        payload.push(encodeSignedMm(cp2[1] - anchor1[1]))
      }
    }
  }
  // point, line, polygon: no payload needed

  const payloadSlots = payload.length
  const headerX = toolType * 10000 + payloadSlots

  // Encode header into vertex 0
  points[0] = {
    x: encodeSlot(points[0].x, headerX),
    y: encodeSlot(points[0].y, MAGIC),
    z: points[0].z,
  }

  // Encode payload into subsequent vertices (2 slots per vertex: x and y)
  let slotIdx = 0
  for (let vIdx = 1; vIdx < points.length && slotIdx < payloadSlots; vIdx++) {
    const xMeta = slotIdx < payloadSlots ? payload[slotIdx++] : 0
    const yMeta = slotIdx < payloadSlots ? payload[slotIdx++] : 0
    points[vIdx] = {
      x: encodeSlot(points[vIdx].x, xMeta),
      y: encodeSlot(points[vIdx].y, yMeta),
      z: points[vIdx].z,
    }
  }
}

/**
 * Decode tool metadata from ENU coordinate points.
 * Returns null if no valid encoding is detected (falls through to geometric detection).
 * Also returns cleaned coordinates with metadata removed.
 */
export function decodeToolMeta(points: PointENU[]): {
  meta: ToolMeta
  cleanPoints: PointENU[]
} | null {
  if (points.length < 1) return null

  // Check magic number in y-slot of first vertex
  const yDec = decodeSlot(points[0].y)
  if (yDec.meta !== MAGIC) return null

  // Decode header from x-slot
  const xDec = decodeSlot(points[0].x)
  const toolTypeNum = Math.floor(xDec.meta / 10000)
  const payloadSlots = xDec.meta % 10000

  const tool = TOOL_TYPE_REVERSE[toolTypeNum]
  if (!tool) return null

  // Validate payload fits in available vertices
  const availableSlots = (points.length - 1) * 2
  if (payloadSlots > availableSlots) return null

  // Read payload slots
  const payload: number[] = []
  let slotIdx = 0
  for (let vIdx = 1; vIdx < points.length && slotIdx < payloadSlots; vIdx++) {
    const xd = decodeSlot(points[vIdx].x)
    const yd = decodeSlot(points[vIdx].y)
    if (slotIdx < payloadSlots) payload.push(xd.meta)
    slotIdx++
    if (slotIdx < payloadSlots) payload.push(yd.meta)
    slotIdx++
  }

  // Clean all coordinates (remove metadata from mantissa)
  const cleanPoints: PointENU[] = points.map((p) => ({
    x: decodeSlot(p.x).cleanCoord,
    y: decodeSlot(p.y).cleanCoord,
    z: p.z,
  }))

  // Parse payload based on tool type
  const meta: ToolMeta = { tool }

  if (tool === 'rotatable_rect' && payload.length >= 4) {
    const centideg = payload[0]
    meta.rotation = ((centideg / 100) * Math.PI) / 180
    meta.width = payload[2] / 1000 // mm → m
    meta.height = payload[3] / 1000
  } else if (tool === 'bezier' && payload.length >= 4) {
    // Reconstruct control point offsets
    const bezierControlPoints: [number, number][] = []
    for (let i = 0; i < payload.length; i += 2) {
      bezierControlPoints.push([
        decodeSignedMm(payload[i]),
        decodeSignedMm(payload[i + 1] ?? SIGNED_BIAS),
      ])
    }
    meta.bezierControlPoints = bezierControlPoints
    // Anchors will be reconstructed from the clean line points during import
  }

  return { meta, cleanPoints }
}

/** Encode a signed offset (in lng/lat degrees) as a biased 6-digit integer.
 *  We multiply by 1e7 to get ~0.01m precision, then bias by 500000.
 *  Range: ±0.05° ≈ ±5.5km at equator. */
function encodeSignedMm(degreeDiff: number): number {
  const scaled = Math.round(degreeDiff * 1e7) + SIGNED_BIAS
  return Math.max(0, Math.min(999999, scaled))
}

function decodeSignedMm(encoded: number): number {
  return (encoded - SIGNED_BIAS) / 1e7
}
