import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { PolygonEntity } from '@/types/entities';
import { deleteSelectedEntity } from '../mapEventRouter/keyboard';
import { isTextEditingTarget } from '../textEditingTarget';

type ActorSnapshot = {
  value: string;
  context: {
    selectedEntityId?: string | null;
    dragPointIndex: number;
    dragPointType: 'vertex' | 'center' | 'handleIn' | 'handleOut' | 'rotate';
  };
};

function actor(snapshot: ActorSnapshot) {
  return {
    send: vi.fn(),
    getSnapshot: vi.fn(() => snapshot),
  } as never as Parameters<typeof deleteSelectedEntity>[0];
}

function polygon(id = 'poly-1'): PolygonEntity {
  return {
    id,
    entityType: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

function resetStores() {
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState({
    layerStates: {},
    connectMode: { active: false, firstLaneId: null },
    currentSnapTarget: null,
  });
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isTextEditingTarget', () => {
  class FakeHTMLElement {
    constructor(public isContentEditable = false) {}
  }

  class FakeInput extends FakeHTMLElement {}
  class FakeTextarea extends FakeHTMLElement {}
  class FakeSelect extends FakeHTMLElement {}

  beforeEach(() => {
    vi.stubGlobal('HTMLElement', FakeHTMLElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeTextarea);
    vi.stubGlobal('HTMLSelectElement', FakeSelect);
  });

  it('recognizes form controls as text-editing targets', () => {
    expect(isTextEditingTarget(new FakeInput() as never)).toBe(true);
    expect(isTextEditingTarget(new FakeTextarea() as never)).toBe(true);
    expect(isTextEditingTarget(new FakeSelect() as never)).toBe(true);
  });

  it('uses HTMLElement contentEditable state and rejects other targets', () => {
    expect(isTextEditingTarget(new FakeHTMLElement(true) as never)).toBe(true);
    expect(isTextEditingTarget(new FakeHTMLElement(false) as never)).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
    expect(isTextEditingTarget({} as EventTarget)).toBe(false);
  });
});

describe('deleteSelectedEntity', () => {
  it('returns false when there is no selected entity to delete', () => {
    const idle = actor({
      value: 'idle',
      context: { selectedEntityId: 'poly-1', dragPointIndex: -1, dragPointType: 'center' },
    });
    const selectedWithoutId = actor({
      value: 'selected',
      context: { selectedEntityId: null, dragPointIndex: -1, dragPointType: 'center' },
    });

    expect(deleteSelectedEntity(idle)).toBe(false);
    expect(deleteSelectedEntity(selectedWithoutId)).toBe(false);
    expect(idle.send).not.toHaveBeenCalled();
    expect(selectedWithoutId.send).not.toHaveBeenCalled();
  });

  it('returns false when the selected entity is missing from the store', () => {
    const a = actor({
      value: 'selected',
      context: { selectedEntityId: 'missing', dragPointIndex: -1, dragPointType: 'center' },
    });

    expect(deleteSelectedEntity(a)).toBe(false);
    expect(a.send).not.toHaveBeenCalled();
  });

  it('deletes the selected entity and reports that the key was handled', () => {
    const entity = polygon();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const a = actor({
      value: 'selected',
      context: { selectedEntityId: entity.id, dragPointIndex: -1, dragPointType: 'center' },
    });

    expect(deleteSelectedEntity(a)).toBe(true);

    expect(useMapStore.getState().entities.has(entity.id)).toBe(false);
    expect(a.send).toHaveBeenCalledWith({ type: 'DELETE_ENTITY' });
  });
});
