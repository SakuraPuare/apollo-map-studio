import { describe, expect, it } from 'vitest';
import {
  TOP_LEVEL_ENTITY_TYPES,
  getEntityColor,
  getEntityEntry,
  getEntityIcon,
  getEntityLabel,
  getEntityPluralLabel,
} from '../entityRegistry';

describe('entityRegistry', () => {
  it('keeps top-level entity types in UI ordering', () => {
    expect(TOP_LEVEL_ENTITY_TYPES).toEqual([
      'road',
      'junction',
      'lane',
      'signal',
      'crosswalk',
      'stopSign',
      'yieldSign',
      'speedBump',
      'clearArea',
      'parkingSpace',
      'parkingLot',
      'pncJunction',
      'rsu',
      'area',
      'barrierGate',
      'overlap',
      'speedControl',
      'polyline',
      'bezier',
      'arc',
      'rect',
      'polygon',
      'catmullRom',
    ]);
  });

  it('resolves registered entity metadata', () => {
    expect(getEntityEntry('lane')).toMatchObject({
      type: 'lane',
      label: '车道',
      pluralLabel: 'Lanes',
      color: '#4a9eff',
    });
    expect(getEntityIcon('lane')).toBe(getEntityEntry('lane')!.icon);
    expect(getEntityLabel('parkingSpace')).toBe('车位');
    expect(getEntityPluralLabel('parkingSpace')).toBe('Parking Spaces');
    expect(getEntityColor('parkingSpace')).toBe('#7c5cbf');
  });

  it('falls back safely for unknown entity types', () => {
    const fallbackIcon = getEntityIcon('not-a-real-entity');

    expect(getEntityEntry('not-a-real-entity')).toBeUndefined();
    expect(typeof fallbackIcon).toBe('function');
    expect(getEntityLabel('not-a-real-entity')).toBe('not-a-real-entity');
    expect(getEntityPluralLabel('not-a-real-entity')).toBe('not-a-real-entity');
    expect(getEntityColor('not-a-real-entity')).toBeUndefined();
  });
});
