import { describe, expect, it } from 'vitest';
import type { ScenarioDoc, ScenarioObstacle } from '@/types/scenario';
import { sampleScenarioAt } from '../scenarioSampler';

function baseDoc(obstacles: ScenarioObstacle[] = []): ScenarioDoc {
  return {
    format: 'openscenario',
    meta: { id: 'sampler-branches', tags: [], simulatorTime: 10 },
    ego: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, waypoints: [] },
    obstacles,
    trafficLights: [],
    raw: {},
  };
}

function obstacle(partial: Partial<ScenarioObstacle> = {}): ScenarioObstacle {
  return {
    uid: 'ob',
    name: '1',
    apolloId: 1,
    kind: 'vehicle',
    dimensions: { length: 4, width: 2, height: 1.5 },
    position: { x: 0, y: 0, h: 0 },
    initialSpeed: 10,
    moving: true,
    trajectory: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    triggerType: 'NA',
    events: [],
    ref: null,
    ...partial,
  };
}

describe('scenarioSampler branch edges', () => {
  it('keeps the initial heading before a delayed obstacle starts moving', () => {
    const ob = obstacle({
      position: { x: 99, y: 99, h: 1.25 },
      triggerType: 'TIME',
      triggerValue: 3,
      trajectory: [
        { x: 5, y: 6, h: 0.1 },
        { x: 15, y: 6, h: 0.1 },
      ],
    });

    expect(sampleScenarioAt(baseDoc([ob]), 2).obstacles[0]!.position).toEqual({
      x: 5,
      y: 6,
      h: 1.25,
    });
  });

  it('interpolates through later trajectory segments with that segment heading', () => {
    const ob = obstacle({
      trajectory: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });

    const pose = sampleScenarioAt(baseDoc([ob]), 1.5).obstacles[0]!.position;

    expect(pose.x).toBeCloseTo(10, 5);
    expect(pose.y).toBeCloseTo(5, 5);
    expect(pose.h).toBeCloseTo(Math.PI / 2, 5);
  });

  it('returns the fixed ego point when start and end are coincident', () => {
    const doc = baseDoc();
    doc.ego = { start: { x: 7, y: 8, h: 0.4 }, end: { x: 7, y: 8 }, waypoints: [] };

    expect(sampleScenarioAt(doc, 5).ego!.position).toEqual({ x: 7, y: 8, h: 0.4 });
  });
});
