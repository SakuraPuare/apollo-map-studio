import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSelectionClipboard,
  copySelectionToClipboard,
  hasSelectionClipboard,
  pasteSelectionFromClipboard,
} from '../selectionClipboard';
import type { MapEntity, PolylineEntity } from '@/types/entities';

function makePolyline(id: string): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  };
}

function asMap(...entities: MapEntity[]): Map<string, MapEntity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

describe('selectionClipboard', () => {
  beforeEach(() => {
    clearSelectionClipboard();
  });

  it('copies a selection and pastes incrementally with new ids', () => {
    const source = makePolyline('polyline_1');
    expect(copySelectionToClipboard(source)).toBe(true);
    expect(hasSelectionClipboard()).toBe(true);

    const first = pasteSelectionFromClipboard(asMap(source)) as PolylineEntity | null;
    expect(first?.id).toBe('polyline_2');
    expect(first?.points[0]!.x).toBeGreaterThan(source.points[0]!.x);

    const secondMap = asMap(source, first!);
    const second = pasteSelectionFromClipboard(secondMap) as PolylineEntity | null;
    expect(second?.id).toBe('polyline_3');
    expect(second?.points[0]!.x).toBeGreaterThan(first!.points[0]!.x);
  });

  it('returns null when nothing has been copied', () => {
    expect(hasSelectionClipboard()).toBe(false);
    expect(pasteSelectionFromClipboard(asMap())).toBeNull();
  });
});
