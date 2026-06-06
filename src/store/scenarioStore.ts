import { create } from 'zustand';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { nanoid } from 'nanoid';
import type {
  ScenarioDoc,
  ScenarioEvent,
  ScenarioObstacle,
  ScenarioEgo,
  ScenarioFormat,
  ScenarioTrafficLight,
  TrajectoryVertex,
  WorldPoint,
} from '@/types/scenario';
import { makeBlankScenario, type BlankScenarioOptions } from '@/io/scenario/factory';

enableMapSet();

/** 一份已加载场景的会话条目（用于浏览面板）。 */
export interface LoadedScenario {
  /** 编辑器内部稳定 key。 */
  key: string;
  /** 来源文件名（展示用）。 */
  filename: string;
  doc: ScenarioDoc;
}

/** 当前选中实体的类别（驱动 Inspector 分发）。 */
export type SelectedKind = 'obstacle' | 'trafficLight' | 'ego' | null;

interface ScenarioState {
  /** 已加载的场景列表（可同时载入多份用于浏览/对比）。 */
  loaded: LoadedScenario[];
  /** 当前激活渲染/编辑的场景 key。 */
  activeKey: string | null;
  /** 渲染所用投影字符串（来自所加载地图，或用户选择）。 */
  projString: string | null;
  /** 当前选中的障碍物 uid（驱动 Inspector）。 */
  selectedObstacleUid: string | null;
  /** 当前选中的红绿灯 uid。 */
  selectedTrafficLightUid: string | null;
  /** 当前选中实体类别。 */
  selectedKind: SelectedKind;
}

interface ScenarioActions {
  setProjString(proj: string | null): void;
  addLoaded(entry: LoadedScenario): void;
  setActive(key: string | null): void;
  removeLoaded(key: string): void;
  clear(): void;
  /** 选中障碍物（兼容旧调用：等价 selectObstacle）。 */
  select(uid: string | null): void;
  selectObstacle(uid: string | null): void;
  selectTrafficLight(uid: string | null): void;
  selectEgo(): void;
  // 新建
  newScenario(format: ScenarioFormat, opts?: BlankScenarioOptions & { filename?: string }): void;
  // editing — all operate on the active doc
  updateObstacle(uid: string, patch: Partial<ScenarioObstacle>): void;
  updateObstaclePosition(uid: string, position: WorldPoint): void;
  addObstacle(ob: ScenarioObstacle): void;
  removeObstacle(uid: string): void;
  updateEgo(patch: Partial<ScenarioEgo>): void;
  setEgoPoint(role: 'start' | 'end', p: WorldPoint): void;
  addEgoWaypoint(p: WorldPoint): void;
  updateEgoWaypoint(index: number, p: WorldPoint): void;
  removeEgoWaypoint(index: number): void;
  addTrafficLight(tl: ScenarioTrafficLight): void;
  updateTrafficLight(uid: string, patch: Partial<ScenarioTrafficLight>): void;
  removeTrafficLight(uid: string): void;
  // 轨迹顶点
  addTrajectoryVertex(uid: string, v: TrajectoryVertex): void;
  updateTrajectoryVertex(uid: string, index: number, v: TrajectoryVertex): void;
  removeTrajectoryVertex(uid: string, index: number): void;
  // 动态事件
  addEvent(uid: string, ev: ScenarioEvent): void;
  updateEvent(uid: string, index: number, patch: Partial<ScenarioEvent>): void;
  removeEvent(uid: string, index: number): void;
}

export type ScenarioStore = ScenarioState & ScenarioActions;

function activeDoc(state: ScenarioState): ScenarioDoc | null {
  if (!state.activeKey) return null;
  return state.loaded.find((l) => l.key === state.activeKey)?.doc ?? null;
}

type SetFn = (recipe: (state: ScenarioStore) => void) => void;

/** 会话级动作：加载/激活/移除/选择。 */
function createSessionActions(
  set: SetFn,
): Pick<
  ScenarioActions,
  | 'setProjString'
  | 'addLoaded'
  | 'setActive'
  | 'removeLoaded'
  | 'clear'
  | 'select'
  | 'selectObstacle'
  | 'selectTrafficLight'
  | 'selectEgo'
  | 'newScenario'
