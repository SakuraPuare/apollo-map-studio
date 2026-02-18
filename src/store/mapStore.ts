import { create } from 'zustand'
import { temporal } from 'zundo'
import { immer } from 'zustand/middleware/immer'
import type {
  LaneFeature,
  JunctionFeature,
  SignalFeature,
  StopSignFeature,
  CrosswalkFeature,
  ClearAreaFeature,
  SpeedBumpFeature,
  ParkingSpaceFeature,
  MapElement,
  ProjectConfig,
} from '../types/editor'
import { BoundaryType, LaneDirection, LaneTurn, LaneType } from '../types/apollo-map'

interface MapState {
  project: ProjectConfig | null
  lanes: Record<string, LaneFeature>
  junctions: Record<string, JunctionFeature>
  signals: Record<string, SignalFeature>
  stopSigns: Record<string, StopSignFeature>
  crosswalks: Record<string, CrosswalkFeature>
  clearAreas: Record<string, ClearAreaFeature>
  speedBumps: Record<string, SpeedBumpFeature>
  parkingSpaces: Record<string, ParkingSpaceFeature>

  // Actions
  setProject: (config: ProjectConfig) => void
  addElement: (element: MapElement) => void
  updateElement: (element: MapElement) => void
  removeElement: (id: string, type: MapElement['type']) => void
  connectLanes: (fromId: string, toId: string) => void
  setLaneNeighbor: (laneId: string, neighborId: string, side: 'left' | 'right') => void
  clear: () => void
  loadState: (state: Partial<MapState>) => void
}

const defaultLaneProps = {
  width: 3.75,
  speedLimit: 13.89, // 50 km/h in m/s
  laneType: LaneType.CITY_DRIVING,
  turn: LaneTurn.NO_TURN,
  direction: LaneDirection.FORWARD,
  leftBoundaryType: BoundaryType.DOTTED_WHITE,
  rightBoundaryType: BoundaryType.DOTTED_WHITE,
  predecessorIds: [],
  successorIds: [],
  leftNeighborIds: [],
  rightNeighborIds: [],
}

export const useMapStore = create<MapState>()(
  temporal(
    immer((set) => ({
      project: null,
      lanes: {},
      junctions: {},
      signals: {},
      stopSigns: {},
      crosswalks: {},
      clearAreas: {},
      speedBumps: {},
      parkingSpaces: {},

      setProject: (config) =>
        set((state) => {
          state.project = config
        }),

      addElement: (element) =>
        set((state) => {
          switch (element.type) {
            case 'lane':
              state.lanes[element.id] = { ...defaultLaneProps, ...element }
              break
            case 'junction':
              state.junctions[element.id] = element
              break
            case 'signal':
              state.signals[element.id] = element
              break
            case 'stop_sign':
              state.stopSigns[element.id] = element
              break
            case 'crosswalk':
              state.crosswalks[element.id] = element
              break
            case 'clear_area':
              state.clearAreas[element.id] = element
              break
            case 'speed_bump':
              state.speedBumps[element.id] = element
              break
            case 'parking_space':
              state.parkingSpaces[element.id] = element
              break
          }
        }),

      updateElement: (element) =>
        set((state) => {
          switch (element.type) {
            case 'lane':
              if (state.lanes[element.id]) {
                Object.assign(state.lanes[element.id], element)
              }
              break
            case 'junction':
              if (state.junctions[element.id]) {
                Object.assign(state.junctions[element.id], element)
              }
              break
            case 'signal':
              if (state.signals[element.id]) {
                Object.assign(state.signals[element.id], element)
              }
              break
            case 'stop_sign':
              if (state.stopSigns[element.id]) {
                Object.assign(state.stopSigns[element.id], element)
              }
              break
            case 'crosswalk':
              if (state.crosswalks[element.id]) {
                Object.assign(state.crosswalks[element.id], element)
              }
              break
            case 'clear_area':
              if (state.clearAreas[element.id]) {
                Object.assign(state.clearAreas[element.id], element)
              }
              break
            case 'speed_bump':
              if (state.speedBumps[element.id]) {
                Object.assign(state.speedBumps[element.id], element)
              }
              break
            case 'parking_space':
              if (state.parkingSpaces[element.id]) {
                Object.assign(state.parkingSpaces[element.id], element)
              }
              break
          }
        }),

      removeElement: (id, type) =>
        set((state) => {
          switch (type) {
            case 'lane':
              delete state.lanes[id]
              // Clean up references in other lanes
              Object.values(state.lanes).forEach((lane) => {
                lane.predecessorIds = lane.predecessorIds.filter((pid) => pid !== id)
                lane.successorIds = lane.successorIds.filter((sid) => sid !== id)
                lane.leftNeighborIds = lane.leftNeighborIds.filter((nid) => nid !== id)
                lane.rightNeighborIds = lane.rightNeighborIds.filter((nid) => nid !== id)
              })
              break
            case 'junction':
              delete state.junctions[id]
              break
            case 'signal':
              delete state.signals[id]
              break
            case 'stop_sign':
              delete state.stopSigns[id]
              break
            case 'crosswalk':
              delete state.crosswalks[id]
              break
            case 'clear_area':
              delete state.clearAreas[id]
              break
            case 'speed_bump':
              delete state.speedBumps[id]
              break
            case 'parking_space':
              delete state.parkingSpaces[id]
              break
          }
        }),

      connectLanes: (fromId, toId) =>
        set((state) => {
          if (state.lanes[fromId] && state.lanes[toId]) {
            if (!state.lanes[fromId].successorIds.includes(toId)) {
              state.lanes[fromId].successorIds.push(toId)
            }
            if (!state.lanes[toId].predecessorIds.includes(fromId)) {
              state.lanes[toId].predecessorIds.push(fromId)
            }
          }
        }),

      setLaneNeighbor: (laneId, neighborId, side) =>
        set((state) => {
          if (state.lanes[laneId] && state.lanes[neighborId]) {
            if (side === 'left') {
              if (!state.lanes[laneId].leftNeighborIds.includes(neighborId)) {
                state.lanes[laneId].leftNeighborIds.push(neighborId)
              }
              if (!state.lanes[neighborId].rightNeighborIds.includes(laneId)) {
                state.lanes[neighborId].rightNeighborIds.push(laneId)
              }
            } else {
              if (!state.lanes[laneId].rightNeighborIds.includes(neighborId)) {
                state.lanes[laneId].rightNeighborIds.push(neighborId)
              }
              if (!state.lanes[neighborId].leftNeighborIds.includes(laneId)) {
                state.lanes[neighborId].leftNeighborIds.push(laneId)
              }
            }
          }
        }),

      clear: () =>
        set((state) => {
          state.lanes = {}
          state.junctions = {}
          state.signals = {}
          state.stopSigns = {}
          state.crosswalks = {}
          state.clearAreas = {}
          state.speedBumps = {}
          state.parkingSpaces = {}
        }),

      loadState: (newState) =>
        set((state) => {
          Object.assign(state, newState)
        }),
    }))
  )
)
