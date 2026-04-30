import { describe, expect, it } from 'vitest';
import { COLD_LAYER_FILTERS, COLD_LAYER_IDS, buildColdLayerFilter } from '../coldLayerConfig';

describe('buildColdLayerFilter', () => {
  it('keeps selected entities visible in cold layers', () => {
    for (const layerId of COLD_LAYER_IDS) {
      expect(buildColdLayerFilter(layerId, 'selected-id')).toBe(COLD_LAYER_FILTERS[layerId]);
    }
  });

  it('returns the base filter when there is no selection', () => {
    for (const layerId of COLD_LAYER_IDS) {
      expect(buildColdLayerFilter(layerId, null)).toBe(COLD_LAYER_FILTERS[layerId]);
    }
  });
});
