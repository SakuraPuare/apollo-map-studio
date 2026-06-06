import { describe, it, expect } from 'vitest';
import { sampleScenarioAt, scenarioDuration, DEFAULT_SIM_DURATION } from '../scenarioSampler';
import type { ScenarioDoc, ScenarioObstacle, ScenarioTrafficLight } from '@/types/scenario';

function baseDoc(partial: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    format: 'openscenario',
    meta: { id: 's1', tags: [] },
    ego: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, waypoints: [] },
    obstacles: [],
    trafficLights: [],
    raw: {},
    ...partial,
  };
}

function obstacle(partial: Partial<ScenarioObstacle> = {}): ScenarioObstacle {
  return {
    uid: 'ob1',
    name: '1',
    apolloId: 1,
    kind: 'vehicle',
    dimensions: { length: 4, width: 2, height: 1.5 },
    position: { x: 0, y: 0, h: 0 },
    initialSpeed: 0,
    moving: false,
    trajectory: [],
    triggerType: 'NA',
    events: [],
    ref: null,
    ...partial,
  };
}

function trafficLight(partial: Partial<ScenarioTrafficLight> = {}): ScenarioTrafficLight {
  return {
    uid: 'tl1',
    signalId: 'Sig_1',
    location: { x: 0, y: 0 },
    triggerType: 'NA',
    initialColor: 'RED',
    stateGroup: [],
    ref: null,
    ...partial,
  };
}

