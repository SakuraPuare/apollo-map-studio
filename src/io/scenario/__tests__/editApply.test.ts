import { describe, it, expect } from 'vitest';
import { parseScenario } from '../parse';
import { serializeScenario } from '../serialize';
import {
  makeBlankScenario,
  makeObstacle,
  makeTrafficLight,
  makeEvent,
  nextApolloId,
} from '../factory';

/**
 * 回归测试：删除回写（B1）、kind/triggerType 回写（B2/B3）、缺 private 的运动回写（C5）、
 * 既有事件 patch 与删除事件剪枝（C2）。这些都是“编辑后 serialize→reparse”才暴露的问题，
 * 单纯的 no-edit round-trip（fidelity.test）覆盖不到。
 */

/** 造一份带 N 个障碍物 + M 个灯的 doc（经一次 serialize→parse 拿到带 ref 的真实结构）。 */
function seeded(fmt: 'openscenario' | 'classic', nObs: number, nLights: number) {
  const blank = makeBlankScenario(fmt, { mapDir: 'm/x' });
  for (let i = 0; i < nObs; i++) {
    const ob = makeObstacle('vehicle', { x: i * 10, y: i * 10, h: 0 }, nextApolloId(blank));
    ob.initialSpeed = i + 1;
    blank.obstacles.push(ob);
  }
  for (let i = 0; i < nLights; i++)
    blank.trafficLights.push(makeTrafficLight({ x: i, y: i }, `Sig_${i}`));
  return parseScenario(serializeScenario(blank));
}

describe('serialize: delete reconciliation (B1)', () => {
  for (const fmt of ['openscenario', 'classic'] as const) {
    it(`${fmt}: deleting a middle obstacle does not resurrect it`, () => {
      const doc = seeded(fmt, 3, 0);
      const keepFirst = doc.obstacles[0]!.name;
      const keepLast = doc.obstacles[2]!.name;
      doc.obstacles.splice(1, 1); // remove the middle one
      const reparsed = parseScenario(serializeScenario(doc));
      expect(reparsed.obstacles).toHaveLength(2);
      expect(reparsed.obstacles.map((o) => o.name)).toEqual([keepFirst, keepLast]);
    });

    it(`${fmt}: deleting a traffic light removes it from raw`, () => {
      const doc = seeded(fmt, 0, 3);
      doc.trafficLights.splice(0, 1);
      const reparsed = parseScenario(serializeScenario(doc));
      expect(reparsed.trafficLights).toHaveLength(2);
      expect(reparsed.trafficLights.map((t) => t.signalId)).toEqual(['Sig_1', 'Sig_2']);
    });

    it(`${fmt}: surviving entities keep their edited values after a delete`, () => {
      const doc = seeded(fmt, 3, 0);
      doc.obstacles[2]!.initialSpeed = 42;
      doc.obstacles.splice(0, 1); // delete first; index drift must not corrupt survivors
      const reparsed = parseScenario(serializeScenario(doc));
      expect(reparsed.obstacles).toHaveLength(2);
      const edited = reparsed.obstacles.find((o) => o.initialSpeed === 42);
      expect(edited).toBeDefined();
    });

    it(`${fmt}: delete is idempotent through repeated serialize`, () => {
      const doc = seeded(fmt, 3, 2);
      doc.obstacles.splice(1, 1);
      doc.trafficLights.splice(0, 1);
      const j1 = serializeScenario(doc);
      const j2 = serializeScenario(doc);
      expect(j2).toEqual(j1);
      expect(serializeScenario(parseScenario(j1))).toEqual(j1);
    });
  }
});

describe('serialize: kind + traffic-light write-back (B2/B3)', () => {
  it('openscenario: changing kind rebuilds entityObject holder', () => {
    const doc = seeded('openscenario', 1, 0);
    doc.obstacles[0]!.kind = 'pedestrian';
    const reparsed = parseScenario(serializeScenario(doc));
    expect(reparsed.obstacles[0]!.kind).toBe('pedestrian');
  });

  it('traffic-light triggerType + signalId survive an edit', () => {
    const doc = seeded('openscenario', 0, 1);
    doc.trafficLights[0]!.triggerType = 'DISTANCE';
    doc.trafficLights[0]!.triggerValue = 25;
    doc.trafficLights[0]!.signalId = 'RenamedSignal';
    const reparsed = parseScenario(serializeScenario(doc));
    expect(reparsed.trafficLights[0]!.triggerType).toBe('DISTANCE');
    expect(reparsed.trafficLights[0]!.triggerValue).toBe(25);
    expect(reparsed.trafficLights[0]!.signalId).toBe('RenamedSignal');
  });
});

