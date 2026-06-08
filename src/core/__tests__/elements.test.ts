import { describe, expect, it } from 'vitest';
import {
  ALL_DRAW_TOOLS,
  ELEMENT_MAP,
  MAP_ELEMENTS,
  elementColor,
  laneTypeColor,
  type MapElementType,
} from '../elements';

describe('MAP_ELEMENTS', () => {
  it('lets every polygon-shaped element draw rotated rectangles', () => {
    const polygonElements = MAP_ELEMENTS.filter((element) => element.geometry === 'polygon');

    for (const element of polygonElements) {
      expect(element.tools, `${element.type} should still support polygon drawing`).toContain(
        'drawPolygon',
      );
      expect(element.tools, `${element.type} should expose rotated rectangles`).toContain(
        'drawRotatedRect',
      );
    }
  });

  it('registers every editable Apollo map element with a default tool and registry metadata', () => {
    const expectedOrder: MapElementType[] = [
      'lane',
      'junction',
      'pncJunction',
      'parkingSpace',
      'crosswalk',
      'signal',
      'stopSign',
      'speedBump',
      'yieldSign',
      'clearArea',
      'barrierGate',
      'area',
    ];

    expect(MAP_ELEMENTS.map((element) => element.type)).toEqual(expectedOrder);
    expect(ELEMENT_MAP.size).toBe(expectedOrder.length);

    for (const element of MAP_ELEMENTS) {
      expect(ELEMENT_MAP.get(element.type)).toBe(element);
      expect(element.tools).toContain(element.defaultTool);
      expect(element.label).toBeTruthy();
      expect(element.color).toMatch(/^#/);
      expect(typeof element.icon).toBe('function');
      expect(elementColor(element.type)).toBe(element.color);
    }
    expect(elementColor('not-a-real-entity')).toBeUndefined();
  });

  it('defines the drawing tool palette used by the tool strip', () => {
    expect(ALL_DRAW_TOOLS).toEqual([
      { tool: 'drawBezier', label: '贝塞尔', color: 'bg-pink-500' },
      { tool: 'drawArc', label: '圆弧', color: 'bg-amber-500' },
      { tool: 'drawRotatedRect', label: '矩形', color: 'bg-red-500' },
      { tool: 'drawPolygon', label: '多边形', color: 'bg-purple-500' },
    ]);
  });

  it('maps every Apollo lane type to its semantic render color and falls back to city driving', () => {
    expect(laneTypeColor('CITY_DRIVING')).toBe('#4a9eff');
    expect(laneTypeColor('BIKING')).toBe('#22cc44');
    expect(laneTypeColor('SIDEWALK')).toBe('#cfd4dc');
    expect(laneTypeColor('PARKING')).toBe('#7c5cbf');
    expect(laneTypeColor('SHOULDER')).toBe('#ffaa00');
    expect(laneTypeColor('SHARED')).toBe('#66aaff');
    expect(laneTypeColor('NONE')).toBe('#6b7280');
    expect(laneTypeColor(undefined)).toBe('#4a9eff');
    expect(laneTypeColor('UNKNOWN')).toBe('#4a9eff');
  });
});
