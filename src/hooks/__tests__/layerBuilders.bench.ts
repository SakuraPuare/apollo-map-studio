import { bench, describe } from 'vitest';
import { applyDrag } from '@/components/map/entityMutations';
import { entityToHotFeatures } from '@/lib/geoJsonHelpers';
import { buildOverlayFeatures, type OverlayRenderState } from '../useOverlayLayer';
import {
  applyColdDeltaToSource,
  diffEntities,
  flattenEntityFeatures,
  groupsToFeatureMap,
  rebuildColdSourceFromCache,
} from '../useColdLayer';
import { buildGrid } from '../useGridLayer';
import { buildPerfEntityMap, makeLongLane } from '@/test/fixtures/perfEntities';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';

function pointFeature(entityId: string, index: number): GeoJSON.Feature {
  return {
    id: `${entityId}:feature:${index}`,
    type: 'Feature',
    properties: { id: entityId, featureId: `${entityId}:feature:${index}` },
    geometry: { type: 'Point', coordinates: [index, 0] },
  };
}

function makeFeatureCache(
  entityCount: number,
  featuresPerEntity = 5,
): Map<string, GeoJSON.Feature[]> {
  const cache = new Map<string, GeoJSON.Feature[]>();
  for (let i = 0; i < entityCount; i++) {
    const id = `entity_${i}`;
    cache.set(
      id,
      Array.from({ length: featuresPerEntity }, (_, j) => pointFeature(id, j)),
    );
  }
  return cache;
}

function makeSource() {
  return {
    setData() {
      return this;
    },
    updateData() {
      return this;
    },
  };
}

function points(count: number): LngLat[] {
  return Array.from({ length: count }, (_, i) => [116.4 + i * 0.00001, 39.9]);
}

function anchors(count: number): BezierAnchor[] {
  return points(count).map((point) => ({
    point,
    handleIn: [point[0] - 0.000005, point[1] - 0.000002],
    handleOut: [point[0] + 0.000005, point[1] + 0.000002],
  }));
}

function overlayState(currentState: string, count: number): OverlayRenderState {
  return {
    currentState,
    drawPoints: points(count),
    previewPoint: [116.5, 39.91],
    bezierAnchors: anchors(count),
  };
}

describe('cold layer main-thread helpers', () => {
  for (const scale of [
    { label: '5k', count: 5_000 },
    { label: '25k', count: 25_000 },
  ]) {
    const cache = makeFeatureCache(scale.count);
    const groups = [...cache].map(([id, features]) => ({ id, features }));
    const previous = buildPerfEntityMap(scale.count);
    const next = new Map(previous);
    next.set('lane_0', makeLongLane('lane_0', 8));
    next.delete(`lane_${scale.count - 1}`);

    bench(`cold layer ${scale.label} — groupsToFeatureMap`, () => {
      groupsToFeatureMap(groups);
    });

    bench(`cold layer ${scale.label} — flattenEntityFeatures`, () => {
      flattenEntityFeatures(cache);
    });

    bench(`cold layer ${scale.label} — diffEntities one update one remove`, () => {
      diffEntities(previous, next);
    });

    bench(`cold source ${scale.label} — rebuild from cache`, async () => {
      await rebuildColdSourceFromCache(makeSource() as never, cache);
    });

    bench(`cold source ${scale.label} — apply delta 100 changed`, async () => {
      await applyColdDeltaToSource(
        makeSource() as never,
        cache.get('entity_0') ?? [],
        groups.slice(0, 100),
      );
    });
  }
});

describe('hot and overlay builders', () => {
  for (const count of [100, 1_000, 5_000]) {
    const lane = makeLongLane(`long_lane_${count}`, count);

    bench(`hot layer lane ${count} pts — entityToHotFeatures`, () => {
      entityToHotFeatures(lane);
    });

    bench(`hot layer lane ${count} pts — applyDrag and features`, () => {
      const dragged = applyDrag(lane, 0, 'vertex', [116.401, 39.901]);
      entityToHotFeatures(dragged);
    });
  }

  for (const count of [100, 1_000]) {
    bench(`overlay polyline ${count} pts — buildOverlayFeatures`, () => {
      buildOverlayFeatures(overlayState('drawPolyline', count));
    });

    bench(`overlay catmull ${count} pts — buildOverlayFeatures`, () => {
      buildOverlayFeatures(overlayState('drawCatmullRom', count));
    });

    bench(`overlay bezier ${count} anchors — buildOverlayFeatures`, () => {
      buildOverlayFeatures(overlayState('drawBezier', count));
    });
  }
});

describe('grid layer builder', () => {
  const map = {
    getBounds() {
      return {
        getSouth: () => 39.89,
        getNorth: () => 39.91,
        getWest: () => 116.39,
        getEast: () => 116.42,
      };
    },
    getZoom: () => 20,
  };

  bench(`grid max-density viewport — buildGrid`, () => {
    buildGrid(map as never);
  });
});
