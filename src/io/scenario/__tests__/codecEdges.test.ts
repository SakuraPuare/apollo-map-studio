import { describe, expect, it } from 'vitest';
import type { ScenarioEvent } from '@/types/scenario';
import { makeBlankScenario, makeObstacle, makeTrafficLight, nextApolloId } from '../factory';
import { parseScenario } from '../parse';
import { serializeScenario } from '../serialize';

function uncommonOpenScenarioRaw() {
  return {
    id: 'edge-open',
    tags: ['keep', 123, 'also-keep'],
    scenario: {
      roadNetwork: {
        logicFile: { filepath: 'modules/map/data/edge' },
        trafficLights: [
          {
            id: 'TL_bad_color',
            location: { x: 100, y: 200 },
            triggerType: 'UNKNOWN_TRIGGER',
            initialState: { color: 'BLUE', blink: true },
            stateGroup: [
              { color: 'PURPLE', keepTime: 'not-a-number', blink: true },
              { keepTime: 5 },
              null,
            ],
          },
        ],
      },
      entities: {
        scenarioObjects: [
          {
            name: 'bike',
            id: 10,
            entityObject: {
              vehicle: {
                vehicleCategory: 'bicycle',
                boundingBox: { dimensions: { length: 2, width: 0.7, height: 1.2 } },
              },
            },
          },
          {
            name: 'ped',
            id: 11,
            entityObject: {
              pedestrian: {
                boundingBox: { dimensions: { length: 0.5, width: 0.6, height: 1.8 } },
              },
            },
          },
          {
            name: 'static',
            id: 12,
            entityObject: {
              unknownUnmovableObject: {
                boundingBox: { dimensions: { length: 3, width: 4, height: 5 } },
              },
            },
          },
          { name: 'mystery', id: 13, entityObject: {} },
          'ignored-object',
        ],
      },
      storyboard: {
        init: {
          actions: {
            privates: [
              {
                entityRef: { entityRef: 'bike' },
                privateActions: [
                  {
                    teleportAction: {
                      position: { worldPosition: { x: 1, y: 2, v: 4 } },
                    },
                  },
                  {
                    longitudinalAction: {
                      speedAction: {
                        speedActionTarget: { absoluteTargetSpeed: { value: 6 } },
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
                                  { position: { worldPosition: { x: 1, y: 2, h: 0.1 } } },
                                  'ignored-vertex',
                                  { position: { worldPosition: { x: 5, y: 6 } } },
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
              {
                entityRef: { entityRef: 'ped' },
                privateActions: [
                  { teleportAction: { position: { worldPosition: { x: 3, y: 4 } } } },
                ],
              },
              { entityRef: { entityRef: 'static' }, privateActions: [] },
            ],
          },
        },
        stories: [
          {
            acts: [
              {
                maneuverGroups: [
                  {
                    actors: {
                      entityRefs: [{ entityRef: 'bike' }, { entityRef: 'ped' }, {}, 'bad-ref'],
                    },
                    maneuvers: [
                      {
                        events: [
                          {
                            name: 'distance-speed',
                            actions: [
                              {
                                privateAction: {
                                  longitudinalAction: {
                                    speedAction: {
                                      speedActionTarget: {
                                        absoluteTargetSpeed: { value: 9 },
                                      },
                                    },
                                  },
                                },
                              },
                            ],
                            startTrigger: {
                              conditionGroups: [
                                {
                                  conditions: [
                                    {
                                      byEntityCondition: {
                                        entityCondition: {
                                          distanceCondition: {
                                            rule: 'lessOrEqual',
                                            value: 12,
                                            relativeDistanceType: 'cartesianDistance',
                                            position: { worldPosition: { x: 7, y: 8 } },
                                          },
                                        },
                                      },
                                    },
                                  ],
                                },
                              ],
                            },
                          },
                          {
                            name: 'relative-lane',
                            actions: [
                              {
                                privateAction: {
                                  lateralAction: {
                                    laneChangeAction: {
                                      laneChangeActionDynamics: {
                                        dynamicsDimension: 'time',
                                        value: 3,
                                      },
                                      laneChangeTarget: {
                                        relativeTargetLane: {
                                          value: -1,
                                          entityRef: { entityRef: 'leader' },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            ],
                            startTrigger: {
                              conditionGroups: [
                                {
                                  conditions: [
                                    {
                                      byEntityCondition: {
                                        entityCondition: {
                                          relativeDistanceCondition: {
                                            rule: 'greaterOrEqual',
                                            value: 4,
                                            entityRef: { entityRef: 'leader' },
                                            relativeDistanceType: 'longitudinal',
                                          },
                                        },
                                      },
                                    },
                                  ],
                                },
                              ],
                            },
                          },
                          {
                            name: 'ignored',
                            actions: [{ privateAction: { lateralAction: {} } }],
                            startTrigger: { conditionGroups: [] },
                          },
                        ],
                      },
                      'ignored-maneuver',
                    ],
                  },
                ],
              },
              'ignored-act',
            ],
          },
          'ignored-story',
        ],
        stopTrigger: {
          conditionGroups: [
            {},
            {
              conditions: [
                {},
                {
                  byValueCondition: {
                    simulationTimeCondition: { value: 55 },
                  },
                },
              ],
            },
          ],
        },
      },
      autoCarInfo: {
        start: { x: 0, y: 0, heading: 1 },
        end: { x: 10, y: 10 },
        routingRequest: {
          waypoint: [{}, { pose: { x: 5, y: 5 } }, { pose: { x: 'bad', y: 2 } }],
        },
        parkingPoint: { x: 9, y: 9 },
        startVelocity: 2,
        startAcceleration: 0.5,
      },
    },
  };
}

describe('scenario codec edges: parse', () => {
  it('rejects unrecognized scenario JSON', () => {
    expect(() => parseScenario({ scenario: { nope: true } })).toThrow(
      '[scenario] unrecognized scenario JSON',
    );
  });

  it('normalizes uncommon but valid openscenario structures', () => {
    const doc = parseScenario(uncommonOpenScenarioRaw());

    expect(doc.meta.tags).toEqual(['keep', 'also-keep']);
    expect(doc.meta.simulatorTime).toBe(55);
    expect(doc.ego).toMatchObject({
      start: { x: 0, y: 0, h: 1 },
      waypoints: [{ x: 5, y: 5 }],
      parkingPoint: { x: 9, y: 9 },
      startVelocity: 2,
      startAcceleration: 0.5,
    });

    expect(doc.obstacles.map((o) => o.kind)).toEqual([
      'bicycle',
      'pedestrian',
      'staticObstacle',
      'unknown',
    ]);
    expect(doc.obstacles[0]).toMatchObject({
      name: 'bike',
      position: { x: 1, y: 2, v: 4 },
      initialSpeed: 6,
      moving: true,
      trajectory: [
        { x: 1, y: 2, h: 0.1 },
        { x: 5, y: 6 },
      ],
    });
    expect(doc.obstacles[3]!.dimensions).toEqual({ length: 1, width: 1, height: 1 });

    const bikeEvents = doc.obstacles[0]!.events;
    const pedEvents = doc.obstacles[1]!.events;
    expect(bikeEvents).toHaveLength(2);
    expect(pedEvents).toHaveLength(2);
    expect(bikeEvents[0]).toMatchObject({
      name: 'distance-speed',
      action: {
        kind: 'speed',
        targetSpeed: 9,
        dynamicsDimension: 'distance',
        dynamicsValue: 0,
      },
      trigger: {
        kind: 'distance',
        rule: 'lessOrEqual',
        value: 12,
        position: { x: 7, y: 8 },
        relativeDistanceType: 'cartesianDistance',
      },
    });
    expect(bikeEvents[1]).toMatchObject({
      name: 'relative-lane',
      action: {
        kind: 'laneChange',
        relativeTargetLane: -1,
        targetRef: 'leader',
        dynamicsDimension: 'time',
        dynamicsValue: 3,
      },
      trigger: {
        kind: 'relativeDistance',
        targetRef: 'leader',
        relativeDistanceType: 'longitudinal',
      },
    });

    expect(doc.trafficLights[0]).toMatchObject({
      triggerType: 'NA',
      initialColor: 'RED',
      initialBlink: true,
      stateGroup: [
        { color: 'RED', blink: true },
        { color: 'RED', keepTime: 5 },
      ],
    });
  });
});

describe('scenario codec edges: serialize', () => {
  it('rebuilds openscenario ego waypoints when waypoint count changes', () => {
    const doc = parseScenario({
      id: 'ego-waypoints',
      scenario: {
        autoCarInfo: {
          start: { x: 0, y: 0, heading: 0 },
          end: { x: 10, y: 0 },
          routingRequest: {
            waypoint: [{ pose: { x: 1, y: 1 } }],
          },
        },
      },
    });

    doc.ego.waypoints = [
      { x: 2, y: 3 },
      { x: 4, y: 5 },
    ];

    const out = serializeScenario(doc) as any;

    expect(out.scenario.autoCarInfo.routingRequest.waypoint).toEqual([
      { pose: { x: 2, y: 3 } },
      { pose: { x: 4, y: 5 } },
    ]);
  });

  it('appends lane-change events with distance and relative-distance triggers', () => {
    const doc = makeBlankScenario('openscenario', { mapDir: 'modules/map/data/edge' });
    const ob = makeObstacle('vehicle', { x: 0, y: 0 }, nextApolloId(doc));
    const distanceLaneChange: ScenarioEvent = {
      uid: 'ev-distance-lane',
      name: 'distance-lane',
      ref: null,
      trigger: {
        kind: 'distance',
        rule: 'lessOrEqual',
        value: 12,
        position: { x: 4, y: 5 },
        relativeDistanceType: 'cartesianDistance',
      },
      action: {
        kind: 'laneChange',
        relativeTargetLane: -1,
        dynamicsDimension: 'time',
        dynamicsValue: 2,
      },
    };
    const relativeSpeed: ScenarioEvent = {
      uid: 'ev-relative-speed',
      name: 'relative-speed',
      ref: null,
      trigger: {
        kind: 'relativeDistance',
        rule: 'greaterOrEqual',
        value: 6,
        targetRef: 'leader',
        relativeDistanceType: 'longitudinal',
      },
      action: {
        kind: 'speed',
        targetSpeed: 7,
        dynamicsShape: 'linear',
        dynamicsDimension: 'rate',
        dynamicsValue: 1,
      },
    };
    ob.events.push(distanceLaneChange, relativeSpeed);
    doc.obstacles.push(ob);

    const out = serializeScenario(doc) as any;
    const events = out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events;

    expect(events).toHaveLength(2);
    expect(
      events[0].startTrigger.conditionGroups[0].conditions[0].byEntityCondition.triggeringEntities
        .entityRefs[0],
    ).toEqual({ entityRef: ob.name });
    expect(
      events[0].startTrigger.conditionGroups[0].conditions[0].byEntityCondition.entityCondition
        .distanceCondition,
    ).toMatchObject({
      rule: 'lessOrEqual',
      value: 12,
      relativeDistanceType: 'cartesianDistance',
      position: { worldPosition: { x: 4, y: 5 } },
    });
    expect(
      events[0].actions[0].privateAction.lateralAction.laneChangeAction.laneChangeTarget
        .relativeTargetLane,
    ).toEqual({ value: -1 });
    expect(
      events[1].startTrigger.conditionGroups[0].conditions[0].byEntityCondition.entityCondition
        .relativeDistanceCondition,
    ).toMatchObject({
      rule: 'greaterOrEqual',
      value: 6,
      entityRef: { entityRef: 'leader' },
      relativeDistanceType: 'longitudinal',
    });

    const reparsed = parseScenario(out);
    expect(reparsed.obstacles[0]!.events.map((ev) => ev.action.kind)).toEqual([
      'laneChange',
      'speed',
    ]);
  });

  it('creates missing openscenario holders only when appending modeled entities', () => {
    const doc = parseScenario({
      id: 'sparse-open',
      scenario: {
        entities: { scenarioObjects: [] },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      },
    });
    doc.obstacles.push(makeObstacle('staticObstacle', { x: 3, y: 4 }, nextApolloId(doc)));
    doc.trafficLights.push(makeTrafficLight({ x: 1, y: 2 }, 'Sig_new'));

    const out = serializeScenario(doc) as any;

    expect(out.scenario.entities.scenarioObjects[0]).toMatchObject({
      name: '1',
      id: 1,
      entityObject: {
        unknownUnmovableObject: { boundingBox: { dimensions: doc.obstacles[0]!.dimensions } },
      },
    });
    expect(out.scenario.storyboard.init.actions.privates[0].entityRef).toEqual({
      entityRef: '1',
    });
    expect(out.scenario.roadNetwork.trafficLights[0]).toMatchObject({
      id: 'Sig_new',
      location: { x: 1, y: 2 },
      initialState: { color: 'GREEN' },
    });
  });

  it('creates storyboard only when appending a new openscenario event', () => {
    const doc = parseScenario({
      id: 'event-without-storyboard',
      scenario: {
        entities: {
          scenarioObjects: [
            {
              name: 'NPC_A',
              id: 21,
              entityObject: {
                vehicle: {
                  vehicleCategory: 'car',
                  boundingBox: { dimensions: { length: 4, width: 2, height: 1.5 } },
                },
              },
            },
          ],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
    });
    doc.obstacles[0]!.events.push({
      uid: 'new-event',
      name: '',
      ref: null,
      trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 5 },
      action: {
        kind: 'speed',
        targetSpeed: 4,
        dynamicsShape: 'linear',
        dynamicsDimension: 'time',
        dynamicsValue: 1,
      },
    });

    const out = serializeScenario(doc) as any;

    expect(out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0]).toMatchObject({
      actors: { entityRefs: [{ entityRef: 'NPC_A' }] },
    });
    expect(
      out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events[0]
        .startTrigger.conditionGroups[0].conditions[0].byValueCondition.simulationTimeCondition,
    ).toEqual({ rule: 'greaterOrEqual', value: 5 });
  });

  it('creates missing classic arrays for appended actors and lights', () => {
    const doc = parseScenario({
      id: 'sparse-classic',
      scenario: {
        start: { x: 0, y: 0, heading: 0 },
        end: { x: 10, y: 0 },
        mapDir: 'modules/map/data/classic',
      },
    });
    const ob = makeObstacle('bicycle', { x: 3, y: 4, h: 0.2 }, nextApolloId(doc));
    ob.initialSpeed = 2;
    ob.triggerType = 'TIME';
    ob.triggerValue = 3;
    ob.trajectory = [
      { x: 3, y: 4, speed: 2 },
      { x: 6, y: 8 },
    ];
    doc.obstacles.push(ob);
    const tl = makeTrafficLight({ x: 9, y: 10 }, 'ClassicSig');
    tl.triggerType = 'DISTANCE';
    tl.triggerValue = 15;
    doc.trafficLights.push(tl);

    const out = serializeScenario(doc) as any;

    expect(out.scenario.agent[0]).toMatchObject({
      id: 1,
      type: 'BICYCLE',
      motiontype: 'TRACKED',
      startDistance: 3,
      trackedPoint: [
        { x: 3, y: 4, speed: 2 },
        { x: 6, y: 8 },
      ],
    });
    expect(out.scenario.trafficLights[0]).toMatchObject({
      id: 'ClassicSig',
      triggerType: 'DISTANCE',
      triggerValue: 15,
    });
  });

  it('classic: preserves unknown type until kind changes and rebuilds tracked points when count changes', () => {
    const doc = parseScenario({
      id: 'classic-unknown',
      scenario: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        agent: [
          {
            id: 8,
            type: 'ALIEN',
            width: 1,
            length: 2,
            height: 3,
            motiontype: 'TRACKED',
            startPosition: { x: 1, y: 2, heading: 0.5, speed: 2 },
            trackedPoint: [{ x: 1, y: 2, speed: 2 }],
          },
        ],
      },
    });

    const unchanged = serializeScenario(doc) as any;
    expect(unchanged.scenario.agent[0].type).toBe('ALIEN');

    doc.obstacles[0]!.kind = 'pedestrian';
    doc.obstacles[0]!.trajectory = [
      { x: 1, y: 2, speed: 2 },
      { x: 3, y: 4 },
    ];
    const changed = serializeScenario(doc) as any;

    expect(changed.scenario.agent[0].type).toBe('PEDESTRIAN');
    expect(changed.scenario.agent[0].trackedPoint).toEqual([
      { x: 1, y: 2, speed: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('rebuilds traffic light state groups when the edited count differs', () => {
    const doc = parseScenario({
      id: 'tl-state-count',
      scenario: {
        roadNetwork: {
          trafficLights: [
            {
              id: 'Signal_Count',
              location: { x: 1, y: 2 },
              initialState: { color: 'RED' },
              stateGroup: [{ color: 'RED', keepTime: 1 }],
            },
          ],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      },
    });

    doc.trafficLights[0]!.stateGroup = [
      { color: 'GREEN', keepTime: 10 },
      { color: 'YELLOW', keepTime: 2, blink: true },
    ];
    const out = serializeScenario(doc) as any;

    expect(out.scenario.roadNetwork.trafficLights[0].stateGroup).toEqual([
      { color: 'GREEN', keepTime: 10 },
      { color: 'YELLOW', keepTime: 2, blink: true },
    ]);
  });

  it('rebuilds a missing openscenario entityObject when an existing unknown actor is edited', () => {
    const doc = parseScenario({
      id: 'missing-entity-object',
      scenario: {
        entities: { scenarioObjects: [{ name: 'unknownish', id: 7 }] },
        storyboard: { init: { actions: { privates: [] } } },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      },
    });
    doc.obstacles[0]!.kind = 'pedestrian';
    doc.obstacles[0]!.dimensions = { length: 0.6, width: 0.7, height: 1.9 };

    const out = serializeScenario(doc) as any;

    expect(out.scenario.entities.scenarioObjects[0].entityObject).toEqual({
      pedestrian: {
        pedestrianCategory: 'pedestrian',
        boundingBox: { dimensions: { length: 0.6, width: 0.7, height: 1.9 } },
      },
    });
  });
});
