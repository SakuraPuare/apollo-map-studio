import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSelectionClipboard,
  copySelectionToClipboard,
  hasSelectionClipboard,
  pasteSelectionFromClipboard,
} from '../selectionClipboard';
import { DEFAULT_DUPLICATE_OFFSET_METERS } from '../entityOps';
import { DEG_TO_M } from '@/core/geometry/apolloCompile/projection';
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
    expect(first?.points[0]!.x).toBeCloseTo(
      source.points[0]!.x + DEFAULT_DUPLICATE_OFFSET_METERS / DEG_TO_M,
      10,
    );
    expect(first?.points[0]!.y).toBeCloseTo(
      source.points[0]!.y + DEFAULT_DUPLICATE_OFFSET_METERS / DEG_TO_M,
      10,
    );

    const secondMap = asMap(source, first!);
    const second = pasteSelectionFromClipboard(secondMap) as PolylineEntity | null;
    expect(second?.id).toBe('polyline_3');
    expect(second?.points[0]!.x).toBeCloseTo(
      source.points[0]!.x + (DEFAULT_DUPLICATE_OFFSET_METERS * 2) / DEG_TO_M,
      10,
    );
    expect(second?.points[0]!.y).toBeCloseTo(
      source.points[0]!.y + (DEFAULT_DUPLICATE_OFFSET_METERS * 2) / DEG_TO_M,
      10,
    );
    expect(first).not.toBe(source);
    expect(first?.points).not.toBe(source.points);
  });

  it('copies the selected entity as an immutable snapshot', () => {
    const source = makePolyline('polyline_1');
    expect(copySelectionToClipboard(source)).toBe(true);

    source.points[0]!.x = 100;
    source.points[0]!.y = 100;

    const pasted = pasteSelectionFromClipboard(asMap(source)) as PolylineEntity | null;
    expect(pasted?.id).toBe('polyline_2');
    expect(pasted?.points[0]!.x).toBeCloseTo(DEFAULT_DUPLICATE_OFFSET_METERS / DEG_TO_M, 10);
    expect(pasted?.points[0]!.y).toBeCloseTo(DEFAULT_DUPLICATE_OFFSET_METERS / DEG_TO_M, 10);
  });

  it('returns null when nothing has been copied', () => {
    expect(hasSelectionClipboard()).toBe(false);
    expect(pasteSelectionFromClipboard(asMap())).toBeNull();
  });
});
