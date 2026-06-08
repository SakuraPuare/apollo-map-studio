import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from '../scenarioStore';
import { useSceneToolStore, isPlaceTool, PLACE_TOOL_KIND } from '../sceneToolStore';
import {
  makeBlankScenario,
  makeEvent,
  makeObstacle,
  makeTrafficLight,
  nextApolloId,
} from '@/io/scenario/factory';
import type { LoadedScenario } from '../scenarioStore';
import type { ScenarioDoc } from '@/types/scenario';

function freshDoc() {
  useScenarioStore.setState({
    loaded: [],
    activeKey: null,
    projString: null,
    selectedObstacleUid: null,
    selectedTrafficLightUid: null,
    selectedKind: null,
  });
  useScenarioStore.temporal.getState().clear();
  useScenarioStore.getState().newScenario('openscenario', { mapDir: 'm/x' });
  return useScenarioStore.getState();
}

const active = () => {
  const s = useScenarioStore.getState();
  return s.loaded.find((l) => l.key === s.activeKey)!.doc;
};

function doc(format: ScenarioDoc['format'] = 'openscenario', mapDir = 'm/x'): ScenarioDoc {
  return makeBlankScenario(format, { mapDir });
}

function loadEntry(key: string, filename = `${key}.json`, scenarioDoc = doc()): LoadedScenario {
  return { key, filename, doc: scenarioDoc };
}

describe('scenarioStore: authoring actions', () => {
  beforeEach(() => freshDoc());

  it('addObstacle appends and auto-selects', () => {
    const doc = active();
    const ob = makeObstacle('vehicle', { x: 1, y: 2 }, nextApolloId(doc));
    useScenarioStore.getState().addObstacle(ob);
    expect(active().obstacles).toHaveLength(1);
    expect(useScenarioStore.getState().selectedObstacleUid).toBe(ob.uid);
    expect(useScenarioStore.getState().selectedKind).toBe('obstacle');
  });

  it('nextApolloId increments past existing ids', () => {
    const s = useScenarioStore.getState();
    const id1 = nextApolloId(active());
    s.addObstacle(makeObstacle('vehicle', { x: 0, y: 0 }, id1));
    const id2 = nextApolloId(active());
    expect(id2).toBeGreaterThan(id1);
  });

  it('removeObstacle clears selection when the removed one was selected', () => {
    const doc = active();
    const ob = makeObstacle('pedestrian', { x: 0, y: 0 }, nextApolloId(doc));
    const s = useScenarioStore.getState();
    s.addObstacle(ob);
    s.removeObstacle(ob.uid);
    expect(active().obstacles).toHaveLength(0);
    expect(useScenarioStore.getState().selectedObstacleUid).toBeNull();
    expect(useScenarioStore.getState().selectedKind).toBeNull();
  });

  it('addTrafficLight + selectTrafficLight + update + remove', () => {
    const s = useScenarioStore.getState();
    const tl = makeTrafficLight({ x: 5, y: 6 }, 'Sig_1');
    s.addTrafficLight(tl);
    expect(active().trafficLights).toHaveLength(1);
    s.selectTrafficLight(tl.uid);
    expect(useScenarioStore.getState().selectedKind).toBe('trafficLight');
    s.updateTrafficLight(tl.uid, { initialColor: 'GREEN' });
    expect(active().trafficLights[0]!.initialColor).toBe('GREEN');
    s.removeTrafficLight(tl.uid);
    expect(active().trafficLights).toHaveLength(0);
  });

  it('ego: setEgoPoint, addEgoWaypoint, update/remove waypoint', () => {
    const s = useScenarioStore.getState();
    s.setEgoPoint('start', { x: 10, y: 20, h: 0.5 });
    expect(active().ego.start).toMatchObject({ x: 10, y: 20, h: 0.5 });
    s.addEgoWaypoint({ x: 1, y: 1 });
    s.addEgoWaypoint({ x: 2, y: 2 });
    expect(active().ego.waypoints).toHaveLength(2);
    s.updateEgoWaypoint(0, { x: 9, y: 9 });
    expect(active().ego.waypoints[0]).toMatchObject({ x: 9, y: 9 });
    s.removeEgoWaypoint(0);
    expect(active().ego.waypoints).toHaveLength(1);
    expect(active().ego.waypoints[0]).toMatchObject({ x: 2, y: 2 });
  });

  it('selectEgo sets kind and clears other selections', () => {
    const s = useScenarioStore.getState();
    const tl = makeTrafficLight({ x: 0, y: 0 });
    s.addTrafficLight(tl);
    s.selectTrafficLight(tl.uid);
    s.selectEgo();
    expect(useScenarioStore.getState().selectedKind).toBe('ego');
    expect(useScenarioStore.getState().selectedTrafficLightUid).toBeNull();
  });

  it('undo reverts an addObstacle', () => {
    const doc = active();
    const s = useScenarioStore.getState();
    s.addObstacle(makeObstacle('vehicle', { x: 0, y: 0 }, nextApolloId(doc)));
    expect(active().obstacles).toHaveLength(1);
    useScenarioStore.temporal.getState().undo();
    expect(active().obstacles).toHaveLength(0);
  });
});