> {
  return {
    setProjString(proj) {
      set((s) => {
        s.projString = proj;
      });
    },
    addLoaded(entry) {
      set((s) => {
        const existing = s.loaded.findIndex((l) => l.key === entry.key);
        if (existing >= 0) s.loaded[existing] = entry;
        else s.loaded.push(entry);
        s.activeKey = entry.key;
        clearSelection(s);
      });
    },
    setActive(key) {
      set((s) => {
        s.activeKey = key;
        clearSelection(s);
      });
    },
    removeLoaded(key) {
      set((s) => {
        s.loaded = s.loaded.filter((l) => l.key !== key);
        if (s.activeKey === key) {
          s.activeKey = s.loaded[0]?.key ?? null;
          clearSelection(s);
        }
      });
    },
    clear() {
      set((s) => {
        s.loaded = [];
        s.activeKey = null;
        clearSelection(s);
      });
    },
    select(uid) {
      set((s) => {
        selectObstacleIn(s, uid);
      });
    },
    selectObstacle(uid) {
      set((s) => {
        selectObstacleIn(s, uid);
      });
    },
    selectTrafficLight(uid) {
      set((s) => {
        s.selectedTrafficLightUid = uid;
        s.selectedObstacleUid = null;
        s.selectedKind = uid ? 'trafficLight' : null;
      });
    },
    selectEgo() {
      set((s) => {
        s.selectedObstacleUid = null;
        s.selectedTrafficLightUid = null;
        s.selectedKind = 'ego';
      });
    },
    newScenario(format, opts) {
      set((s) => {
        const doc = makeBlankScenario(format, opts);
        const filename = opts?.filename ?? `untitled-${format}.json`;
        const entry: LoadedScenario = { key: nanoid(), filename, doc };
        s.loaded.push(entry);
        s.activeKey = entry.key;
        clearSelection(s);
      });
    },
  };
}

/** 清空全部选中态。 */
function clearSelection(s: ScenarioState): void {
  s.selectedObstacleUid = null;
  s.selectedTrafficLightUid = null;
  s.selectedKind = null;
}

function selectObstacleIn(s: ScenarioState, uid: string | null): void {
  s.selectedObstacleUid = uid;
  s.selectedTrafficLightUid = null;
  s.selectedKind = uid ? 'obstacle' : null;
}

/** 编辑级动作：均作用于当前激活文档。 */
function createEditActions(
  set: SetFn,
): Omit<
  ScenarioActions,
  | 'setProjString'
  | 'addLoaded'
  | 'setActive'
  | 'removeLoaded'
  | 'clear'
  | 'select'
  | 'selectObstacle'
  | 'selectTrafficLight'
  | 'selectEgo'
  | 'newScenario'
