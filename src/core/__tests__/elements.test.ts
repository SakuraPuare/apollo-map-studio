import { describe, expect, it } from 'vitest';
import { MAP_ELEMENTS } from '../elements';

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
});
