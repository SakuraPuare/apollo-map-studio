import { describe, expect, it } from 'vitest';
import type { ScenarioEvent } from '@/types/scenario';
import { parseScenario } from '../parse';
import { serializeScenario } from '../serialize';

function scenarioObject(name = 'NPC_A') {
  return {
    name,
    id: 101,
    entityObject: {
      vehicle: {
        vehicleCategory: 'car',
        boundingBox: { dimensions: { length: 4, width: 2, height: 1.5 } },
      },
    },
  };
}

function privateFor(name = 'NPC_A') {
  return {
    entityRef: { entityRef: name },
    privateActions: [
      { teleportAction: { position: { worldPosition: { x: 0, y: 0, h: 0 } } } },
      {
        longitudinalAction: {
          speedAction: {
            speedActionTarget: { absoluteTargetSpeed: { value: 1 } },
          },
        },
      },
    ],
  };
}

function speedEvent(name: string, startTrigger: unknown) {
  return {
    name,
    actions: [
      {
        privateAction: {
          longitudinalAction: {
            speedAction: {
              speedActionDynamics: { dynamicsDimension: 'time', value: 1 },
              speedActionTarget: { absoluteTargetSpeed: { value: 2 } },
            },
          },
        },
      },
    ],
    startTrigger,
  };
}

function laneChangeEvent(name: string, startTrigger: unknown) {
  return {
    name,
    actions: [
      {
        privateAction: {
          lateralAction: {
            laneChangeAction: {
              laneChangeActionDynamics: { dynamicsDimension: 'distance', value: 3 },
              laneChangeTarget: {
                relativeTargetLane: { entityRef: { entityRef: 'leader' }, value: 1 },
              },
            },
          },
        },
      },
    ],
    startTrigger,
  };
}

function openRawWithStories(stories: unknown[]) {
  return {
    id: 'open-story-edge',
    scenario: {
      entities: { scenarioObjects: [scenarioObject()] },
      storyboard: {
        init: { actions: { privates: [privateFor()] } },
        stories,
      },
      autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    },
  };
}

function eventGroup(events: unknown[]) {
  return {
    acts: [
      {
        maneuverGroups: [
          {
            actors: { entityRefs: [{ entityRef: 'NPC_A' }] },
            maneuvers: [{ events }],
          },
        ],
      },
    ],
  };
}