describe('scenarioStore: session actions and selection', () => {
  beforeEach(() => {
    useScenarioStore.setState({
      loaded: [],
      activeKey: null,
      projString: null,
      selectedObstacleUid: null,
      selectedTrafficLightUid: null,
      selectedKind: null,
    });
    useScenarioStore.temporal.getState().clear();
  });

  it('loads, replaces, activates, and removes scenario entries', () => {
    const s = useScenarioStore.getState();
    const first = loadEntry('a', 'a.json');
    const second = loadEntry('b', 'b.json');

    s.addLoaded(first);
    expect(useScenarioStore.getState().activeKey).toBe('a');
    expect(useScenarioStore.getState().loaded.map((entry) => entry.key)).toEqual(['a']);

    s.addLoaded(second);
    expect(useScenarioStore.getState().activeKey).toBe('b');
    expect(useScenarioStore.getState().loaded.map((entry) => entry.key)).toEqual(['a', 'b']);

    s.addLoaded({ ...first, filename: 'a-replaced.json' });
    expect(useScenarioStore.getState().loaded).toHaveLength(2);
    expect(useScenarioStore.getState().loaded.find((entry) => entry.key === 'a')?.filename).toBe(
      'a-replaced.json',
    );

    s.setActive('a');
    expect(useScenarioStore.getState().activeKey).toBe('a');
    s.removeLoaded('a');
    expect(useScenarioStore.getState().activeKey).toBe('b');
    s.removeLoaded('b');
    expect(useScenarioStore.getState().activeKey).toBeNull();
    expect(useScenarioStore.getState().loaded).toEqual([]);
  });

  it('sets projection independently and clears loaded scenarios without clearing projection', () => {
    const s = useScenarioStore.getState();
    s.setProjString('+proj=utm +zone=50');
    s.addLoaded(loadEntry('a'));
    s.clear();

    expect(useScenarioStore.getState().loaded).toEqual([]);
    expect(useScenarioStore.getState().activeKey).toBeNull();
    expect(useScenarioStore.getState().projString).toBe('+proj=utm +zone=50');
  });

  it('clears selection when loading or activating a scenario', () => {
    const s = useScenarioStore.getState();
    s.addLoaded(loadEntry('a'));
    s.selectObstacle('ob-1');
    expect(useScenarioStore.getState().selectedKind).toBe('obstacle');

    s.addLoaded(loadEntry('b'));
    expect(useScenarioStore.getState().selectedKind).toBeNull();

    s.selectTrafficLight('tl-1');
    s.setActive('a');
    expect(useScenarioStore.getState().selectedTrafficLightUid).toBeNull();
    expect(useScenarioStore.getState().selectedKind).toBeNull();
  });

  it('switches selection kind consistently', () => {
    const s = useScenarioStore.getState();
    s.select('ob-1');
    expect(useScenarioStore.getState()).toMatchObject({
      selectedObstacleUid: 'ob-1',
      selectedTrafficLightUid: null,
      selectedKind: 'obstacle',
    });

    s.selectTrafficLight('tl-1');
    expect(useScenarioStore.getState()).toMatchObject({
      selectedObstacleUid: null,
      selectedTrafficLightUid: 'tl-1',
      selectedKind: 'trafficLight',
    });

    s.selectObstacle(null);
    expect(useScenarioStore.getState().selectedKind).toBeNull();

    s.selectTrafficLight(null);
    expect(useScenarioStore.getState().selectedKind).toBeNull();
  });

  it('creates a named blank scenario and makes it active', () => {
    const s = useScenarioStore.getState();

    s.newScenario('classic', { filename: 'new-classic.json', mapDir: 'maps/demo' });

    const state = useScenarioStore.getState();
    expect(state.loaded).toHaveLength(1);
    expect(state.loaded[0]!.filename).toBe('new-classic.json');
    expect(state.loaded[0]!.doc.format).toBe('classic');
    expect(state.loaded[0]!.doc.meta.mapDir).toBe('maps/demo');
    expect(state.activeKey).toBe(state.loaded[0]!.key);
  });
});