describe('scenarioSampler: scenarioDuration', () => {
  it('uses meta.simulatorTime when present', () => {
    expect(scenarioDuration(baseDoc({ meta: { id: 's', tags: [], simulatorTime: 42 } }))).toBe(42);
  });

  it('falls back to default when nothing dynamic', () => {
    expect(scenarioDuration(baseDoc())).toBe(DEFAULT_SIM_DURATION);
  });

  it('derives from obstacle motion end time when no simulatorTime', () => {
    // 100m path @ 10 m/s ≈ 10s; derived duration is ceil'd and may overshoot
    // by one integration step, so accept [10, 11].
    const ob = obstacle({
      moving: true,
      initialSpeed: 10,
      trajectory: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    const d = scenarioDuration(baseDoc({ obstacles: [ob] }));
    expect(d).toBeGreaterThanOrEqual(10);
    expect(d).toBeLessThanOrEqual(11);
  });
});

describe('scenarioSampler: obstacle motion', () => {
  it('static obstacle stays put', () => {
    const ob = obstacle({ position: { x: 5, y: 7, h: 1 } });
    const posed = sampleScenarioAt(baseDoc({ obstacles: [ob] }), 5);
    expect(posed.obstacles[0]!.position.x).toBe(5);
    expect(posed.obstacles[0]!.position.y).toBe(7);
  });

  it('moving obstacle (openscenario, initialSpeed) advances along path', () => {
    const ob = obstacle({
      moving: true,
      initialSpeed: 10,
      trajectory: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    const doc = baseDoc({ obstacles: [ob], meta: { id: 's', tags: [], simulatorTime: 20 } });
    // at t=0 → at start
    expect(sampleScenarioAt(doc, 0).obstacles[0]!.position.x).toBeCloseTo(0, 5);
    // at t=5 → 50m
    expect(sampleScenarioAt(doc, 5).obstacles[0]!.position.x).toBeCloseTo(50, 1);
    // at t=10 → end (100m), clamped
    expect(sampleScenarioAt(doc, 10).obstacles[0]!.position.x).toBeCloseTo(100, 1);
    // past end stays clamped
    expect(sampleScenarioAt(doc, 30).obstacles[0]!.position.x).toBeCloseTo(100, 1);
  });

  it('classic per-vertex speed drives segment timing', () => {
    const ob = obstacle({
      moving: true,
      trajectory: [
        { x: 0, y: 0, speed: 10 },
        { x: 100, y: 0, speed: 10 },
      ],
    });
    const doc = baseDoc({ obstacles: [ob], meta: { id: 's', tags: [], simulatorTime: 20 } });
    expect(sampleScenarioAt(doc, 5).obstacles[0]!.position.x).toBeCloseTo(50, 1);
  });

  it('TIME trigger delays start', () => {
    const ob = obstacle({
      moving: true,
      initialSpeed: 10,
      triggerType: 'TIME',
      triggerValue: 3,
      trajectory: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    const doc = baseDoc({ obstacles: [ob], meta: { id: 's', tags: [], simulatorTime: 20 } });
    // before trigger → at start
    expect(sampleScenarioAt(doc, 2).obstacles[0]!.position.x).toBeCloseTo(0, 5);
    // 2s after trigger → 20m
    expect(sampleScenarioAt(doc, 5).obstacles[0]!.position.x).toBeCloseTo(20, 1);
  });

  it('speed event changes velocity mid-run', () => {
    const ob = obstacle({
      moving: true,
      initialSpeed: 10,
      trajectory: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
      ],
      events: [
        {
          uid: 'e1',
          name: 'slow',
          trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 5 },
          action: {
            kind: 'speed',
            targetSpeed: 0,
            dynamicsShape: 'linear',
            dynamicsDimension: 'time',
            dynamicsValue: 0,
          },
          ref: null,
        },
      ],
    });
    const doc = baseDoc({ obstacles: [ob], meta: { id: 's', tags: [], simulatorTime: 30 } });
    // by t=5 obstacle has gone 50m, then speed→0 so it should stay near 50m afterwards
    const at5 = sampleScenarioAt(doc, 5).obstacles[0]!.position.x;
    const at10 = sampleScenarioAt(doc, 10).obstacles[0]!.position.x;
    expect(at5).toBeCloseTo(50, 0);
    expect(at10).toBeCloseTo(at5, 0);
  });
});

describe('scenarioSampler: traffic lights', () => {
  it('static (no stateGroup) keeps initial color', () => {
    const tl = trafficLight({ initialColor: 'GREEN', stateGroup: [] });
    expect(sampleScenarioAt(baseDoc({ trafficLights: [tl] }), 10).trafficLights[0]!.color).toBe(
      'GREEN',
    );
  });

  it('cycles through stateGroup by keepTime', () => {
    const tl = trafficLight({
      initialColor: 'RED',
      stateGroup: [
        { color: 'GREEN', keepTime: 10 },
        { color: 'YELLOW', keepTime: 3 },
        { color: 'RED', keepTime: 12 },
      ],
    });
    const doc = baseDoc({ trafficLights: [tl] });
    expect(sampleScenarioAt(doc, 5).trafficLights[0]!.color).toBe('GREEN');
    expect(sampleScenarioAt(doc, 11).trafficLights[0]!.color).toBe('YELLOW');
    expect(sampleScenarioAt(doc, 20).trafficLights[0]!.color).toBe('RED');
    // loops: cycle = 25s, so t=30 → 5s into cycle → GREEN
    expect(sampleScenarioAt(doc, 30).trafficLights[0]!.color).toBe('GREEN');
  });
});

describe('scenarioSampler: ego', () => {
  it('moves uniformly start→end over duration', () => {
    const doc = baseDoc({
      ego: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, waypoints: [] },
      meta: { id: 's', tags: [], simulatorTime: 10 },
    });
    expect(sampleScenarioAt(doc, 0).ego!.position.x).toBeCloseTo(0, 5);
    expect(sampleScenarioAt(doc, 5).ego!.position.x).toBeCloseTo(50, 1);
    expect(sampleScenarioAt(doc, 10).ego!.position.x).toBeCloseTo(100, 1);
  });

  it('returns null when ego has no valid path', () => {
    const doc = baseDoc({
      ego: { start: { x: NaN, y: NaN }, end: { x: NaN, y: NaN }, waypoints: [] },
    });
    expect(sampleScenarioAt(doc, 1).ego).toBeNull();
  });
});
