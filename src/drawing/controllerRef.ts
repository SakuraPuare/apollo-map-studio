import type { DrawingController } from './DrawingController'

let instance: DrawingController | null = null

export function setDrawingController(ctrl: DrawingController | null): void {
  instance = ctrl
}

export function getDrawingController(): DrawingController | null {
  return instance
}