describe('serialize: events patch + prune (C2)', () => {
  it('openscenario: patches an existing event in place', () => {
    const doc = seeded('openscenario', 1, 0);
    doc.obstacles[0]!.events.push(makeEvent());
    const withEvent = parseScenario(serializeScenario(doc)); // now event has a ref
    expect(withEvent.obstacles[0]!.events).toHaveLength(1);
    withEvent.obstacles[0]!.events[0]!.action = {
      kind: 'speed',
      targetSpeed: 99,
      dynamicsShape: 'linear',
      dynamicsDimension: 'time',
      dynamicsValue: 1,
    };
    const reparsed = parseScenario(serializeScenario(withEvent));
    expect(reparsed.obstacles[0]!.events).toHaveLength(1);
    expect(reparsed.obstacles[0]!.events[0]!.action).toMatchObject({
      kind: 'speed',
      targetSpeed: 99,
    });
  });

  it('openscenario: removing an event prunes it from raw', () => {
    const doc = seeded('openscenario', 1, 0);
    doc.obstacles[0]!.events.push(makeEvent());
    const withEvent = parseScenario(serializeScenario(doc));
    withEvent.obstacles[0]!.events.splice(0, 1);
    const reparsed = parseScenario(serializeScenario(withEvent));
    expect(reparsed.obstacles[0]!.events).toHaveLength(0);
  });

  it('openscenario: deleting an obstacle prunes its events too', () => {
    const doc = seeded('openscenario', 2, 0);
    doc.obstacles[0]!.events.push(makeEvent());
    const withEvent = parseScenario(serializeScenario(doc));
    expect(withEvent.obstacles[0]!.events).toHaveLength(1);
    withEvent.obstacles.splice(0, 1);
    const reparsed = parseScenario(serializeScenario(withEvent));
    expect(reparsed.obstacles).toHaveLength(1);
    expect(reparsed.obstacles[0]!.events).toHaveLength(0);
  });
});

describe('serialize: missing-private motion edit (C5)', () => {
  // 手搓一份“有 scenarioObject 但没有对应 private”的 openscenario（语料里真实存在的形态）。
  function privatelessRaw() {
    return {
      id: 'c5',
      scenario: {
        roadNetwork: { logicFile: { filepath: 'm/x' }, trafficLights: [] },
        entities: {
          scenarioObjects: [
            {
              name: 'NPC1',
              id: 7001,
              entityObject: {
                vehicle: {
                  vehicleCategory: 'car',
                  boundingBox: { dimensions: { length: 4, width: 2, height: 1.6 } },
                },
              },
            },
          ],
        },
        storyboard: { init: { actions: { privates: [] } }, stories: [] },
        autoCarInfo: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      },
      type: 'worldsim',
    };
  }

  it('openscenario: editing motion on a private-less obstacle appends a private (idempotent)', () => {
    const doc = parseScenario(privatelessRaw());
    expect(doc.obstacles).toHaveLength(1);
    expect(
      doc.obstacles[0]!.ref?.kind === 'openscenario' && doc.obstacles[0]!.ref.privateIndex,
    ).toBeUndefined();

    doc.obstacles[0]!.position = { x: 5, y: 6, h: 0.3 };
    doc.obstacles[0]!.initialSpeed = 7;
    const reparsed = parseScenario(serializeScenario(doc));
    expect(reparsed.obstacles[0]!.position).toMatchObject({ x: 5, y: 6 });
    expect(reparsed.obstacles[0]!.initialSpeed).toBe(7);

    // 幂等：重复 serialize 不应累加重复 private。
    const j1 = serializeScenario(doc);
    expect(serializeScenario(doc)).toEqual(j1);
    expect(serializeScenario(parseScenario(j1))).toEqual(j1);
  });

  it('openscenario: an untouched private-less obstacle stays private-less (no spurious append)', () => {
    const raw = privatelessRaw();
    const out = serializeScenario(parseScenario(raw)) as any;
    expect(out.scenario.storyboard.init.actions.privates).toHaveLength(0);
  });
});
