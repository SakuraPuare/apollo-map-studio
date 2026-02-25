import type { MapElement } from '../types/editor'
import type { MapInstance, PrimitiveTool, PrimitiveResult, CreationStep } from './primitives/types'
import { BasePrimitiveTool, createPrimitiveTool } from './primitives'
import { BLUEPRINTS } from './blueprints'
import { createElementFromResults } from './elementFactory'
import { useMapStore } from '../store/mapStore'
import { useUIStore } from '../store/uiStore'

export interface ActiveSession {
  elementType: MapElement['type']
  steps: CreationStep[]
  currentStep: number
  results: PrimitiveResult[]
}

/**
 * Orchestrates multi-step element creation using primitive tools.
 */
export class DrawingController {
  private map: MapInstance
  private activeTool: BasePrimitiveTool | null = null
  private session: ActiveSession | null = null

  constructor(map: MapInstance) {
    this.map = map
  }

  /** Start creating an element. Optionally override the default primitive tool. */
  startCreation(elementType: MapElement['type'], variantTool?: PrimitiveTool): void {
    // Cancel any ongoing session
    this.cancel()

    const blueprint = BLUEPRINTS[elementType]
    if (!blueprint) {
      console.warn(`No blueprint for element type: ${elementType}`)
      return
    }

    // Apply variant override to the first step if provided
    const steps = blueprint.steps.map((step, i) => {
      if (i === 0 && variantTool) {
        return { ...step, primitiveTool: variantTool }
      }
      return { ...step }
    })

    this.session = {
      elementType,
      steps,
      currentStep: 0,
      results: [],
    }

    useUIStore.getState().setDrawMode('creating')
    useUIStore.getState().setActiveCreation({ elementType })
    this.activateCurrentStep()
  }

  /** Cancel the current creation session */
  cancel(): void {
    if (this.activeTool) {
      this.activeTool.deactivate()
      this.activeTool = null
    }
    if (this.session) {
      this.session = null
      useUIStore.getState().setDrawMode('select')
      useUIStore.getState().setActiveCreation(null)
      useUIStore.getState().setStatus('')
    }
  }

  /** Get the currently active session (for UI display) */
  getSession(): ActiveSession | null {
    return this.session
  }

  /** Check if a creation session is active */
  isActive(): boolean {
    return this.session !== null
  }

  private activateCurrentStep(): void {
    if (!this.session) return

    const step = this.session.steps[this.session.currentStep]
    useUIStore.getState().setStatus(step.prompt)

    this.activeTool = createPrimitiveTool(
      step.primitiveTool,
      this.map,
      (result) => this.onStepComplete(result),
      () => this.onStepCancel()
    )
    this.activeTool.activate()
  }

  private onStepComplete(result: PrimitiveResult): void {
    if (!this.session) return

    this.activeTool?.deactivate()
    this.activeTool = null

    this.session.results.push(result)
    this.session.currentStep++

    if (this.session.currentStep >= this.session.steps.length) {
      this.finishCreation()
    } else {
      this.activateCurrentStep()
    }
  }

  private onStepCancel(): void {
    if (!this.session) return

    const step = this.session.steps[this.session.currentStep]

    // If the current step is optional and we have results from previous steps,
    // skip this step and finish
    if (step.optional && this.session.results.length > 0) {
      this.activeTool?.deactivate()
      this.activeTool = null
      this.session.currentStep++

      // Skip remaining optional steps too
      while (
        this.session.currentStep < this.session.steps.length &&
        this.session.steps[this.session.currentStep].optional
      ) {
        this.session.currentStep++
      }

      if (this.session.currentStep >= this.session.steps.length) {
        this.finishCreation()
      } else {
        this.activateCurrentStep()
      }
    } else {
      this.cancel()
    }
  }

  private finishCreation(): void {
    if (!this.session) return

    const { elementType, results } = this.session

    try {
      const element = createElementFromResults(elementType, results)
      const { addElement } = useMapStore.getState()
      const { setSelected, setStatus } = useUIStore.getState()

      addElement(element)
      setSelected([element.id])
      setStatus(`${elementType} ${element.id} created`)
    } catch (err) {
      console.error('Failed to create element:', err)
      useUIStore.getState().setStatus('Creation failed')
    }

    this.session = null
    useUIStore.getState().setDrawMode('select')
  }

  /** Destroy the controller and clean up */
  destroy(): void {
    this.cancel()
  }
}
