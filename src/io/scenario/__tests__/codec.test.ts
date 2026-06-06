import { describe, it, expect } from 'vitest';
import { parseScenario } from '../parse';
import { serializeScenario } from '../serialize';
import { detectScenarioFormat } from '../detect';

/** 一个最小但结构完整的 openscenario 文件，含 schema 之外的字段（trafficFlow）。 */
function openScenarioFixture() {
  return {
    id: 'fix1',
    authorName: 'tester',
    scenario: {
      roadNetwork: {
        logicFile: { filepath: 'modules/map/data/apollo_virtual_map' },
        trafficLights: [
          {
            id: 'Signal_1',
            location: { x: 100, y: 200 },
            triggerType: 'DISTANCE',
            triggerValue: 40,
            initialState: { color: 'RED' },
            stateGroup: [
              { color: 'RED', keepTime: 25 },
              { color: 'GREEN', keepTime: 20 },
            ],
          },
        ],
      },
      entities: {
        scenarioObjects: [
          {
            name: '5639',
            id: 5639,
            entityObject: {
              vehicle: {
                vehicleCategory: 'car',
                boundingBox: { dimensions: { length: 4, width: 2, height: 1.6 } },
              },
            },
          },
        ],
      },
      storyboard: {
        init: {
          actions: {
            privates: [
              {
                entityRef: { entityRef: '5639' },
                privateActions: [
                  { teleportAction: { position: { worldPosition: { x: 10, y: 20, h: 1.5 } } } },
                  {
                    longitudinalAction: {
                      speedAction: {
                        speedActionDynamics: {
                          dynamicsDimension: 'distance',
                          dynamicsShape: 'linear',
                          value: 0,
                        },
                        speedActionTarget: { absoluteTargetSpeed: { value: 3 } },
                      },
                    },
                  },
                  {
                    routingAction: {
                      followTrajectoryAction: {
                        trajectoryRef: {
                          trajectory: {
                            shape: {
                              polyline: {
                                vertices: [
                                  { position: { worldPosition: { x: 10, y: 20, h: 1.5 } } },
                                  { position: { worldPosition: { x: 30, y: 40 } } },
                                ],
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        stories: [],
        stopTrigger: {
          conditionGroups: [
            {
              conditions: [
                {
                  conditionEdge: 'none',
                  name: 'end',
                  byValueCondition: {
                    simulationTimeCondition: { rule: 'greaterOrEqual', value: 100 },
                  },
                },
              ],
            },
          ],
        },
      },
      autoCarInfo: {
        start: { x: 1, y: 2, heading: 0.5 },
        end: { x: 5, y: 6 },
        routingRequest: { waypoint: [{ pose: { x: 1, y: 2 } }, { pose: { x: 5, y: 6 } }] },
        startVelocity: 2,
      },
      gradingConfigInfo: {
        baseGradeConfigFile: 'grading_system/conf/grading_metrics_default.conf',
      },
      // schema 之外的字段 —— 必须原样保留
      trafficFlow: true,
      detectDistance: 50,
    },
    type: 'worldsim',
    mapId: 'map1',
    tags: ['Curve'],
    time: 'now',
    descriptionEnTokens: ['x'],
  };
}

function classicFixture() {
  return {
    id: 'fix2',
    scenario: {
      start: { x: 100, y: 200, heading: 3.1 },
      end: { x: 300, y: 400 },
      mapDir: 'modules/map/data/apollo_virutal_map',
      simulatorTime: 100,
      agent: [
        {
          id: 5090,
          width: 2,
          length: 5,
          height: 1.5,
          type: 'VEHICLE',
          trackedPoint: [
            { x: 751, y: 2563, speed: 3 },
            { x: 752, y: 2564, speed: 3 },
          ],
          motiontype: 'TRACKED',
          startPosition: { x: 750, y: 2563, heading: 0.02, speed: 8 },
          startDistance: 25,
          triggerType: 'DISTANCE',
          startTime: 5, // schema 之外字段
        },
      ],
      trafficLights: [
        {
          id: '451089194',
          location: { x: 752, y: 2566 },
          triggerType: 'DISTANCE',
          triggerValue: 30,
          initialState: { color: 'RED' },
          stateGroup: [{ color: 'RED', keepTime: 25 }],
        },
      ],
    },
    type: 'worldsim',
    mapId: 'map1',
    tags: [],
    time: 'now',
    descriptionEnTokens: [],
  };
}

describe('scenario codec — parse correctness', () => {
  it('detects formats', () => {
    expect(detectScenarioFormat(openScenarioFixture())).toBe('openscenario');
    expect(detectScenarioFormat(classicFixture())).toBe('classic');
    expect(detectScenarioFormat({})).toBe(null);
  });

  it('parses openscenario obstacle, ego, traffic light', () => {
    const doc = parseScenario(openScenarioFixture());
    expect(doc.format).toBe('openscenario');
    expect(doc.obstacles).toHaveLength(1);
    const ob = doc.obstacles[0]!;
    expect(ob.name).toBe('5639');
    expect(ob.apolloId).toBe(5639);
    expect(ob.kind).toBe('vehicle');
    expect(ob.dimensions).toEqual({ length: 4, width: 2, height: 1.6 });
    expect(ob.position).toMatchObject({ x: 10, y: 20, h: 1.5 });
    expect(ob.initialSpeed).toBe(3);
    expect(ob.moving).toBe(true);
    expect(ob.trajectory).toHaveLength(2);
    expect(doc.ego.start).toMatchObject({ x: 1, y: 2, h: 0.5 });
    expect(doc.ego.waypoints).toHaveLength(2);
    expect(doc.trafficLights).toHaveLength(1);
    expect(doc.trafficLights[0]!.signalId).toBe('Signal_1');
    expect(doc.meta.mapDir).toBe('modules/map/data/apollo_virtual_map');
    expect(doc.meta.simulatorTime).toBe(100);
  });

  it('parses classic agent', () => {
    const doc = parseScenario(classicFixture());
    expect(doc.format).toBe('classic');
    const ob = doc.obstacles[0]!;
    expect(ob.kind).toBe('vehicle');
    expect(ob.dimensions).toEqual({ length: 5, width: 2, height: 1.5 });
    expect(ob.moving).toBe(true);
    expect(ob.trajectory).toHaveLength(2);
    expect(ob.initialSpeed).toBe(8);
    expect(doc.ego.start).toMatchObject({ x: 100, y: 200, h: 3.1 });
    expect(doc.meta.simulatorTime).toBe(100);
  });
});

describe('scenario codec — edit application (openscenario)', () => {
  it('applies obstacle position/dimension/speed edits', () => {
    const doc = parseScenario(openScenarioFixture());
    doc.obstacles[0]!.position = { x: 99, y: 88, h: 0.7 };
    doc.obstacles[0]!.dimensions = { length: 6, width: 2.2, height: 1.9 };
    doc.obstacles[0]!.initialSpeed = 12;
    const out = serializeScenario(doc) as any;
    const obj = out.scenario.entities.scenarioObjects[0];
    expect(obj.entityObject.vehicle.boundingBox.dimensions).toEqual({
      length: 6,
      width: 2.2,
      height: 1.9,
    });
    const priv = out.scenario.storyboard.init.actions.privates[0];
    expect(priv.privateActions[0].teleportAction.position.worldPosition).toMatchObject({
      x: 99,
      y: 88,
      h: 0.7,
    });
    expect(
      priv.privateActions[1].longitudinalAction.speedAction.speedActionTarget.absoluteTargetSpeed
        .value,
    ).toBe(12);
  });

  it('preserves schema-external fields (trafficFlow, detectDistance) after edit', () => {
    const doc = parseScenario(openScenarioFixture());
    doc.obstacles[0]!.initialSpeed = 5;
    const out = serializeScenario(doc) as any;
    expect(out.scenario.trafficFlow).toBe(true);
    expect(out.scenario.detectDistance).toBe(50);
  });

  it('rebuilds trajectory when vertex count changes', () => {
    const doc = parseScenario(openScenarioFixture());
    doc.obstacles[0]!.trajectory = [
      { x: 0, y: 0, h: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    const out = serializeScenario(doc) as any;
    const verts =
      out.scenario.storyboard.init.actions.privates[0].privateActions[2].routingAction
        .followTrajectoryAction.trajectoryRef.trajectory.shape.polyline.vertices;
    expect(verts).toHaveLength(3);
    expect(verts[2].position.worldPosition).toEqual({ x: 2, y: 2 });
  });

  it('applies ego start/end edits', () => {
    const doc = parseScenario(openScenarioFixture());
    doc.ego.start = { x: 11, y: 22, h: 1.1 };
    doc.ego.end = { x: 33, y: 44 };
    const out = serializeScenario(doc) as any;
    expect(out.scenario.autoCarInfo.start).toMatchObject({ x: 11, y: 22, heading: 1.1 });
    expect(out.scenario.autoCarInfo.end).toMatchObject({ x: 33, y: 44 });
  });

  it('applies traffic light edits', () => {
    const doc = parseScenario(openScenarioFixture());
    doc.trafficLights[0]!.location = { x: 500, y: 600 };
    doc.trafficLights[0]!.initialColor = 'GREEN';
    const out = serializeScenario(doc) as any;
    expect(out.scenario.roadNetwork.trafficLights[0].location).toMatchObject({ x: 500, y: 600 });
    expect(out.scenario.roadNetwork.trafficLights[0].initialState.color).toBe('GREEN');
  });
});

describe('scenario codec — edit application (classic)', () => {
  it('applies agent edits and preserves startTime', () => {
    const doc = parseScenario(classicFixture());
    doc.obstacles[0]!.dimensions = { length: 7, width: 3, height: 2 };
    doc.obstacles[0]!.position = { x: 1, y: 2, h: 0.1 };
    const out = serializeScenario(doc) as any;
    const a = out.scenario.agent[0];
    expect(a.length).toBe(7);
    expect(a.width).toBe(3);
    expect(a.startPosition).toMatchObject({ x: 1, y: 2, heading: 0.1 });
    expect(a.startTime).toBe(5); // schema-external preserved
  });

  it('rebuilds classic trackedPoint when vertex count changes', () => {
    const doc = parseScenario(classicFixture());
    doc.obstacles[0]!.trajectory = [
      { x: 10, y: 20, speed: 1 },
      { x: 11, y: 21 },
      { x: 12, y: 22, speed: 4 },
    ];
    const out = serializeScenario(doc) as any;
    const tracked = out.scenario.agent[0].trackedPoint;
    expect(tracked).toHaveLength(3);
    expect(tracked[0]).toEqual({ x: 10, y: 20, speed: 1 });
    expect(tracked[1]).toEqual({ x: 11, y: 21 }); // no speed key when undefined
    expect(tracked[2]).toEqual({ x: 12, y: 22, speed: 4 });
  });

  it('writes classic agent.type when kind changes, preserves it otherwise', () => {
    const unchanged = parseScenario(classicFixture());
    expect((serializeScenario(unchanged) as any).scenario.agent[0].type).toBe('VEHICLE');

    const changed = parseScenario(classicFixture());
    changed.obstacles[0]!.kind = 'pedestrian';
    expect((serializeScenario(changed) as any).scenario.agent[0].type).toBe('PEDESTRIAN');
  });
});
