import { describe, it, expect } from 'vitest';
import { parseScenario } from '../parse';
import { serializeScenario } from '../serialize';
import { makeBlankScenario, makeObstacle, makeTrafficLight, nextApolloId } from '../factory';
import type { ScenarioEvent } from '@/types/scenario';
import { nanoid } from 'nanoid';

describe('serialize: new-entity append', () => {
  for (const fmt of ['openscenario', 'classic'] as const) {
    it(`${fmt}: blank scenario is itself round-trip stable`, () => {
      const doc = makeBlankScenario(fmt, { mapDir: 'm/x' });
      const j1 = serializeScenario(doc);
      const j2 = serializeScenario(parseScenario(j1));
      expect(j2).toEqual(j1);
    });

    it(`${fmt}: append obstacle + traffic light survives reparse`, () => {
      const doc = makeBlankScenario(fmt, { mapDir: 'm/x' });
      const ob = makeObstacle('vehicle', { x: 100, y: 200, h: 1.2 }, nextApolloId(doc));
      ob.initialSpeed = 5;
      ob.trajectory = [
        { x: 100, y: 200 },
        { x: 110, y: 200 },
        { x: 120, y: 205 },
      ];
      ob.moving = true;
      doc.obstacles.push(ob);
      const tl = makeTrafficLight({ x: 50, y: 60 }, 'Signal_test');
      doc.trafficLights.push(tl);
      const reparsed = parseScenario(serializeScenario(doc));
      expect(reparsed.obstacles).toHaveLength(1);
      expect(reparsed.obstacles[0]!.position).toMatchObject({ x: 100, y: 200 });
      expect(reparsed.obstacles[0]!.initialSpeed).toBe(5);
      expect(reparsed.obstacles[0]!.trajectory).toHaveLength(3);
      expect(reparsed.obstacles[0]!.kind).toBe('vehicle');
      expect(reparsed.trafficLights).toHaveLength(1);
      expect(reparsed.trafficLights[0]!.signalId).toBe('Signal_test');
    });

    it(`${fmt}: append is idempotent (serialize twice = same)`, () => {
      const doc = makeBlankScenario(fmt, { mapDir: 'm/x' });
      doc.obstacles.push(makeObstacle('pedestrian', { x: 1, y: 2 }, nextApolloId(doc)));
      const j1 = serializeScenario(doc);
      const j2 = serializeScenario(doc);
      expect(j2).toEqual(j1);
      // and stable through a parse cycle
      const j3 = serializeScenario(parseScenario(j1));
      expect(j3).toEqual(j1);
    });
  }

  it('openscenario: append speed event survives reparse', () => {
    const doc = makeBlankScenario('openscenario', { mapDir: 'm/x' });
    const ob = makeObstacle('vehicle', { x: 0, y: 0 }, nextApolloId(doc));
    const ev: ScenarioEvent = {
      uid: nanoid(),
      name: 'ev1',
      ref: null,
      trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 3 },
      action: {
        kind: 'speed',
        targetSpeed: 8,
        dynamicsShape: 'linear',
        dynamicsDimension: 'time',
        dynamicsValue: 2,
      },
    };
    ob.events.push(ev);
    doc.obstacles.push(ob);
    const reparsed = parseScenario(serializeScenario(doc));
    expect(reparsed.obstacles[0]!.events).toHaveLength(1);
    const got = reparsed.obstacles[0]!.events[0]!;
    expect(got.action).toMatchObject({ kind: 'speed', targetSpeed: 8, dynamicsValue: 2 });
    expect(got.trigger).toMatchObject({ kind: 'simulationTime', value: 3 });
  });
});