> {
  return {
    updateObstacle(uid, patch) {
      set((s) => {
        const ob = activeDoc(s)?.obstacles.find((o) => o.uid === uid);
        if (ob) Object.assign(ob, patch);
      });
    },
    updateObstaclePosition(uid, position) {
      set((s) => {
        const ob = activeDoc(s)?.obstacles.find((o) => o.uid === uid);
        if (ob) ob.position = position;
      });
    },
    addObstacle(ob) {
      set((s) => {
        const doc = activeDoc(s);
        if (!doc) return;
        doc.obstacles.push(ob);
        selectObstacleIn(s, ob.uid);
      });
    },
    removeObstacle(uid) {
      set((s) => {
        const doc = activeDoc(s);
        if (!doc) return;
        doc.obstacles = doc.obstacles.filter((o) => o.uid !== uid);
        if (s.selectedObstacleUid === uid) clearSelection(s);
      });
    },
    updateEgo(patch) {
      set((s) => {
        const doc = activeDoc(s);
        if (doc) Object.assign(doc.ego, patch);
      });
    },
    setEgoPoint(role, p) {
      set((s) => {
        const doc = activeDoc(s);
        if (doc) doc.ego[role] = p;
      });
    },
    addEgoWaypoint(p) {
      set((s) => {
        activeDoc(s)?.ego.waypoints.push(p);
      });
    },
    updateEgoWaypoint(index, p) {
      set((s) => {
        const wps = activeDoc(s)?.ego.waypoints;
        if (wps && index >= 0 && index < wps.length) wps[index] = p;
      });
    },
    removeEgoWaypoint(index) {
      set((s) => {
        const ego = activeDoc(s)?.ego;
        if (ego && index >= 0 && index < ego.waypoints.length) ego.waypoints.splice(index, 1);
      });
    },
    addTrafficLight(tl) {
      set((s) => {
        const doc = activeDoc(s);
        if (!doc) return;
        doc.trafficLights.push(tl);
        s.selectedTrafficLightUid = tl.uid;
        s.selectedObstacleUid = null;
        s.selectedKind = 'trafficLight';
      });
    },
    updateTrafficLight(uid, patch) {
      set((s) => {
        const tl = activeDoc(s)?.trafficLights.find((t) => t.uid === uid);
        if (tl) Object.assign(tl, patch);
      });
    },
    removeTrafficLight(uid) {
      set((s) => {
        const doc = activeDoc(s);
        if (!doc) return;
        doc.trafficLights = doc.trafficLights.filter((t) => t.uid !== uid);
        if (s.selectedTrafficLightUid === uid) clearSelection(s);
      });
    },
    ...createTrajectoryActions(set),
    ...createEventActions(set),
  };
}

/** 轨迹顶点动作。更新轨迹后同步 moving（length>1）。 */
function createTrajectoryActions(
  set: SetFn,
): Pick<
  ScenarioActions,
  'addTrajectoryVertex' | 'updateTrajectoryVertex' | 'removeTrajectoryVertex'
> {
  const syncMoving = (ob: ScenarioObstacle) => {
    ob.moving = ob.trajectory.length > 1;
  };
  return {
    addTrajectoryVertex(uid, v) {
      set((s) => {
        const ob = activeDoc(s)?.obstacles.find((o) => o.uid === uid);
        if (!ob) return;
        ob.trajectory.push(v);
        syncMoving(ob);
      });
    },
    updateTrajectoryVertex(uid, index, v) {
      set((s) => {
        const ob = activeDoc(s)?.obstacles.find((o) => o.uid === uid);
        if (ob && index >= 0 && index < ob.trajectory.length) ob.trajectory[index] = v;
      });
    },
    removeTrajectoryVertex(uid, index) {
      set((s) => {
        const ob = activeDoc(s)?.obstacles.find((o) => o.uid === uid);
        if (!ob || index < 0 || index >= ob.trajectory.length) return;
        ob.trajectory.splice(index, 1);
        syncMoving(ob);
      });
    },
  };
}

/** 动态事件动作。 */
function createEventActions(
  set: SetFn,
): Pick<ScenarioActions, 'addEvent' | 'updateEvent' | 'removeEvent'> {
  return {
    addEvent(uid, ev) {
      set((s) => {
        activeDoc(s)
          ?.obstacles.find((o) => o.uid === uid)
          ?.events.push(ev);
      });
    },
    updateEvent(uid, index, patch) {
      set((s) => {
        const ev = activeDoc(s)?.obstacles.find((o) => o.uid === uid)?.events[index];
        if (ev) Object.assign(ev, patch);
      });
    },
    removeEvent(uid, index) {
      set((s) => {
        const ob = activeDoc(s)?.obstacles.find((o) => o.uid === uid);
        if (ob && index >= 0 && index < ob.events.length) ob.events.splice(index, 1);
      });
    },
  };
}

export const useScenarioStore = create<ScenarioStore>()(
  temporal(
    immer<ScenarioStore>((set) => ({
      loaded: [],
      activeKey: null,
      projString: null,
      selectedObstacleUid: null,
      selectedTrafficLightUid: null,
      selectedKind: null,
      ...createSessionActions(set),
      ...createEditActions(set),
    })),
    {
      partialize: (state) => ({ loaded: state.loaded, activeKey: state.activeKey }),
      limit: 100,
    },
  ),
);
