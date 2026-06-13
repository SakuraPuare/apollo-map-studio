import { describe, it, expect } from 'vitest';
import { makeProjection, utmProjString } from '@/io/proto/projection';
import { parseScenario } from '../parse';
import type { PosedScenario } from '../scenarioSampler';
import { buildScenarioFeatures, obstacleColor } from '../scenarioFeatures';
import { worldToLngLat } from '../scenarioProjection';

const proj = makeProjection(utmProjString(50, 'N'));

function fixture() {
  return parseScenario({
    id: 's',
    scenario: {
      start: { x: 423200, y: 4438700, heading: 0 },
      end: { x: 423400, y: 4438900 },
      mapDir: 'm',
      simulatorTime: 50,
      agent: [
        {
          id: 7,
          width: 2,
          length: 4,
          height: 1.5,
          type: 'VEHICLE',
          motiontype: 'TRACKED',
          startPosition: { x: 423250, y: 4438750, heading: 0.5, speed: 5 },
          trackedPoint: [
            { x: 423250, y: 4438750, speed: 5 },
            { x: 423300, y: 4438800, speed: 6 },
          ],
        },
      ],
      trafficLights: [
        {
          id: '900',
          location: { x: 423260, y: 4438760 },
          triggerType: 'DISTANCE',
          triggerValue: 30,
          initialState: { color: 'GREEN' },
          stateGroup: [{ color: 'GREEN', keepTime: 20 }],
        },
      ],
    },
    type: 'worldsim',
    mapId: 'm',
    tags: [],
    time: 't',
    descriptionEnTokens: [],
  });
}

describe('buildScenarioFeatures', () => {
  it('emits an oriented closed box polygon per obstacle', () => {
    const f = buildScenarioFeatures(proj, fixture());
    expect(f.obstacleBoxes.features).toHaveLength(1);
    const poly = f.obstacleBoxes.features[0]!.geometry as GeoJSON.Polygon;
    expect(poly.type).toBe('Polygon');
    // closed ring: 5 coords (4 corners + repeat first)
    expect(poly.coordinates[0]).toHaveLength(5);
    expect(poly.coordinates[0]![0]).toEqual(poly.coordinates[0]![4]);
    expect(f.obstacleBoxes.features[0]!.properties!.color).toBe(obstacleColor('vehicle'));
  });

  it('emits heading arrow + label per obstacle', () => {
    const f = buildScenarioFeatures(proj, fixture());
    expect(f.obstacleHeading.features).toHaveLength(1);
    expect(
      (f.obstacleHeading.features[0]!.geometry as GeoJSON.LineString).coordinates,
    ).toHaveLength(2);
    expect(f.obstacleLabels.features[0]!.properties!.label).toContain('7');
  });

  it('emits trajectory line + vertices when moving', () => {
    const f = buildScenarioFeatures(proj, fixture());
    expect(f.trajectories.features).toHaveLength(1);
    expect(f.trajectoryVertices.features).toHaveLength(2);
  });

  it('emits ego start/end/route', () => {
    const f = buildScenarioFeatures(proj, fixture());
    const roles = f.ego.features.map((x) => x.properties!.role);
    expect(roles).toContain('egoStart');
    expect(roles).toContain('egoEnd');
    expect(roles).toContain('egoRoute');
  });

  it('emits traffic light point with mapped color', () => {
    const f = buildScenarioFeatures(proj, fixture());
    expect(f.trafficLights.features).toHaveLength(1);
    expect(f.trafficLights.features[0]!.properties!.color).toBe('#22c55e');
  });

  it('stamps uid on the obstacle box for feature-state selection', () => {
    const doc = fixture();
    const uid = doc.obstacles[0]!.uid;
    const f = buildScenarioFeatures(proj, doc);
    // 选中高亮改由 MapLibre feature-state 驱动（promoteId: 'uid'），
    // 因此特征只需携带稳定 uid，不再烘焙 selected 布尔。
    expect(f.obstacleBoxes.features[0]!.properties!.uid).toBe(uid);
    expect(f.obstacleBoxes.features[0]!.properties!.selected).toBeUndefined();
  });

  it('falls back to the unknown obstacle color for unsupported kinds', () => {
    expect(obstacleColor('constructionCone')).toBe(obstacleColor('unknown'));
  });

  it('omits trajectory line and vertex features when an obstacle has fewer than two path points', () => {
    const doc = fixture();
    doc.obstacles[0]!.trajectory = [doc.obstacles[0]!.trajectory[0]!];

    const f = buildScenarioFeatures(proj, doc);

    expect(f.obstacleBoxes.features).toHaveLength(1);
    expect(f.trajectories.features).toEqual([]);
    expect(f.trajectoryVertices.features).toEqual([]);
  });

  it('uses posed obstacle and ego positions for dynamic features while keeping static trajectories', () => {
    const doc = fixture();
    const ob = doc.obstacles[0]!;
    const posedObstacle = { x: 423320, y: 4438820, h: Math.PI / 2 };
    const posedEgo = { x: 423350, y: 4438850, h: 0.25 };
    const posed: PosedScenario = {
      obstacles: [{ uid: ob.uid, position: posedObstacle }],
      trafficLights: [],
      ego: { position: posedEgo },
    };

    const f = buildScenarioFeatures(proj, doc, posed);
    const label = f.obstacleLabels.features[0]!.geometry as GeoJSON.Point;
    const heading = f.obstacleHeading.features[0]!.geometry as GeoJSON.LineString;
    const staticTrajectory = f.trajectories.features[0]!.geometry as GeoJSON.LineString;
    const egoCurrent = f.egoCurrent.features[0]!.geometry as GeoJSON.Point;

    expect(label.coordinates).toEqual(worldToLngLat(proj, posedObstacle));
    expect(heading.coordinates[0]).toEqual(worldToLngLat(proj, posedObstacle));
    expect(staticTrajectory.coordinates[0]).toEqual(worldToLngLat(proj, ob.trajectory[0]!));
    expect(egoCurrent.coordinates).toEqual(worldToLngLat(proj, posedEgo));
  });

  it('falls back to the document obstacle pose when posed data omits that uid', () => {
    const doc = fixture();
    const ob = doc.obstacles[0]!;
    const posed: PosedScenario = {
      obstacles: [{ uid: 'other-obstacle', position: { x: 1, y: 2, h: 3 } }],
      trafficLights: [],
      ego: null,
    };

    const f = buildScenarioFeatures(proj, doc, posed);
    const label = f.obstacleLabels.features[0]!.geometry as GeoJSON.Point;

    expect(label.coordinates).toEqual(worldToLngLat(proj, ob.position));
    expect(f.egoCurrent.features).toEqual([]);
  });

  it('uses posed traffic light colors and falls back to neutral for unsupported colors', () => {
    const doc = fixture();
    const tl = doc.trafficLights[0]!;
    const posed: PosedScenario = {
      obstacles: [],
      trafficLights: [{ uid: tl.uid, color: 'BLUE' as never, blink: false }],
      ego: null,
    };

    const f = buildScenarioFeatures(proj, doc, posed);

    expect(f.trafficLights.features[0]!.properties).toMatchObject({
      uid: tl.uid,
      color: '#9ca3af',
      initialColor: 'GREEN',
    });
  });
});
