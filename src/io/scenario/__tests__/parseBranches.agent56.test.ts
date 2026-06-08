import { describe, expect, it } from 'vitest';
import { isModeledRawEvent, parseScenario } from '../parse';

function speedAction(value: unknown, dynamicsDimension?: unknown, dynamicsValue?: unknown) {
  return {
    privateAction: {
      longitudinalAction: {
        speedAction: {
          speedActionDynamics:
            dynamicsDimension === undefined
              ? undefined
              : { dynamicsDimension, value: dynamicsValue },
          speedActionTarget: { absoluteTargetSpeed: { value } },
        },
      },
    },
  };
}

describe('scenario parse branch edges (agent56)', () => {
  it('classifies modeled raw events and treats missing or malformed actions as unmodeled', () => {
    expect(isModeledRawEvent(null)).toBe(false);
    expect(isModeledRawEvent({ actions: 'missing-array' })).toBe(false);
    expect(isModeledRawEvent({ actions: [null, { privateAction: { lateralAction: {} } }] })).toBe(
      false,
    );
    expect(
      isModeledRawEvent({ actions: ['ignored', speedAction('bad-speed', 'sideways', 7)] }),
    ).toBe(true);
    expect(
      isModeledRawEvent({
        actions: [
          {
            privateAction: {
              lateralAction: {
                laneChangeAction: {
                  laneChangeTarget: { relativeTargetLane: { value: 'bad-lane' } },
                },
              },
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it('normalizes malformed openscenario obstacles, traffic lights, and sparse storyboard events', () => {
    const doc = parseScenario({
      id: 'parse-branch-open',
      tags: ['keep', 9, 'also-keep'],
      scenario: {
        roadNetwork: {
          trafficLights: [
            null,
            {
              id: 123,
              location: { x: 'bad-x', y: 2 },
              triggerType: 'DISTANCE',
              triggerValue: 'bad-trigger',
              initialState: 'bad-initial',
              stateGroup: 'bad-states',
            },
            {
              id: 'TL_optional_blink',
              location: { x: 3, y: 4, heading: 0.5, speed: 6 },
              triggerType: 'TIME',
              triggerValue: 11,
              initialState: { color: 'GREEN', blink: false },
              stateGroup: [
                { color: 'YELLOW' },
                { color: 'GREEN', blink: 'not-boolean', keepTime: 2 },
                { color: 'BLUE', blink: true, keepTime: 'bad-keep-time' },
                'bad-state',
              ],
            },
          ],
        },
        entities: {
          scenarioObjects: [
            null,
            {
              id: 'bad-id',
              entityObject: {
                vehicle: {
                  vehicleCategory: 'car',
                  boundingBox: { dimensions: { length: 'long', width: 2 } },
                },
              },
            },
            {
              name: 'NPC_A',
              id: 42,
              entityObject: {
                pedestrian: {
                  boundingBox: { dimensions: { length: 0.5, width: 0.6, height: 1.7 } },
                },
              },
            },
            {
              name: 'NoPrivate',
              id: 43,
              entityObject: { unknownUnmovableObject: { boundingBox: {} } },
            },
          ],
        },
        storyboard: {
          init: {
            actions: {
              privates: [
                {
                  entityRef: { entityRef: 'NPC_A' },
                  privateActions: [
                    null,
                    { teleportAction: { position: { worldPosition: { x: 10, y: 20 } } } },
                    {
                      longitudinalAction: {
                        speedAction: {
                          speedActionTarget: { absoluteTargetSpeed: { value: 'bad-speed' } },
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
                                    null,
                                    { position: { worldPosition: { x: 10, y: 20, h: 1 } } },
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
                  entityRef: { entityRef: 'NoPrivate' },
                  privateActions: 'bad-actions',
                },
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
                        entityRefs: [{ entityRef: 'NPC_A' }, { entityRef: '' }, 'bad-ref'],
                      },
                      maneuvers: [
                        {
                          events: [
                            null,
                            { name: 'no-actions' },
                            {
                              name: 'modeled-speed-defaults',
                              actions: ['ignored-action', speedAction('bad-speed', 'rate', 'bad')],
                              startTrigger: {
                                conditionGroups: [
                                  'bad-group',
                                  {
                                    conditions: [
                                      {
                                        byValueCondition: {
                                          simulationTimeCondition: {
                                            rule: 'lessOrEqual',
                                            value: 'bad-time',
                                          },
                                        },
                                      },
                                    ],
                                  },
                                ],
                              },
                            },
                            {
                              name: 'modeled-lane-defaults',
                              actions: [
                                {
                                  privateAction: {
                                    lateralAction: {
                                      laneChangeAction: {
                                        laneChangeTarget: {
                                          relativeTargetLane: {
                                            value: 'bad-lane',
                                            entityRef: 'bad-ref-shape',
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
                                              rule: 'lessOrEqual',
                                              value: 'bad-distance',
                                              entityRef: 'Leader',
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
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        autoCarInfo: {
          start: { x: 'bad-start-x', y: 0 },
          end: { x: 1, y: 2, v: 3 },
          routingRequest: { waypoint: [{ pose: { x: 5, y: 6, speed: 7 } }, { pose: null }] },
        },
      },
    });

    expect(doc.meta.tags).toEqual(['keep', 'also-keep']);
    expect(doc.ego).toMatchObject({
      start: { x: 0, y: 0 },
      end: { x: 1, y: 2, v: 3 },
      waypoints: [{ x: 5, y: 6, v: 7 }],
    });

    expect(doc.trafficLights).toHaveLength(3);
    expect(doc.trafficLights[0]).toMatchObject({
      signalId: '',
      location: { x: 0, y: 0 },
      triggerType: 'NA',
      initialColor: 'RED',
      initialBlink: undefined,
      stateGroup: [],
    });
    expect(doc.trafficLights[1]).toMatchObject({
      signalId: '',
      location: { x: 0, y: 0 },
      triggerType: 'DISTANCE',
      triggerValue: undefined,
      initialColor: 'RED',
      stateGroup: [],
    });
    expect(doc.trafficLights[2]).toMatchObject({
      signalId: 'TL_optional_blink',
      location: { x: 3, y: 4, h: 0.5, v: 6 },
      triggerType: 'TIME',
      triggerValue: 11,
      initialColor: 'GREEN',
      initialBlink: false,
      stateGroup: [
        { color: 'YELLOW', keepTime: undefined, blink: undefined },
        { color: 'GREEN', keepTime: 2, blink: undefined },
        { color: 'RED', keepTime: undefined, blink: true },
      ],
    });

    expect(doc.obstacles).toHaveLength(3);
    expect(doc.obstacles[0]).toMatchObject({
      name: '0',
      apolloId: 0,
      kind: 'vehicle',
      dimensions: { length: 1, width: 2, height: 1 },
      position: { x: 0, y: 0 },
      initialSpeed: 0,
      moving: false,
      trajectory: [],
      events: [],
    });
    expect(doc.obstacles[1]).toMatchObject({
      name: 'NPC_A',
      apolloId: 42,
      kind: 'pedestrian',
      position: { x: 10, y: 20 },
      initialSpeed: 0,
      moving: false,
      trajectory: [{ x: 10, y: 20, h: 1 }],
    });
    expect(doc.obstacles[2]).toMatchObject({
      name: 'NoPrivate',
      apolloId: 43,
      kind: 'staticObstacle',
      dimensions: { length: 1, width: 1, height: 1 },
      position: { x: 0, y: 0 },
      initialSpeed: 0,
      moving: false,
      trajectory: [],
    });

    expect(doc.obstacles[1]!.events).toHaveLength(2);
    expect(doc.obstacles[1]!.events[0]).toMatchObject({
      name: 'modeled-speed-defaults',
      action: {
        kind: 'speed',
        targetSpeed: 0,
        dynamicsDimension: 'rate',
        dynamicsValue: 0,
      },
      trigger: { kind: 'simulationTime', rule: 'lessOrEqual', value: 0 },
    });
    expect(doc.obstacles[1]!.events[1]).toMatchObject({
      name: 'modeled-lane-defaults',
      action: {
        kind: 'laneChange',
        relativeTargetLane: 0,
        targetRef: undefined,
        dynamicsDimension: 'distance',
        dynamicsValue: 0,
      },
      trigger: {
        kind: 'relativeDistance',
        rule: 'lessOrEqual',
        value: 0,
        targetRef: 'Leader',
        relativeDistanceType: 'longitudinal',
      },
    });
  });
});
