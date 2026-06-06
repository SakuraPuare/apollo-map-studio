import { describe, it, expect } from 'vitest';
import { makeProjection, utmProjString } from '@/io/proto/projection';
import {
  obstacleBoxCorners,
  headingArrowTip,
  worldToLngLat,
  lngLatToWorld,
  scenarioBoundsLngLat,
} from '../scenarioProjection';
import { parseScenario } from '../parse';

describe('scenarioProjection — world ↔ lngLat', () => {
  const proj = makeProjection(utmProjString(50, 'N')); // Beijing zone

  it('round-trips a world point through lngLat', () => {
    const world = { x: 423244, y: 4438700 };
    const [lng, lat] = worldToLngLat(proj, world);
    expect(lng).toBeGreaterThan(116);
    expect(lng).toBeLessThan(117);
    const back = lngLatToWorld(proj, lng, lat);
    expect(back.x).toBeCloseTo(world.x, 3);
    expect(back.y).toBeCloseTo(world.y, 3);
  });
});

describe('scenarioProjection — obstacle box geometry (world meters)', () => {
  it('axis-aligned box (heading 0) has correct corners', () => {
    const corners = obstacleBoxCorners({ x: 0, y: 0, h: 0 }, 4, 2);
    // forward = +x, left = +y; half-length 2, half-width 1
    expect(corners).toHaveLength(4);
    expect(corners[0]).toMatchObject({ x: 2, y: 1 });
    expect(corners[1]).toMatchObject({ x: 2, y: -1 });
    expect(corners[2]).toMatchObject({ x: -2, y: -1 });
    expect(corners[3]).toMatchObject({ x: -2, y: 1 });
  });

  it('heading 90° rotates the box (forward → +y)', () => {
    const corners = obstacleBoxCorners({ x: 0, y: 0, h: Math.PI / 2 }, 4, 2);
    // forward now +y: front-right corner ≈ (-1, 2)
    expect(corners[0]!.x).toBeCloseTo(-1, 6);
    expect(corners[0]!.y).toBeCloseTo(2, 6);
  });

  it('heading arrow tip points along heading', () => {
    expect(headingArrowTip({ x: 10, y: 5, h: 0 }, 3)).toMatchObject({ x: 13, y: 5 });
    const up = headingArrowTip({ x: 10, y: 5, h: Math.PI / 2 }, 3);
    expect(up.x).toBeCloseTo(10, 6);
    expect(up.y).toBeCloseTo(8, 6);
  });
});

describe('scenarioProjection — scenario bounds', () => {
  const proj = makeProjection(utmProjString(50, 'N'));

  it('computes bounds covering ego + obstacles', () => {
    const doc = parseScenario({
      id: 'b',
      scenario: {
        start: { x: 423200, y: 4438700 },
        end: { x: 423300, y: 4438800 },
        mapDir: 'm',
        agent: [
          {
            id: 1,
            width: 2,
            length: 4,
            height: 1.5,
            type: 'VEHICLE',
            motiontype: 'STATIC',
            startPosition: { x: 423250, y: 4438750 },
          },
        ],
      },
      type: 'worldsim',
      mapId: 'm',
      tags: [],
      time: 't',
      descriptionEnTokens: [],
    });
    const bounds = scenarioBoundsLngLat(proj, doc);
    expect(bounds).not.toBeNull();
    const [[w, s], [e, n]] = bounds!;
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
  });

  it('returns null for an empty scenario', () => {
    const proj2 = makeProjection(utmProjString(50, 'N'));
    const doc = {
      format: 'openscenario' as const,
      meta: { id: 'x', tags: [] },
      ego: { start: { x: NaN, y: NaN }, end: { x: NaN, y: NaN }, waypoints: [] },
      obstacles: [],
      trafficLights: [],
      raw: {},
    };
    expect(scenarioBoundsLngLat(proj2, doc)).toBeNull();
  });
});
