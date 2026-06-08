import { describe, expect, it } from 'vitest';
import {
  getCenterline,
  getPolygon,
  getPolylines,
  getStopLines,
  isOverlapParticipant,
} from '../geometryAdapters';
import {
  curve,
  curveFromSegments,
  makeBarrierGate,
  makeCrosswalk,
  makeJunction,
  makeLane,
  makePolygonEntity,
  makePolyline,
  makeSignal,
  makeSpeedBump,
  makeStopSign,
  makeYieldSign,
  pt,
} from './testHelpers';
import type { MapEntity } from '@/types/entities';

describe('geometryAdapters', () => {
  it('flattens centerline curve segments and de-duplicates shared joints', () => {
    const lane = makeLane('L', [], {
      centralSegments: [
        [pt(0, 0), pt(1, 0)],
        [pt(1, 0), pt(2, 0)],
        [pt(5, 0), pt(6, 0)],
      ],
    });

    expect(getCenterline(lane)).toEqual([pt(0, 0), pt(1, 0), pt(2, 0), pt(5, 0), pt(6, 0)]);
  });

  it('returns polygon geometry for Apollo polygon carriers and signal boundaries', () => {
    const square = [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)];

    expect(getPolygon(makeJunction('J', square))).toBe(square);
    expect(getPolygon(makeCrosswalk('CW', square))).toBe(square);
    expect(getPolygon(makePolygonEntity('clearArea', 'CA', square))).toBe(square);
    expect(getPolygon(makePolygonEntity('parkingSpace', 'PS', square))).toBe(square);
    expect(getPolygon(makePolygonEntity('parkingLot', 'PL', square))).toBe(square);
    expect(getPolygon(makePolygonEntity('pncJunction', 'PNC', square))).toBe(square);
    expect(getPolygon(makePolygonEntity('area', 'A', square))).toBe(square);
    expect(getPolygon(makePolygonEntity('speedControl', 'SC', square))).toBe(square);
    expect(getPolygon(makeBarrierGate('BG', square))).toBe(square);

    const signal = makeSignal('S', { boundary: square });
    expect(getPolygon(signal)).toBe(square);
    expect(getPolygon(makePolyline('P', square))).toBeNull();
  });

  it('extracts stop lines and drops degenerate curves', () => {
    const valid = curveFromSegments([pt(0, 0), pt(1, 0)], [pt(1, 0), pt(2, 0)]);
    const degenerate = curve([pt(3, 0)]);

    expect(getStopLines(makeSignal('S', { stopLines: [degenerate, valid] }))).toEqual([
      [pt(0, 0), pt(1, 0), pt(2, 0)],
    ]);
    expect(getStopLines(makeStopSign('STOP', [valid]))).toEqual([[pt(0, 0), pt(1, 0), pt(2, 0)]]);
    expect(getStopLines(makeYieldSign('YIELD', [valid]))).toEqual([[pt(0, 0), pt(1, 0), pt(2, 0)]]);
    expect(getStopLines(makeBarrierGate('BG', [], [valid]))).toEqual([
      [pt(0, 0), pt(1, 0), pt(2, 0)],
    ]);
    expect(getStopLines(makeCrosswalk('CW', []))).toEqual([]);
  });

  it('handles malformed stop-line carriers without curves defensively', () => {
    const missingStopLines = { id: 'S', entityType: 'signal' } as MapEntity;
    expect(getStopLines(missingStopLines)).toEqual([]);
  });

  it('extracts speed bump polylines and ignores non-speed-bump entities', () => {
    const valid = curve([pt(0, 0), pt(0, 1)]);
    const degenerate = curve([pt(2, 2)]);

    expect(getPolylines(makeSpeedBump('SB', [degenerate, valid]))).toEqual([[pt(0, 0), pt(0, 1)]]);
    expect(getPolylines(makeSignal('S'))).toEqual([]);
  });

  it('classifies overlap participants independently from raw geometry getters', () => {
    const square = [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)];
    const participants: MapEntity[] = [
      makeLane('L', [pt(0, 0), pt(1, 0)]),
      makeJunction('J', square),
      makeCrosswalk('CW', square),
      makePolygonEntity('clearArea', 'CA', square),
      makePolygonEntity('parkingSpace', 'PS', square),
      makePolygonEntity('pncJunction', 'PNC', square),
      makePolygonEntity('area', 'A', square),
      makeSignal('S'),
      makeStopSign('STOP', []),
      makeYieldSign('YIELD', []),
      makeBarrierGate('BG', square),
      makeSpeedBump('SB', []),
    ];
    for (const entity of participants) expect(isOverlapParticipant(entity)).toBe(true);

    expect(isOverlapParticipant(makePolygonEntity('parkingLot', 'PL', square))).toBe(false);
    expect(isOverlapParticipant(makePolygonEntity('speedControl', 'SC', square))).toBe(false);
    expect(isOverlapParticipant(makePolyline('P', square))).toBe(false);
  });
});
