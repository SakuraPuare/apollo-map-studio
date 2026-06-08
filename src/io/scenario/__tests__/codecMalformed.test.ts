import { describe, expect, it } from 'vitest';
import { parseScenario } from '../parse';
import { serializeScenario } from '../serialize';

describe('scenario codec malformed inputs', () => {
  it('normalizes malformed classic collections and scalar fallbacks without throwing', () => {
    const doc = parseScenario({
      id: 123,
      tags: ['keep', false, 'also-keep'],
      scenario: {
        start: 'bad-start',
        end: { x: 5, y: 6, heading: 0.3 },
        simulatorTime: '100',
        agent: [
          null,
          {
            id: 'bad-id',
            type: 'BICYCLE',
            width: 'wide',
            length: 2,
            motiontype: 'TRACKED',
            startPosition: { x: 'bad-x', y: 1 },
            trackedPoint: [
              { x: 1, y: 2, speed: 'fast' },
              { x: 3, y: 4, speed: 5 },
            ],
            triggerType: 'BOGUS',
            startDistance: 'bad-distance',
          },
        ],
        trafficLights: [
          null,
          {
            id: 'TL_bad',
            location: { x: 'bad-x', y: 2 },
            triggerType: 'BROKEN',
            initialState: { color: 'BLUE', blink: 'yes' },
            stateGroup: [
              { color: 'YELLOW', keepTime: -1 },
              { color: 'GREEN', keepTime: 4, blink: false },
              'bad-state',
            ],
          },
        ],
      },
    });

    expect(doc.format).toBe('classic');
    expect(doc.meta).toMatchObject({
      id: '',
      tags: ['keep', 'also-keep'],
      simulatorTime: undefined,
    });
    expect(doc.ego).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 5, y: 6, h: 0.3 } });
    expect(doc.obstacles).toHaveLength(1);
    expect(doc.obstacles[0]).toMatchObject({
      name: '0',
      apolloId: 0,
      kind: 'bicycle',
      dimensions: { length: 2, width: 1, height: 1 },
      position: { x: 0, y: 0 },
      initialSpeed: 0,
      moving: true,
      triggerType: 'NA',
      triggerValue: undefined,
      trajectory: [
        { x: 1, y: 2, speed: undefined },
        { x: 3, y: 4, speed: 5 },
      ],
    });
    expect(doc.trafficLights).toHaveLength(2);
    expect(doc.trafficLights[0]).toMatchObject({
      signalId: '',
      location: { x: 0, y: 0 },
      initialColor: 'RED',
      triggerType: 'NA',
    });
    expect(doc.trafficLights[1]).toMatchObject({
      signalId: 'TL_bad',
      location: { x: 0, y: 0 },
      initialColor: 'RED',
      initialBlink: undefined,
      triggerType: 'NA',
      stateGroup: [
        { color: 'YELLOW', keepTime: -1, blink: undefined },
        { color: 'GREEN', keepTime: 4, blink: false },
      ],
    });
  });

  it('round-trips malformed openscenario holders without creating replacement arrays', () => {
    const raw = {
      id: 'malformed-open-holders',
      scenario: {
        roadNetwork: { trafficLights: 'not-an-array' },
        entities: { scenarioObjects: 'not-an-array' },
        storyboard: {
          init: { actions: { privates: 'not-an-array' } },
          stories: 'not-an-array',
        },
        autoCarInfo: {
          routingRequest: { waypoint: 'not-an-array' },
        },
      },
    };

    const doc = parseScenario(raw);

    expect(doc.format).toBe('openscenario');
    expect(doc.obstacles).toEqual([]);
    expect(doc.trafficLights).toEqual([]);
    expect(doc.ego).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, waypoints: [] });
    expect(serializeScenario(doc)).toEqual(raw);
  });

  it('patches only existing metadata leaves and skips sparse openscenario holders', () => {
    const doc = parseScenario({
      id: 'meta-open-sparse',
      scenario: {
        roadNetwork: { logicFile: {} },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
        storyboard: {
          init: { actions: { privates: [] } },
          stopTrigger: {
            conditionGroups: [
              {
                conditions: [
                  {
                    byValueCondition: {
                      simulationTimeCondition: { rule: 'greaterOrEqual' },
                    },
                  },
                ],
              },
              {
                conditions: [
                  'bad-condition',
                  {
                    byValueCondition: {
                      simulationTimeCondition: { rule: 'greaterOrEqual', value: 1 },
                    },
                  },
                ],
              },
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
        },
      },
    });
    doc.meta.mapDir = 'modules/map/data/new';
    doc.meta.simulatorTime = 99;

    const out = serializeScenario(doc) as any;
    const groups = out.scenario.storyboard.stopTrigger.conditionGroups;

    expect(out.scenario.roadNetwork.logicFile.filepath).toBeUndefined();
    expect(groups[0].conditions[0].byValueCondition.simulationTimeCondition.value).toBeUndefined();
    expect(groups[1].conditions[1].byValueCondition.simulationTimeCondition.value).toBe(99);
    expect(groups[2].conditions[0].byValueCondition.simulationTimeCondition.value).toBe(2);
  });

  it('does not create classic metadata fields that were absent in the raw file', () => {
    const doc = parseScenario({
      id: 'classic-no-meta-holders',
      scenario: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
      },
    });
    doc.meta.mapDir = 'modules/map/data/new';
    doc.meta.simulatorTime = 88;

    const out = serializeScenario(doc) as any;

    expect(out.scenario.mapDir).toBeUndefined();
    expect(out.scenario.simulatorTime).toBeUndefined();
  });
});
