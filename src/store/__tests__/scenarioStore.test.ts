import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from '../scenarioStore';
import { useSceneToolStore, isPlaceTool, PLACE_TOOL_KIND } from '../sceneToolStore';
import { makeObstacle, makeTrafficLight, nextApolloId } from '@/io/scenario/factory';

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
