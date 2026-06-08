import { describe, expect, it } from 'vitest';
import type { ScenarioEvent } from '@/types/scenario';
import { makeBlankScenario, makeObstacle, nextApolloId } from '../factory';
import { serializeScenario } from '../serialize';

describe('serializeScenario append defaults', () => {
  it('appends a static openscenario obstacle without optional heading or routing branches', () => {
    const doc = makeBlankScenario('openscenario', { mapDir: 'modules/map/data/defaults' });
    const obstacle = makeObstacle('bicycle', { x: 10, y: 20 }, nextApolloId(doc));
    obstacle.position = { x: 10, y: 20 };
    obstacle.initialSpeed = 3;
    doc.obstacles.push(obstacle);

    const out = serializeScenario(doc) as any;
    const rawObject = out.scenario.entities.scenarioObjects[0];
    const rawPrivate = out.scenario.storyboard.init.actions.privates[0];
    const privateActions = rawPrivate.privateActions;

    expect(rawObject).toMatchObject({
      name: obstacle.name,
      id: obstacle.apolloId,
      entityObject: {
        vehicle: {
          vehicleCategory: 'bicycle',
          boundingBox: { dimensions: { length: 2, width: 0.6, height: 1.5 } },
        },
      },
    });
    expect(rawPrivate.entityRef).toEqual({ entityRef: obstacle.name });
    expect(privateActions).toHaveLength(2);
    expect(privateActions[0].teleportAction.position.worldPosition).toEqual({ x: 10, y: 20 });
    expect(
      privateActions.some((action: Record<string, unknown>) => 'routingAction' in action),
    ).toBe(false);
    expect(
      privateActions[1].longitudinalAction.speedAction.speedActionTarget.absoluteTargetSpeed.value,
    ).toBe(3);
  });

  it('generates stable names for unnamed triggerless events without adding startTrigger', () => {
    const doc = makeBlankScenario('openscenario', { mapDir: 'modules/map/data/defaults' });
    const obstacle = makeObstacle('vehicle', { x: 0, y: 0, h: 0 }, nextApolloId(doc));
    const event: ScenarioEvent = {
      uid: 'event-triggerless',
      name: '',
      trigger: null,
      action: {
        kind: 'laneChange',
        relativeTargetLane: -1,
        dynamicsDimension: 'distance',
        dynamicsValue: 5,
      },
      ref: null,
    };
    obstacle.events.push(event);
    doc.obstacles.push(obstacle);

    const out = serializeScenario(doc) as any;
    const rawEvent =
      out.scenario.storyboard.stories[0].acts[0].maneuverGroups[0].maneuvers[0].events[0];

    expect(rawEvent.name).toBe('evt-0');
    expect(rawEvent.actions[0].name).toBe('evt-1');
    expect(rawEvent.startTrigger).toBeUndefined();
    expect(
      rawEvent.actions[0].privateAction.lateralAction.laneChangeAction.laneChangeTarget
        .relativeTargetLane,
    ).toEqual({ value: -1 });
    expect(serializeScenario(doc)).toEqual(out);
  });
});