describe('scenarioStore: active document routing and edit guards', () => {
  beforeEach(() => {
    useScenarioStore.setState({
      loaded: [],
      activeKey: null,
      projString: null,
      selectedObstacleUid: null,
      selectedTrafficLightUid: null,
      selectedKind: null,
    });
    useScenarioStore.temporal.getState().clear();
  });

  it('edits only the active scenario when multiple are loaded', () => {
    const first = loadEntry('a');
    const second = loadEntry('b');
    useScenarioStore.getState().addLoaded(first);
    useScenarioStore.getState().addLoaded(second);

    const initialSecondDoc = useScenarioStore
      .getState()
      .loaded.find((entry) => entry.key === 'b')!.doc;
    const ob = makeObstacle('vehicle', { x: 1, y: 2 }, nextApolloId(initialSecondDoc));
    useScenarioStore.getState().addObstacle(ob);
    useScenarioStore.getState().updateObstaclePosition(ob.uid, { x: 5, y: 6, h: 0.25 });
    useScenarioStore.getState().updateObstacle(ob.uid, { initialSpeed: 7 });

    const firstDoc = useScenarioStore.getState().loaded.find((entry) => entry.key === 'a')!.doc;
    const secondDoc = useScenarioStore.getState().loaded.find((entry) => entry.key === 'b')!.doc;
    expect(firstDoc.obstacles).toHaveLength(0);
    expect(secondDoc.obstacles[0]).toMatchObject({
      uid: ob.uid,
      initialSpeed: 7,
      position: { x: 5, y: 6, h: 0.25 },
    });
  });

  it('leaves state unchanged when edit actions run without an active document or invalid ids', () => {
    const s = useScenarioStore.getState();
    s.addObstacle(makeObstacle('vehicle', { x: 0, y: 0 }, 1));
    s.addTrafficLight(makeTrafficLight({ x: 0, y: 0 }, 'Sig_1'));
    s.updateEgo({ startVelocity: 4 });
    s.setEgoPoint('end', { x: 1, y: 1 });
    s.addEgoWaypoint({ x: 2, y: 2 });
    s.updateObstacle('missing', { initialSpeed: 9 });
    s.removeObstacle('missing');
    s.updateTrafficLight('missing', { initialColor: 'RED' });
    s.removeTrafficLight('missing');
    s.addTrajectoryVertex('missing', { x: 1, y: 1 });
    s.updateTrajectoryVertex('missing', 0, { x: 2, y: 2 });
    s.removeTrajectoryVertex('missing', 0);
    s.addEvent('missing', makeEvent());
    s.updateEvent('missing', 0, { name: 'x' });
    s.removeEvent('missing', 0);

    expect(useScenarioStore.getState().loaded).toEqual([]);

    s.addLoaded(loadEntry('a'));
    const before = structuredClone(active());
    s.updateEgoWaypoint(10, { x: 1, y: 1 });
    s.removeEgoWaypoint(-1);
    expect(active()).toEqual(before);
  });

  it('updates ego fields and traffic light selection clearing', () => {
    useScenarioStore.getState().addLoaded(loadEntry('a'));
    const s = useScenarioStore.getState();
    const tl = makeTrafficLight({ x: 5, y: 6 }, 'Sig_1');

    s.updateEgo({ startVelocity: 3, startAcceleration: 0.5 });
    s.setEgoPoint('end', { x: 10, y: 20 });
    expect(active().ego).toMatchObject({
      startVelocity: 3,
      startAcceleration: 0.5,
      end: { x: 10, y: 20 },
    });

    s.addTrafficLight(tl);
    expect(useScenarioStore.getState().selectedKind).toBe('trafficLight');
    s.removeTrafficLight(tl.uid);
    expect(useScenarioStore.getState().selectedKind).toBeNull();
  });

  it('does not clear obstacle selection when removing a different obstacle', () => {
    useScenarioStore.getState().addLoaded(loadEntry('a'));
    const doc = active();
    const selected = makeObstacle('vehicle', { x: 0, y: 0 }, nextApolloId(doc));
    const other = makeObstacle('pedestrian', { x: 1, y: 1 }, nextApolloId(doc));
    const s = useScenarioStore.getState();

    s.addObstacle(selected);
    s.addObstacle(other);
    s.selectObstacle(selected.uid);
    s.removeObstacle(other.uid);

    expect(useScenarioStore.getState().selectedObstacleUid).toBe(selected.uid);
    expect(useScenarioStore.getState().selectedKind).toBe('obstacle');
  });
});

