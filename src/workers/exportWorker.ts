/**
 * Export Worker — runs the entire export pipeline off the main thread
 * to prevent UI freezing for large maps.
 *
 * Communicates via postMessage:
 *   Incoming: { type: 'export', payload: { project, lanes, ... , options } }
 *   Outgoing: { type: 'progress', step, stats? }
 *           | { type: 'result', file, data }   (Uint8Array transferred, or string)
 *           | { type: 'error', message }
 */

import { setGlobalProjection } from '../geo/projection'
import { buildBaseMap } from '../export/buildBaseMap'
import { buildSimMap } from '../export/buildSimMap'
import { buildRoutingMap } from '../export/buildRoutingMap'
import { encodeMap, encodeGraph } from '../proto/codec'
import type {
  ProjectConfig,
  LaneFeature,
  JunctionFeature,
  SignalFeature,
  StopSignFeature,
  CrosswalkFeature,
  ClearAreaFeature,
  SpeedBumpFeature,
  ParkingSpaceFeature,
  RoadDefinition,
} from '../types/editor'

export interface ExportPayload {
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
  options: {
    exportBase: boolean
    exportSim: boolean
    exportRouting: boolean
    exportTxt: boolean
  }
}

export type ProgressStep =
  | 'building_base'
  | 'building_sim'
  | 'building_routing'
  | 'encoding'
  | 'done'

export interface ProgressMessage {
  type: 'progress'
  step: ProgressStep
  stats?: { lanes: number; roads: number; nodes: number; edges: number }
}

export interface ResultMessage {
  type: 'result'
  file: string
  data: Uint8Array | string
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export type WorkerOutMessage = ProgressMessage | ResultMessage | ErrorMessage

self.onmessage = async (e: MessageEvent<{ type: string; payload: ExportPayload }>) => {
  if (e.data.type !== 'export') return

  const {
    project,
    lanes,
    junctions,
    signals,
    stopSigns,
    crosswalks,
    clearAreas,
    speedBumps,
    parkingSpaces,
    roads,
    options,
  } = e.data.payload

  try {
    // Initialize projection in the worker's own module scope
    setGlobalProjection(project.originLat, project.originLon)

    // --- Build base map ---
    self.postMessage({ type: 'progress', step: 'building_base' } satisfies ProgressMessage)

    const baseMap = await buildBaseMap({
      project,
      lanes,
      junctions,
      signals,
      stopSigns,
      crosswalks,
      clearAreas,
      speedBumps,
      parkingSpaces,
      roads,
    })

    const stats = {
      lanes: baseMap.lane.length,
      roads: baseMap.road.length,
      nodes: 0,
      edges: 0,
    }

    // --- Encode & send base map ---
    if (options.exportBase) {
      self.postMessage({ type: 'progress', step: 'encoding', stats } satisfies ProgressMessage)
      const baseData = await encodeMap(baseMap)
      self.postMessage(
        { type: 'result', file: 'base_map.bin', data: baseData } satisfies ResultMessage,
        { transfer: [baseData.buffer] }
      )
    }

    // --- Build & send sim map ---
    if (options.exportSim) {
      self.postMessage({ type: 'progress', step: 'building_sim', stats } satisfies ProgressMessage)
      const simMap = buildSimMap(baseMap)

      self.postMessage({ type: 'progress', step: 'encoding', stats } satisfies ProgressMessage)
      const simData = await encodeMap(simMap)
      self.postMessage(
        { type: 'result', file: 'sim_map.bin', data: simData } satisfies ResultMessage,
        { transfer: [simData.buffer] }
      )
    }

    // --- Build & send routing map ---
    if (options.exportRouting) {
      self.postMessage({
        type: 'progress',
        step: 'building_routing',
        stats,
      } satisfies ProgressMessage)
      const routingGraph = buildRoutingMap(baseMap)

      stats.nodes = routingGraph.node.length
      stats.edges = routingGraph.edge.length

      self.postMessage({ type: 'progress', step: 'encoding', stats } satisfies ProgressMessage)
      const routingData = await encodeGraph(routingGraph)
      self.postMessage(
        { type: 'result', file: 'routing_map.bin', data: routingData } satisfies ResultMessage,
        { transfer: [routingData.buffer] }
      )
    }

    // --- TXT exports ---
    if (options.exportTxt) {
      self.postMessage({ type: 'progress', step: 'encoding', stats } satisfies ProgressMessage)

      const baseTxt = JSON.stringify(baseMap, null, 2)
      self.postMessage({
        type: 'result',
        file: 'base_map.txt',
        data: baseTxt,
      } satisfies ResultMessage)

      const simMapForTxt = buildSimMap(baseMap)
      const simTxt = JSON.stringify(simMapForTxt, null, 2)
      self.postMessage({
        type: 'result',
        file: 'sim_map.txt',
        data: simTxt,
      } satisfies ResultMessage)

      const routingGraphForTxt = buildRoutingMap(baseMap)
      const routingTxt = JSON.stringify(routingGraphForTxt, null, 2)
      self.postMessage({
        type: 'result',
        file: 'routing_map.txt',
        data: routingTxt,
      } satisfies ResultMessage)
    }

    // --- Done ---
    self.postMessage({ type: 'progress', step: 'done', stats } satisfies ProgressMessage)
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies ErrorMessage)
  }
}
