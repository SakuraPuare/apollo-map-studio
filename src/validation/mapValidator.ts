import type {
  LaneFeature,
  SignalFeature,
  StopSignFeature,
  CrosswalkFeature,
  ClearAreaFeature,
  SpeedBumpFeature,
  ParkingSpaceFeature,
  JunctionFeature,
  RoadDefinition,
} from '../types/editor'

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: IssueSeverity
  category: string
  elementId: string
  message: string
  messageKey?: string
  messageParams?: Record<string, string>
}

export interface ValidationReport {
  issues: ValidationIssue[]
  stats: {
    totalLanes: number
    totalConnections: number
    isolatedLanes: number
    errorCount: number
    warningCount: number
    infoCount: number
  }
}

export function validateMap(params: {
  lanes: Record<string, LaneFeature>
  junctions: Record<string, JunctionFeature>
  signals: Record<string, SignalFeature>
  stopSigns: Record<string, StopSignFeature>
  crosswalks: Record<string, CrosswalkFeature>
  clearAreas: Record<string, ClearAreaFeature>
  speedBumps: Record<string, SpeedBumpFeature>
  parkingSpaces: Record<string, ParkingSpaceFeature>
  roads: Record<string, RoadDefinition>
}): ValidationReport {
  const issues: ValidationIssue[] = []
  const laneList = Object.values(params.lanes)
  let totalConnections = 0
  let isolatedLanes = 0

  for (const lane of laneList) {
    const hasSuccessors = lane.successorIds.length > 0
    const hasPredecessors = lane.predecessorIds.length > 0
    totalConnections += lane.successorIds.length

    // Isolated lane check
    if (
      !hasSuccessors &&
      !hasPredecessors &&
      !lane.leftNeighborIds.length &&
      !lane.rightNeighborIds.length
    ) {
      issues.push({
        severity: 'warning',
        category: 'Topology',
        elementId: lane.id,
        message: 'Lane has no connections (isolated)',
        messageKey: 'validation.laneIsolated',
      })
      isolatedLanes++
    }

    // Self-connection check
    if (lane.successorIds.includes(lane.id) || lane.predecessorIds.includes(lane.id)) {
      issues.push({
        severity: 'error',
        category: 'Topology',
        elementId: lane.id,
        message: 'Lane is connected to itself',
        messageKey: 'validation.laneSelfConnected',
      })
    }

    // Dangling successor reference
    for (const succId of lane.successorIds) {
      if (!params.lanes[succId]) {
        issues.push({
          severity: 'error',
          category: 'Reference',
          elementId: lane.id,
          message: `Successor "${succId}" does not exist`,
          messageKey: 'validation.successorNotFound',
          messageParams: { id: succId },
        })
      }
    }

    // Dangling predecessor reference
    for (const predId of lane.predecessorIds) {
      if (!params.lanes[predId]) {
        issues.push({
          severity: 'error',
          category: 'Reference',
          elementId: lane.id,
          message: `Predecessor "${predId}" does not exist`,
          messageKey: 'validation.predecessorNotFound',
          messageParams: { id: predId },
        })
      }
    }

    // Asymmetric connections (A lists B as successor but B doesn't list A as predecessor)
    for (const succId of lane.successorIds) {
      const succ = params.lanes[succId]
      if (succ && !succ.predecessorIds.includes(lane.id)) {
        issues.push({
          severity: 'warning',
          category: 'Topology',
          elementId: lane.id,
          message: `Asymmetric connection: successor "${succId}" does not list this lane as predecessor`,
          messageKey: 'validation.asymmetricConnection',
          messageParams: { id: succId },
        })
      }
    }

    // Unassigned road check
    if (!lane.roadId) {
      issues.push({
        severity: 'info',
        category: 'Organization',
        elementId: lane.id,
        message: 'Lane is not assigned to any road',
        messageKey: 'validation.laneNoRoad',
      })
    }

    // Road reference check
    if (lane.roadId && !params.roads[lane.roadId]) {
      issues.push({
        severity: 'error',
        category: 'Reference',
        elementId: lane.id,
        message: `Assigned road "${lane.roadId}" does not exist`,
        messageKey: 'validation.roadNotFound',
        messageParams: { id: lane.roadId },
      })
    }
  }

  // Duplicate ID check across all element types
  const allIds = new Map<string, string>()
  const checkId = (id: string, type: string) => {
    const existing = allIds.get(id)
    if (existing) {
      issues.push({
        severity: 'error',
        category: 'IDs',
        elementId: id,
        message: `Duplicate ID found: used by both ${existing} and ${type}`,
        messageKey: 'validation.duplicateId',
        messageParams: { type1: existing, type2: type },
      })
    }
    allIds.set(id, type)
  }

  for (const lane of laneList) checkId(lane.id, 'lane')
  for (const j of Object.values(params.junctions)) checkId(j.id, 'junction')
  for (const s of Object.values(params.signals)) checkId(s.id, 'signal')
  for (const s of Object.values(params.stopSigns)) checkId(s.id, 'stop_sign')
  for (const c of Object.values(params.crosswalks)) checkId(c.id, 'crosswalk')
  for (const c of Object.values(params.clearAreas)) checkId(c.id, 'clear_area')
  for (const s of Object.values(params.speedBumps)) checkId(s.id, 'speed_bump')
  for (const p of Object.values(params.parkingSpaces)) checkId(p.id, 'parking_space')

  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  const infoCount = issues.filter((i) => i.severity === 'info').length

  return {
    issues,
    stats: {
      totalLanes: laneList.length,
      totalConnections,
      isolatedLanes,
      errorCount,
      warningCount,
      infoCount,
    },
  }
}