describe('serializeScenario event branch edges', () => {
  it('repairs malformed existing startTrigger shapes while patching existing events', () => {
    const raw = openRawWithStories([
      eventGroup([
        speedEvent('no-groups', {}),
        speedEvent('no-record-group', { conditionGroups: [null] }),
        speedEvent('no-conditions', { conditionGroups: [{}] }),
        laneChangeEvent('no-record-condition', { conditionGroups: [{ conditions: [null] }] }),
        { name: 'manual-ref-without-actions', actions: [] },
      ]),
    ]);
    const doc = parseScenario(raw);

    const events = doc.obstacles[0]!.events;
    events[0]!.trigger = { kind: 'simulationTime', rule: 'greaterOrEqual', value: 9 };
    events[1]!.trigger = {
      kind: 'distance',
      rule: 'lessOrEqual',
      value: 12,
      position: { x: 3, y: 4 },
      relativeDistanceType: 'cartesianDistance',
    };
    events[2]!.trigger = {
      kind: 'relativeDistance',
      rule: 'greaterOrEqual',
      value: 7,
      targetRef: 'leader',
      relativeDistanceType: 'longitudinal',
    };
    events[3]!.trigger = { kind: 'simulationTime', rule: 'greaterOrEqual', value: 11 };
    events[3]!.action = {
      kind: 'laneChange',
      relativeTargetLane: -2,
      dynamicsDimension: 'time',
      dynamicsValue: 4,
    };
    const manual: ScenarioEvent = {
      uid: 'manual',
      name: 'manual',
      ref: { storyIndex: 0, actIndex: 0, mgIndex: 0, manIndex: 0, eventIndex: 4 },
      trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 13 },
      action: {
        kind: 'speed',
        targetSpeed: 5,
        dynamicsShape: 'linear',
        dynamicsDimension: 'time',
        dynamicsValue: 1,
      },
    };
    events.push(manual);

    const out = serializeScenario(doc) as any;
    const rawEvents =
      out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events;

    expect(rawEvents[0].startTrigger.conditionGroups[0].conditions[0]).toMatchObject({
      conditionEdge: 'none',
      byValueCondition: { simulationTimeCondition: { rule: 'greaterOrEqual', value: 9 } },
    });
    expect(
      rawEvents[1].startTrigger.conditionGroups[1].conditions[0].byEntityCondition.entityCondition
        .distanceCondition,
    ).toMatchObject({
      rule: 'lessOrEqual',
      value: 12,
      position: { worldPosition: { x: 3, y: 4 } },
    });
    expect(
      rawEvents[2].startTrigger.conditionGroups[0].conditions[0].byEntityCondition.entityCondition
        .relativeDistanceCondition,
    ).toMatchObject({
      entityRef: { entityRef: 'leader' },
      relativeDistanceType: 'longitudinal',
    });
    expect(rawEvents[3].startTrigger.conditionGroups[0].conditions[1]).toMatchObject({
      byValueCondition: { simulationTimeCondition: { value: 11 } },
    });
    expect(
      rawEvents[3].actions[0].privateAction.lateralAction.laneChangeAction.laneChangeTarget
        .relativeTargetLane.entityRef,
    ).toBeUndefined();
    expect(rawEvents[4].actions[0].privateAction.longitudinalAction).toBeDefined();
    expect(rawEvents[4].startTrigger.conditionGroups[0].conditions[0]).toMatchObject({
      byValueCondition: { simulationTimeCondition: { value: 13 } },
    });
  });

  it('prunes deleted modeled events while keeping malformed stories and unmodeled events', () => {
    const raw = openRawWithStories([
      'bad-story',
      { acts: null },
      {
        acts: [
          'bad-act',
          {
            maneuverGroups: [
              'bad-maneuver-group',
              { actors: { entityRefs: [{ entityRef: 'NPC_A' }] }, maneuvers: null },
              {
                actors: { entityRefs: [{ entityRef: 'NPC_A' }] },
                maneuvers: [
                  {
                    events: [
                      speedEvent('modeled-drop', {
                        conditionGroups: [
                          {
                            conditions: [
                              {
                                byValueCondition: {
                                  simulationTimeCondition: { rule: 'greaterOrEqual', value: 2 },
                                },
                              },
                            ],
                          },
                        ],
                      }),
                      {
                        name: 'unmodeled-keep',
                        actions: [{ privateAction: { lateralAction: {} } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const doc = parseScenario(raw);
    expect(doc.obstacles[0]!.events.map((ev) => ev.name)).toEqual(['modeled-drop']);

    doc.obstacles[0]!.events = [];
    const out = serializeScenario(doc) as any;
    const kept = out.scenario.storyboard.stories[2].acts[1].maneuverGroups[2].maneuvers[0].events;

    expect(kept).toEqual([
      { name: 'unmodeled-keep', actions: [{ privateAction: { lateralAction: {} } }] },
    ]);
    expect(out.scenario.storyboard.stories[0]).toBe('bad-story');
  });

  it('appends new events into an existing actor group after skipping malformed story nodes', () => {
    const raw = openRawWithStories([
      'bad-story',
      {
        acts: [
          'bad-act',
          {
            maneuverGroups: [
              {
                actors: { entityRefs: [{ entityRef: 'NPC_A' }] },
                maneuvers: [],
              },
            ],
          },
        ],
      },
    ]);
    const doc = parseScenario(raw);
    doc.obstacles[0]!.events.push({
      uid: 'new-event',
      name: 'new-event',
      ref: null,
      trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 5 },
      action: {
        kind: 'speed',
        targetSpeed: 6,
        dynamicsShape: 'linear',
        dynamicsDimension: 'time',
        dynamicsValue: 2,
      },
    });

    const out = serializeScenario(doc) as any;
    const groups = out.scenario.storyboard.stories[1].acts[1].maneuverGroups;

    expect(out.scenario.storyboard.stories).toHaveLength(2);
    expect(groups[0].maneuvers[0].events[0]).toMatchObject({
      name: 'new-event',
      startTrigger: {
        conditionGroups: [
          {
            conditions: [
              {
                byValueCondition: {
                  simulationTimeCondition: { rule: 'greaterOrEqual', value: 5 },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it('keeps generated event and action names stable across repeated serializes', () => {
    const raw = openRawWithStories([eventGroup([])]);
    const doc = parseScenario(raw);
    doc.obstacles[0]!.events.push({
      uid: 'nameless-event',
      name: '',
      ref: null,
      trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 3 },
      action: {
        kind: 'speed',
        targetSpeed: 6,
        dynamicsShape: 'linear',
        dynamicsDimension: 'time',
        dynamicsValue: 1,
      },
    });

    const first = serializeScenario(doc) as any;
    const second = serializeScenario(doc) as any;
    const event =
      first.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events[0];

    expect(second).toEqual(first);
    expect(event.name).toBe('evt-0');
    expect(event.actions[0].name).toBe('evt-1');
  });

  it('creates a new actor group for target-ref lane-change events when existing groups do not match', () => {
    const raw = openRawWithStories([{ acts: [{ maneuverGroups: [{ maneuvers: [] }] }] }]);
    const doc = parseScenario(raw);
    doc.obstacles[0]!.events.push({
      uid: 'target-ref-lane-change',
      name: 'target-ref-lane-change',
      ref: null,
      trigger: null,
      action: {
        kind: 'laneChange',
        relativeTargetLane: 1,
        targetRef: 'leader',
        dynamicsDimension: 'time',
        dynamicsValue: 1.5,
      },
    });

    const out = serializeScenario(doc) as any;
    const appended =
      out.scenario.storyboard.stories[1].acts[0].maneuverGroups[0].maneuvers[0].events[0];

    expect(
      appended.actions[0].privateAction.lateralAction.laneChangeAction.laneChangeTarget,
    ).toEqual({
      relativeTargetLane: {
        entityRef: { entityRef: 'leader' },
        value: 1,
      },
    });
    expect(appended.startTrigger).toBeUndefined();
  });

  it('removes stale startTrigger when an existing modeled event becomes triggerless', () => {
    const raw = openRawWithStories([
      eventGroup([
        speedEvent('trigger-to-null', {
          conditionGroups: [
            {
              conditions: [
                {
                  byValueCondition: {
                    simulationTimeCondition: { rule: 'greaterOrEqual', value: 1 },
                  },
                },
              ],
            },
          ],
        }),
      ]),
    ]);
    const doc = parseScenario(raw);
    doc.obstacles[0]!.events[0]!.trigger = null;

    const out = serializeScenario(doc) as any;
    const rawEvent =
      out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events[0];

    expect(rawEvent.startTrigger).toBeUndefined();
  });

  it('creates missing event dynamics while preserving existing action holders', () => {
    const raw = openRawWithStories([
      eventGroup([
        speedEvent('speed-without-dynamics', {
          conditionGroups: [
            {
              conditions: [
                {
                  byValueCondition: {
                    simulationTimeCondition: { rule: 'greaterOrEqual', value: 1 },
                  },
                },
              ],
            },
          ],
        }),
        laneChangeEvent('lane-without-dynamics', {
          conditionGroups: [
            {
              conditions: [
                {
                  byEntityCondition: {
                    entityCondition: {
                      relativeDistanceCondition: {
                        rule: 'greaterOrEqual',
                        value: 2,
                        entityRef: { entityRef: 'leader' },
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
      ]),
    ]);
    const speedRaw = (raw.scenario.storyboard.stories[0] as any).acts[0].maneuverGroups[0]
      .maneuvers[0].events[0].actions[0].privateAction.longitudinalAction.speedAction;
    const laneRaw = (raw.scenario.storyboard.stories[0] as any).acts[0].maneuverGroups[0]
      .maneuvers[0].events[1].actions[0].privateAction.lateralAction.laneChangeAction;
    delete speedRaw.speedActionDynamics;
    delete laneRaw.laneChangeActionDynamics;
    const doc = parseScenario(raw);

    doc.obstacles[0]!.events[0]!.action = {
      kind: 'speed',
      targetSpeed: 8,
      dynamicsShape: 'linear',
      dynamicsDimension: 'rate',
      dynamicsValue: 0.5,
    };
    doc.obstacles[0]!.events[1]!.action = {
      kind: 'laneChange',
      relativeTargetLane: -1,
      targetRef: 'leader',
      dynamicsDimension: 'distance',
      dynamicsValue: 6,
    };

    const out = serializeScenario(doc) as any;
    const events = out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events;

    expect(
      events[0].actions[0].privateAction.longitudinalAction.speedAction.speedActionDynamics,
    ).toEqual({ dynamicsDimension: 'rate', dynamicsShape: 'linear', value: 0.5 });
    expect(
      events[1].actions[0].privateAction.lateralAction.laneChangeAction.laneChangeActionDynamics,
    ).toEqual({ dynamicsDimension: 'distance', dynamicsShape: 'linear', value: 6 });
  });

  it('patches simulation-time conditions and swaps distance trigger variants in place', () => {
    const raw = openRawWithStories([
      eventGroup([
        speedEvent('patch-simulation-time', {
          conditionGroups: [
            {
              conditions: [
                {
                  conditionEdge: 'rising',
                  keep: 'sibling',
                  byValueCondition: {
                    simulationTimeCondition: { rule: 'lessOrEqual', value: 1 },
                  },
                },
              ],
            },
          ],
        }),
        speedEvent('distance-to-relative', {
          conditionGroups: [
            {
              conditions: [
                {
                  byEntityCondition: {
                    entityCondition: {
                      distanceCondition: {
                        rule: 'lessOrEqual',
                        value: 8,
                        position: { worldPosition: { x: 1, y: 2 } },
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
        {
          name: 'blank-action-relative-to-distance',
          actions: [{ name: 'blank-action' }],
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
                          entityRef: { entityRef: 'old-target' },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      ]),
    ]);
    const doc = parseScenario(raw);
    const events = doc.obstacles[0]!.events;

    events[0]!.trigger = { kind: 'simulationTime', rule: 'greaterOrEqual', value: 9 };
    events[1]!.trigger = {
      kind: 'relativeDistance',
      rule: 'greaterOrEqual',
      value: 3,
      targetRef: 'leader',
      relativeDistanceType: 'longitudinal',
    };
    events.push({
      uid: 'manual-blank-action',
      name: 'blank-action-relative-to-distance',
      ref: { storyIndex: 0, actIndex: 0, mgIndex: 0, manIndex: 0, eventIndex: 2 },
      trigger: { kind: 'distance', rule: 'lessOrEqual', value: 6 },
      action: {
        kind: 'laneChange',
        relativeTargetLane: 2,
        dynamicsDimension: 'time',
        dynamicsValue: 1,
      },
    });

    const out = serializeScenario(doc) as any;
    const rawEvents =
      out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events;
    const patchedSim = rawEvents[0].startTrigger.conditionGroups[0].conditions[0];
    const relativeCondition =
      rawEvents[1].startTrigger.conditionGroups[0].conditions[0].byEntityCondition;
    const distanceCondition =
      rawEvents[2].startTrigger.conditionGroups[0].conditions[0].byEntityCondition;

    expect(patchedSim).toMatchObject({
      conditionEdge: 'rising',
      keep: 'sibling',
      byValueCondition: {
        simulationTimeCondition: { rule: 'greaterOrEqual', value: 9 },
      },
    });
    expect(relativeCondition.triggeringEntities.entityRefs).toEqual([{ entityRef: 'NPC_A' }]);
    expect(relativeCondition.entityCondition.distanceCondition).toBeUndefined();
    expect(relativeCondition.entityCondition.relativeDistanceCondition).toEqual({
      rule: 'greaterOrEqual',
      value: 3,
      entityRef: { entityRef: 'leader' },
      relativeDistanceType: 'longitudinal',
    });
    expect(distanceCondition.triggeringEntities.entityRefs).toEqual([{ entityRef: 'NPC_A' }]);
    expect(distanceCondition.entityCondition.relativeDistanceCondition).toBeUndefined();
    expect(distanceCondition.entityCondition.distanceCondition).toEqual({
      rule: 'lessOrEqual',
      value: 6,
    });
    expect(rawEvents[2].actions[0]).toMatchObject({
      name: 'blank-action',
      privateAction: {
        lateralAction: {
          laneChangeAction: {
            laneChangeTarget: { relativeTargetLane: { value: 2 } },
          },
        },
      },
    });
  });

  it('clears stale optional fields when patching the same trigger kind', () => {
    const raw = openRawWithStories([
      eventGroup([
        speedEvent('distance-clears-optionals', {
          conditionGroups: [
            {
              conditions: [
                {
                  byEntityCondition: {
                    entityCondition: {
                      distanceCondition: {
                        rule: 'lessOrEqual',
                        value: 8,
                        position: { worldPosition: { x: 1, y: 2 } },
                        relativeDistanceType: 'cartesianDistance',
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
        speedEvent('relative-clears-optionals', {
          conditionGroups: [
            {
              conditions: [
                {
                  byEntityCondition: {
                    entityCondition: {
                      relativeDistanceCondition: {
                        rule: 'greaterOrEqual',
                        value: 4,
                        entityRef: { entityRef: 'old-target' },
                        relativeDistanceType: 'longitudinal',
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
      ]),
    ]);
    const doc = parseScenario(raw);
    const events = doc.obstacles[0]!.events;

    events[0]!.trigger = { kind: 'distance', rule: 'greaterOrEqual', value: 12 };
    events[1]!.trigger = { kind: 'relativeDistance', rule: 'lessOrEqual', value: 5 };

    const out = serializeScenario(doc) as any;
    const rawEvents =
      out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events;

    expect(
      rawEvents[0].startTrigger.conditionGroups[0].conditions[0].byEntityCondition.entityCondition
        .distanceCondition,
    ).toEqual({ rule: 'greaterOrEqual', value: 12 });
    expect(
      rawEvents[1].startTrigger.conditionGroups[0].conditions[0].byEntityCondition.entityCondition
        .relativeDistanceCondition,
    ).toEqual({ rule: 'lessOrEqual', value: 5 });
  });

  it('appends new events to maneuver groups that match a later actor ref', () => {
    const raw = {
      id: 'actor-match-later-ref',
      scenario: {
        entities: { scenarioObjects: [scenarioObject('NPC_A'), scenarioObject('NPC_B')] },
        storyboard: {
          init: { actions: { privates: [privateFor('NPC_A'), privateFor('NPC_B')] } },
          stories: [
            {
              acts: [
                {
                  maneuverGroups: [
                    {
                      actors: {
                        entityRefs: [{ entityRef: 'Other' }, null, { entityRef: 'NPC_B' }],
                      },
                      maneuvers: ['bad-maneuver'],
                    },
                    {
                      actors: { entityRefs: [{ entityRef: 'NPC_A' }] },
                      maneuvers: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
    };
    const doc = parseScenario(raw);
    doc.obstacles[1]!.events.push({
      uid: 'npc-b-event',
      name: 'npc-b-event',
      ref: null,
      trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 2 },
      action: {
        kind: 'speed',
        targetSpeed: 5,
        dynamicsShape: 'linear',
        dynamicsDimension: 'time',
        dynamicsValue: 1,
      },
    });

    const out = serializeScenario(doc) as any;
    const stories = out.scenario.storyboard.stories;
    const firstGroup = stories[0].acts[0].maneuverGroups[0];
    const secondGroup = stories[0].acts[0].maneuverGroups[1];

    expect(stories).toHaveLength(1);
    expect(firstGroup.maneuvers[0]).toBe('bad-maneuver');
    expect(firstGroup.maneuvers[1].events[0]).toMatchObject({
      name: 'npc-b-event',
      startTrigger: {
        conditionGroups: [
          {
            conditions: [
              {
                byValueCondition: {
                  simulationTimeCondition: { rule: 'greaterOrEqual', value: 2 },
                },
              },
            ],
          },
        ],
      },
    });
    expect(secondGroup.maneuvers).toEqual([]);
  });
});

describe('serializeScenario ego branch edges', () => {
  it('patches openscenario start, end, velocity, acceleration, and same-count waypoints in place', () => {
    const doc = parseScenario({
      id: 'ego-open-same-count-waypoints',
      scenario: {
        autoCarInfo: {
          start: { x: 1, y: 2, heading: 0.1, laneId: 'keep-start' },
          end: { x: 3, y: 4, laneId: 'keep-end' },
          routingRequest: {
            waypoint: [
              { pose: { x: 5, y: 6, laneId: 'keep-wp-1' } },
              { pose: { x: 7, y: 8, laneId: 'keep-wp-2' } },
            ],
            priority: 'keep-routing',
          },
          startVelocity: 0,
          startAcceleration: 0,
        },
      },
    });
    doc.ego.start = { x: 11, y: 12, h: 0.9 };
    doc.ego.end = { x: 13, y: 14 };
    doc.ego.waypoints = [
      { x: 15, y: 16 },
      { x: 17, y: 18 },
    ];
    doc.ego.startVelocity = 4.5;
    doc.ego.startAcceleration = 0.7;

    const out = serializeScenario(doc) as any;
    const autoCarInfo = out.scenario.autoCarInfo;

    expect(autoCarInfo.start).toEqual({ x: 11, y: 12, heading: 0.9, laneId: 'keep-start' });
    expect(autoCarInfo.end).toEqual({ x: 13, y: 14, laneId: 'keep-end' });
    expect(autoCarInfo.routingRequest).toEqual({
      waypoint: [
        { pose: { x: 15, y: 16, laneId: 'keep-wp-1' } },
        { pose: { x: 17, y: 18, laneId: 'keep-wp-2' } },
      ],
      priority: 'keep-routing',
    });
    expect(autoCarInfo.startVelocity).toBe(4.5);
    expect(autoCarInfo.startAcceleration).toBe(0.7);
  });

  it('rebuilds openscenario waypoint arrays when addWaypoint changes the count', () => {
    const doc = parseScenario({
      id: 'ego-open-rebuild-waypoints',
      scenario: {
        autoCarInfo: {
          start: { x: 1, y: 2, heading: 0.1 },
          end: { x: 3, y: 4 },
          routingRequest: { waypoint: [{ pose: { x: 5, y: 6, laneId: 'drop-me' } }] },
        },
      },
    });
    doc.ego.waypoints = [
      { x: 15, y: 16 },
      { x: 17, y: 18 },
    ];

    const out = serializeScenario(doc) as any;

    expect(out.scenario.autoCarInfo.routingRequest.waypoint).toEqual([
      { pose: { x: 15, y: 16 } },
      { pose: { x: 17, y: 18 } },
    ]);
  });

  it('patches classic ego start and end without adding unsupported waypoints', () => {
    const doc = parseScenario({
      id: 'ego-classic',
      scenario: {
        start: { x: 1, y: 2, heading: 0.1, laneId: 'keep-start' },
        end: { x: 3, y: 4, laneId: 'keep-end' },
        startVelocity: 0,
        startAcceleration: 0,
      },
    });
    doc.ego.start = { x: 21, y: 22, h: 1.2 };
    doc.ego.end = { x: 23, y: 24 };
    doc.ego.waypoints = [{ x: 25, y: 26 }];
    doc.ego.startVelocity = 6;
    doc.ego.startAcceleration = 0.3;

    const out = serializeScenario(doc) as any;

    expect(out.scenario.start).toEqual({ x: 21, y: 22, heading: 1.2, laneId: 'keep-start' });
    expect(out.scenario.end).toEqual({ x: 23, y: 24, laneId: 'keep-end' });
    expect(out.scenario.startVelocity).toBe(6);
    expect(out.scenario.startAcceleration).toBe(0.3);
    expect(out.scenario.routingRequest).toBeUndefined();
  });
});

describe('serializeScenario traffic light and append/prune boundaries', () => {
  it('does not create absent openscenario holders when there is nothing to append', () => {
    const noAutoCarInfo = parseScenario({
      id: 'no-auto-car-info',
      scenario: { entities: { scenarioObjects: [] } },
    });
    const noTrafficHolder = parseScenario({
      id: 'no-traffic-holder',
      scenario: { autoCarInfo: {} },
    });

    expect((serializeScenario(noAutoCarInfo) as any).scenario.autoCarInfo).toBeUndefined();
    expect((serializeScenario(noTrafficHolder) as any).scenario.roadNetwork).toBeUndefined();
    expect((serializeScenario(noTrafficHolder) as any).scenario.autoCarInfo).toEqual({});
  });

  it('patches sparse existing traffic lights without inventing optional keys', () => {
    const doc = parseScenario({
      id: 'traffic-light-sparse-patch',
      scenario: {
        roadNetwork: {
          trafficLights: [
            { initialState: {}, custom: 'keep' },
            {
              id: 'Signal_state',
              location: { x: 1, y: 2 },
              initialState: { color: 'RED' },
              stateGroup: [{ color: 'RED' }],
            },
            'not-a-record',
          ],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
    });

    doc.trafficLights[0]!.signalId = '';
    doc.trafficLights[0]!.triggerType = 'NA';
    doc.trafficLights[0]!.initialBlink = true;
    doc.trafficLights[0]!.stateGroup = [];
    doc.trafficLights[1]!.triggerType = 'TIME';
    doc.trafficLights[1]!.triggerValue = 3;
    doc.trafficLights[1]!.initialColor = 'GREEN';
    doc.trafficLights[1]!.stateGroup = [{ color: 'GREEN', keepTime: 9 }];

    const out = serializeScenario(doc) as any;
    const lights = out.scenario.roadNetwork.trafficLights;

    expect(lights[0]).toEqual({ initialState: { blink: true }, custom: 'keep' });
    expect(lights[1]).toMatchObject({
      id: 'Signal_state',
      triggerType: 'TIME',
      triggerValue: 3,
      initialState: { color: 'GREEN' },
      stateGroup: [{ color: 'GREEN' }],
    });
    expect(lights[1].stateGroup[0].keepTime).toBeUndefined();
    expect(lights[2]).toBe('not-a-record');
  });

  it('deletes stale traffic light triggerValue when the model clears it', () => {
    const doc = parseScenario({
      id: 'traffic-light-trigger-clear',
      scenario: {
        roadNetwork: {
          trafficLights: [
            {
              id: 'Signal_clear',
              location: { x: 1, y: 2 },
              triggerType: 'TIME',
              triggerValue: 4,
            },
          ],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
    });

    doc.trafficLights[0]!.triggerValue = undefined;

    const out = serializeScenario(doc) as any;

    expect(out.scenario.roadNetwork.trafficLights[0].triggerValue).toBeUndefined();
  });

  it('appends new traffic lights after survivors and writes optional state fields', () => {
    const doc = parseScenario({
      id: 'traffic-light-append-mixed',
      scenario: {
        roadNetwork: {
          trafficLights: [
            {
              id: 'Existing',
              location: { x: 1, y: 2 },
              initialState: { color: 'RED' },
              stateGroup: [null, { color: 'RED' }],
            },
          ],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
    });
    doc.trafficLights[0]!.stateGroup = [{ color: 'GREEN' }, { color: 'YELLOW', keepTime: 2 }];
    const newLight: (typeof doc.trafficLights)[number] = {
      ...doc.trafficLights[0]!,
      uid: 'new-light',
      signalId: 'BlinkNew',
      location: { x: 8, y: 9 },
      triggerType: 'NA',
      triggerValue: undefined,
      initialColor: 'YELLOW',
      initialBlink: true,
      stateGroup: [{ color: 'GREEN' }, { color: 'RED', blink: true }],
      ref: null,
    };
    doc.trafficLights.push(newLight);

    const out = serializeScenario(doc) as any;
    const lights = out.scenario.roadNetwork.trafficLights;

    expect(lights).toHaveLength(2);
    expect(lights[0].stateGroup).toEqual([null, { color: 'YELLOW' }]);
    expect(lights[1]).toMatchObject({
      id: 'BlinkNew',
      initialState: { color: 'YELLOW', blink: true },
      stateGroup: [{ color: 'GREEN' }, { color: 'RED', blink: true }],
    });
    expect(lights[1].triggerType).toBeUndefined();
  });

  it('rebuilds traffic light state groups when counts or raw holders differ', () => {
    const doc = parseScenario({
      id: 'traffic-light-state-rebuild',
      scenario: {
        roadNetwork: {
          trafficLights: [
            {
              id: 'Signal_Count',
              location: { x: 1, y: 2 },
              initialState: { color: 'RED' },
              stateGroup: [{ color: 'RED', keepTime: 1 }],
            },
            {
              id: 'Signal_Missing',
              location: { x: 3, y: 4 },
              initialState: { color: 'GREEN' },
            },
          ],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
    });
    doc.trafficLights[0]!.stateGroup = [
      { color: 'GREEN', keepTime: 10 },
      { color: 'YELLOW', keepTime: 2, blink: true },
    ];
    doc.trafficLights[1]!.stateGroup = [{ color: 'RED', blink: true }];

    const out = serializeScenario(doc) as any;
    const lights = out.scenario.roadNetwork.trafficLights;

    expect(lights[0].stateGroup).toEqual([
      { color: 'GREEN', keepTime: 10 },
      { color: 'YELLOW', keepTime: 2, blink: true },
    ]);
    expect(lights[1].stateGroup).toEqual([{ color: 'RED', blink: true }]);
  });

  it('does not create initialState when an existing sparse traffic light lacks it', () => {
    const doc = parseScenario({
      id: 'traffic-light-no-initial',
      scenario: {
        roadNetwork: {
          trafficLights: [{ id: 'NoInitial', location: { x: 1, y: 2 } }],
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
    });
    doc.trafficLights[0]!.initialColor = 'GREEN';
    doc.trafficLights[0]!.initialBlink = true;

    const out = serializeScenario(doc) as any;

    expect(out.scenario.roadNetwork.trafficLights[0].initialState).toBeUndefined();
  });

  it('keeps classic events out of classic raw output while still pruning empty arrays', () => {
    const doc = parseScenario({
      id: 'classic-empty-arrays',
      scenario: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, mapDir: 'm/x' },
    });

    const out = serializeScenario(doc) as any;

    expect(out.scenario.agent).toBeUndefined();
    expect(out.scenario.trafficLights).toBeUndefined();
    expect(out.scenario.storyboard).toBeUndefined();
  });

  it('patches sparse classic agent motion without adding optional speed fields', () => {
    const doc = parseScenario({
      id: 'classic-sparse-agent',
      scenario: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        agent: [
          {
            id: 5,
            type: 'VEHICLE',
            width: 2,
            length: 4,
            height: 1.5,
            startVelocity: 3,
            startPosition: { x: 1, y: 2, heading: 0.1 },
            trackedPoint: [null, { x: 3, y: 4, speed: 2 }],
          },
        ],
      },
    });
    doc.obstacles[0]!.position = { x: 9, y: 8, h: 0.6 };
    doc.obstacles[0]!.initialSpeed = 10;
    doc.obstacles[0]!.trajectory = [
      { x: 11, y: 12, speed: 4 },
      { x: 13, y: 14, speed: 6 },
    ];

    const out = serializeScenario(doc) as any;
    const agent = out.scenario.agent[0];

    expect(agent.startPosition).toEqual({ x: 9, y: 8, heading: 0.6 });
    expect(agent.trackedPoint).toEqual([null, { x: 13, y: 14, speed: 6 }]);
  });

  it('rewrites classic agent type, rebuilds tracked points, and appends moving agents', () => {
    const doc = parseScenario({
      id: 'classic-agent-rebuild-and-moving-append',
      scenario: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        agent: [
          {
            id: 8,
            type: 'VEHICLE',
            width: 2,
            length: 4,
            height: 1.5,
            motiontype: 'TRACKED',
            startVelocity: 2,
            startPosition: { x: 1, y: 2, heading: 0.1, speed: 2 },
            trackedPoint: [{ x: 1, y: 2, speed: 2 }],
          },
        ],
      },
    });
    doc.obstacles[0]!.kind = 'pedestrian';
    doc.obstacles[0]!.trajectory = [
      { x: 11, y: 12, speed: 4 },
      { x: 13, y: 14 },
    ];
    doc.obstacles.push({
      uid: 'classic-new-moving',
      name: '43',
      apolloId: 43,
      kind: 'bicycle',
      dimensions: { length: 2, width: 0.8, height: 1.4 },
      position: { x: 4, y: 5, h: 0.6 },
      initialSpeed: 3,
      moving: true,
      trajectory: [
        { x: 4, y: 5, speed: 3 },
        { x: 9, y: 10 },
      ],
      triggerType: 'DISTANCE',
      triggerValue: 15,
      events: [],
      ref: null,
    });

    const out = serializeScenario(doc) as any;

    expect(out.scenario.agent[0].type).toBe('PEDESTRIAN');
    expect(out.scenario.agent[0].trackedPoint).toEqual([
      { x: 11, y: 12, speed: 4 },
      { x: 13, y: 14 },
    ]);
    expect(out.scenario.agent[1]).toMatchObject({
      id: 43,
      type: 'BICYCLE',
      motiontype: 'TRACKED',
      startPosition: { x: 4, y: 5, heading: 0.6, speed: 3 },
      startVelocity: 3,
      startDistance: 15,
      trackedPoint: [
        { x: 4, y: 5, speed: 3 },
        { x: 9, y: 10 },
      ],
    });
  });

  it('patches classic agent trigger fields when raw holders exist', () => {
    const doc = parseScenario({
      id: 'classic-trigger-edit',
      scenario: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        agent: [
          {
            id: 5,
            type: 'VEHICLE',
            width: 2,
            length: 4,
            height: 1.5,
            triggerType: 'DISTANCE',
            startDistance: 10,
            startPosition: { x: 1, y: 2 },
          },
        ],
      },
    });
    doc.obstacles[0]!.triggerType = 'TIME';
    doc.obstacles[0]!.triggerValue = 12;

    const reparsed = parseScenario(serializeScenario(doc));

    expect(reparsed.obstacles[0]!.triggerType).toBe('TIME');
    expect(reparsed.obstacles[0]!.triggerValue).toBe(12);
  });

  it('appends static classic agents with default heading and no trackedPoint', () => {
    const doc = parseScenario({
      id: 'classic-static-append',
      scenario: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, agent: [] },
    });
    const obstacle: (typeof doc.obstacles)[number] = {
      uid: 'classic-new-static',
      name: '42',
      apolloId: 42,
      kind: 'unknown',
      dimensions: { length: 1, width: 2, height: 3 },
      position: { x: 4, y: 5 },
      initialSpeed: 0,
      moving: false,
      trajectory: [],
      triggerType: 'NA',
      events: [],
      ref: null,
    };
    doc.obstacles.push(obstacle);

    const out = serializeScenario(doc) as any;
    const agent = out.scenario.agent[0];

    expect(agent).toMatchObject({
      id: 42,
      type: 'UNKNOWN',
      motiontype: 'STATIC',
      startPosition: { x: 4, y: 5, heading: 0, speed: 0 },
    });
    expect(agent.trackedPoint).toBeUndefined();
    expect(agent.startDistance).toBeUndefined();
  });

  it('skips malformed classic agent refs and sparse optional subtrees', () => {
    const doc = parseScenario({
      id: 'classic-malformed-agent-ref',
      scenario: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        agent: [
          'bad-agent',
          {
            id: 7,
            width: 2,
            length: 4,
            height: 1.5,
            trackedPoint: [{ x: 1, y: 2, speed: 9 }],
          },
        ],
      },
    });
    const ghost: (typeof doc.obstacles)[number] = {
      ...doc.obstacles[0]!,
      uid: 'ghost-agent-ref',
      name: 'ghost',
      apolloId: 99,
      ref: { kind: 'classic', agentIndex: 0 },
    };
    doc.obstacles.unshift(ghost);
    doc.obstacles[1]!.kind = 'vehicle';
    doc.obstacles[1]!.position = { x: 20, y: 30 };
    doc.obstacles[1]!.trajectory = [{ x: 10, y: 20 }];

    const out = serializeScenario(doc) as any;

    expect(out.scenario.agent[0]).toBe('bad-agent');
    expect(out.scenario.agent[1].type).toBeUndefined();
    expect(out.scenario.agent[1].startPosition).toBeUndefined();
    expect(out.scenario.agent[1].trackedPoint).toEqual([{ x: 10, y: 20, speed: 9 }]);
  });
});

describe('serializeScenario defensive motion patching', () => {
  it('skips no-motion privateless obstacles while appending heading-aware motion privates', () => {
    const doc = parseScenario({
      id: 'privateless-motion-append',
      scenario: {
        entities: { scenarioObjects: [scenarioObject('Still'), scenarioObject('Mover')] },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      },
    });
    doc.obstacles[1]!.position = { x: 4, y: 5, h: 0.8 };
    doc.obstacles[1]!.initialSpeed = 3;
    doc.obstacles[1]!.trajectory = [
      { x: 4, y: 5, h: 0.8 },
      { x: 8, y: 9, h: 1.1 },
    ];

    const out = serializeScenario(doc) as any;
    const privates = out.scenario.storyboard.init.actions.privates;
    const privateActions = privates[0].privateActions;
    const vertices =
      privateActions[2].routingAction.followTrajectoryAction.trajectoryRef.trajectory.shape.polyline
        .vertices;

    expect(privates).toHaveLength(1);
    expect(privates[0].entityRef).toEqual({ entityRef: 'Mover' });
    expect(privateActions[0].teleportAction.position.worldPosition).toEqual({
      x: 4,
      y: 5,
      h: 0.8,
    });
    expect(vertices.map((v: any) => v.position.worldPosition)).toEqual([
      { x: 4, y: 5, h: 0.8 },
      { x: 8, y: 9, h: 1.1 },
    ]);
    expect(out.scenario.storyboard.stories).toBeUndefined();
  });

  it('skips malformed entityObject and private motion branches without appending replacements', () => {
    const doc = parseScenario({
      id: 'malformed-motion',
      scenario: {
        entities: { scenarioObjects: [{ name: 'Mystery', id: 9, entityObject: {} }] },
        storyboard: {
          init: {
            actions: {
              privates: [
                {
                  entityRef: { entityRef: 'Mystery' },
                  privateActions: [null, { teleportAction: {} }, { routingAction: {} }],
                },
              ],
            },
          },
        },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      },
    });
    doc.obstacles[0]!.trajectory = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];

    const out = serializeScenario(doc) as any;
    const rawObject = out.scenario.entities.scenarioObjects[0];
    const privateActions = out.scenario.storyboard.init.actions.privates[0].privateActions;

    expect(rawObject.entityObject).toEqual({});
    expect(privateActions).toEqual([null, { teleportAction: {} }, { routingAction: {} }]);
  });
});
