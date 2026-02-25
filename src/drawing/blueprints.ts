import type { ElementBlueprint } from './primitives/types'
import type { MapElement } from '../types/editor'

type ElementType = MapElement['type']

export const BLUEPRINTS: Record<ElementType, ElementBlueprint> = {
  lane: {
    steps: [{ primitiveTool: 'line', prompt: 'Draw lane centerline' }],
    variants: ['bezier'],
  },
  junction: {
    steps: [{ primitiveTool: 'polygon', prompt: 'Draw junction boundary' }],
  },
  crosswalk: {
    steps: [{ primitiveTool: 'rotatable_rect', prompt: 'Draw crosswalk rectangle' }],
    variants: ['polygon'],
  },
  clear_area: {
    steps: [{ primitiveTool: 'polygon', prompt: 'Draw clear area boundary' }],
  },
  speed_bump: {
    steps: [{ primitiveTool: 'line', prompt: 'Draw speed bump line' }],
  },
  parking_space: {
    steps: [{ primitiveTool: 'rotatable_rect', prompt: 'Draw parking space' }],
    variants: ['polygon'],
  },
  signal: {
    steps: [
      { primitiveTool: 'line', prompt: 'Draw stop line' },
      {
        primitiveTool: 'point',
        prompt: 'Place signal position (Enter for midpoint)',
        optional: true,
      },
    ],
  },
  stop_sign: {
    steps: [{ primitiveTool: 'line', prompt: 'Draw stop line' }],
  },
}
