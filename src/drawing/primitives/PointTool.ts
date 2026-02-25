import { BasePrimitiveTool } from './BasePrimitiveTool'
import type { PrimitiveTool } from './types'

/**
 * Single-click point placement tool.
 */
export class PointTool extends BasePrimitiveTool {
  readonly toolType: PrimitiveTool = 'point'

  activate(): void {
    this.setCursor('crosshair')

    this.bindMap('click', (e) => {
      const { lng, lat } = e.lngLat
      this.onComplete({
        tool: 'point',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        meta: { tool: 'point' },
      })
    })

    this.bindMap('mousemove', (e) => {
      const { lng, lat } = e.lngLat
      this.updatePreview(
        [],
        [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: { isHandle: true },
          },
        ]
      )
    })

    this.bindKey((e) => {
      if (e.key === 'Escape') {
        this.onCancel()
      }
    })
  }
}