describe('scenarioStore: trajectory, events, and history', () => {
  beforeEach(() => freshDoc());

  function addObstacleToActive() {
    const scenarioDoc = active();
    const ob = makeObstacle('vehicle', { x: 0, y: 0 }, nextApolloId(scenarioDoc));
    useScenarioStore.getState().addObstacle(ob);
    return ob;
  }

  it('syncs obstacle moving state as trajectory vertices cross the moving threshold', () => {
    const ob = addObstacleToActive();
    const s = useScenarioStore.getState();

    s.addTrajectoryVertex(ob.uid, { x: 1, y: 1 });
    expect(active().obstacles[0]).toMatchObject({ moving: false, trajectory: [{ x: 1, y: 1 }] });

    s.addTrajectoryVertex(ob.uid, { x: 2, y: 2, speed: 3 });
    expect(active().obstacles[0]!.moving).toBe(true);

    s.updateTrajectoryVertex(ob.uid, 1, { x: 3, y: 4, h: 0.1 });
    expect(active().obstacles[0]!.trajectory[1]).toMatchObject({ x: 3, y: 4, h: 0.1 });

    s.removeTrajectoryVertex(ob.uid, 1);
    expect(active().obstacles[0]).toMatchObject({ moving: false, trajectory: [{ x: 1, y: 1 }] });
  });

  it('adds, patches, removes events, and ignores invalid event indices', () => {
    const ob = addObstacleToActive();
    const s = useScenarioStore.getState();
    const ev = makeEvent();

    s.addEvent(ob.uid, ev);
    expect(active().obstacles[0]!.events).toHaveLength(1);

    s.updateEvent(ob.uid, 0, {
      name: 'slow down',
      action: {
        kind: 'laneChange',
        relativeTargetLane: -1,
        dynamicsDimension: 'time',
        dynamicsValue: 2,
      },
    });
    expect(active().obstacles[0]!.events[0]).toMatchObject({
      name: 'slow down',
      action: { kind: 'laneChange', relativeTargetLane: -1 },
    });

    const beforeInvalidPatch = structuredClone(active().obstacles[0]!.events);
    s.updateEvent(ob.uid, 10, { name: 'ignored' });
    s.removeEvent(ob.uid, -1);
    expect(active().obstacles[0]!.events).toEqual(beforeInvalidPatch);

    s.removeEvent(ob.uid, 0);
    expect(active().obstacles[0]!.events).toEqual([]);
  });

  it('undoes and redoes document edits while leaving projection and selection out of history', () => {
    const s = useScenarioStore.getState();
    s.setProjString('proj-a');
    const ob = addObstacleToActive();
    s.selectObstacle(ob.uid);
    s.updateObstacle(ob.uid, { initialSpeed: 12 });

    expect(active().obstacles[0]!.initialSpeed).toBe(12);
    useScenarioStore.temporal.getState().undo();
    expect(active().obstacles[0]!.initialSpeed).toBe(0);
    expect(useScenarioStore.getState().projString).toBe('proj-a');
    expect(useScenarioStore.getState().selectedObstacleUid).toBe(ob.uid);

    useScenarioStore.temporal.getState().redo();
    expect(active().obstacles[0]!.initialSpeed).toBe(12);
  });

  it('clears redo history when a new action follows undo', () => {
    const ob = addObstacleToActive();
    const s = useScenarioStore.getState();
    s.updateObstacle(ob.uid, { initialSpeed: 1 });
    s.updateObstacle(ob.uid, { initialSpeed: 2 });

    useScenarioStore.temporal.getState().undo();
    expect(active().obstacles[0]!.initialSpeed).toBe(1);
    s.updateObstacle(ob.uid, { initialSpeed: 3 });
    useScenarioStore.temporal.getState().redo();

    expect(active().obstacles[0]!.initialSpeed).toBe(3);
  });
});

describe('sceneToolStore', () => {
  beforeEach(() => useSceneToolStore.setState({ tool: 'select', draftVertices: [] }));

  it('setTool switches tool and clears draft vertices', () => {
    const s = useSceneToolStore.getState();
    s.setTool('drawTrajectory');
    s.pushDraftVertex({ x: 1, y: 1 });
    s.pushDraftVertex({ x: 2, y: 2 });
    expect(useSceneToolStore.getState().draftVertices).toHaveLength(2);
    s.setTool('select');
    expect(useSceneToolStore.getState().draftVertices).toHaveLength(0);
  });

  it('clearDraft empties vertices without changing tool', () => {
    const s = useSceneToolStore.getState();
    s.setTool('drawTrajectory');
    s.pushDraftVertex({ x: 1, y: 1 });
    s.clearDraft();
    expect(useSceneToolStore.getState().draftVertices).toHaveLength(0);
    expect(useSceneToolStore.getState().tool).toBe('drawTrajectory');
  });

  it('isPlaceTool + PLACE_TOOL_KIND mapping', () => {
    expect(isPlaceTool('placeVehicle')).toBe(true);
    expect(isPlaceTool('drawTrajectory')).toBe(false);
    expect(isPlaceTool('select')).toBe(false);
    expect(PLACE_TOOL_KIND.placeVehicle).toBe('vehicle');
    expect(PLACE_TOOL_KIND.placeStatic).toBe('staticObstacle');
  });
});
