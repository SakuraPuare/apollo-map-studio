import type { EditingController } from './EditingController'

let instance: EditingController | null = null

export function setEditingController(ctrl: EditingController | null): void {
  instance = ctrl
}

export function getEditingController(): EditingController | null {
  return instance
}
