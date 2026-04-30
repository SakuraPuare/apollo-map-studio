import { describe, it, expect } from 'vitest';
import { buildApolloLayerFeatures } from '../apolloGeoJson';

/**
 * As of the entityBridge sprint every Apollo entity is bridged into mapStore
 * and rendered by the cold layer. The Apollo viewer layer (this builder)
 * is now a fallback for proto fields we have NOT yet bridged — currently
 * none — so it must return empty FeatureCollections regardless of input.
 *
 * If a new Apollo proto field appears that needs visual surfacing before a
 * bridge is written, add a branch in `buildApolloLayerFeatures` and a
 * targeted test here.
 */
describe('apolloGeoJson — buildApolloLayerFeatures (all-empty post-bridge contract)', () => {
  it('returns empty FeatureCollections for an empty map', () => {
    const f = buildApolloLayerFeatures({});
    for (const fc of Object.values(f)) {
      expect(fc.type).toBe('FeatureCollection');
      expect(fc.features).toHaveLength(0);
    }
  });

  it('returns empty FeatureCollections even when the raw map has bridged entity arrays', () => {
    const f = buildApolloLayerFeatures({
      lane: [
        {
          id: { id: 'L1' },
          central_curve: {
            segment: [
              {
                line_segment: {
                  point: [
                    { x: 1, y: 2 },
                    { x: 3, y: 4 },
                  ],
                },
              },
            ],
          },
        },
      ],
      crosswalk: [{ id: { id: 'CW1' }, polygon: { point: [{ x: 0, y: 0 }] } }],
      junction: [{ id: { id: 'J1' }, polygon: { point: [{ x: 5, y: 5 }] } }],
    });
    expect(f.laneCenters.features).toHaveLength(0);
    expect(f.crosswalks.features).toHaveLength(0);
    expect(f.junctions.features).toHaveLength(0);
  });
});
