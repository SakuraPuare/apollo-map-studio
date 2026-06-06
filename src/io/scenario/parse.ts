import { nanoid } from 'nanoid';
import type {
  Dimensions,
  EventRef,
  ObstacleKind,
  ScenarioDoc,
  ScenarioEgo,
  ScenarioEvent,
  ScenarioEventAction,
  ScenarioFormat,
  ScenarioMeta,
  ScenarioObstacle,
  ScenarioTrafficLight,
  ScenarioTrigger,
  TrafficLightColor,
  TrafficLightState,
  TrajectoryVertex,
  TriggerRule,
  TriggerType,
  WorldPoint,
} from '@/types/scenario';
import { deepClone, detectScenarioFormat, isRecord, num, str } from './detect';

/** 解析一份场景 JSON 为归一化文档。raw 保留原始深拷贝，保证无损 round-trip。 */
export function parseScenario(input: unknown): ScenarioDoc {
  const format = detectScenarioFormat(input);
  if (!format || !isRecord(input)) {
    throw new Error('[scenario] unrecognized scenario JSON (no scenario.storyboard/agent)');
  }
  const raw = deepClone(input);
  const scenario = isRecord(raw.scenario) ? raw.scenario : {};
  const meta = parseMeta(raw, scenario, format);

  if (format === 'openscenario') {
    return {
      format,
      meta,
      ego: parseEgoOpenScenario(scenario),
      obstacles: parseObstaclesOpenScenario(scenario),
      trafficLights: parseTrafficLightsOpenScenario(scenario),
      raw,
    };
  }
  return {
    format,
    meta,
    ego: parseEgoClassic(scenario),
    obstacles: parseObstaclesClassic(scenario),
    trafficLights: parseTrafficLightsClassic(scenario),
    raw,
  };
}

// ─── meta ────────────────────────────────────────────────────────────────

function parseMeta(
  raw: Record<string, unknown>,
  scenario: Record<string, unknown>,
  format: ScenarioFormat,
): ScenarioMeta {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string')
    : [];
  let mapDir: string | undefined;
  if (format === 'openscenario') {
    const rn = isRecord(scenario.roadNetwork) ? scenario.roadNetwork : undefined;
    const lf = rn && isRecord(rn.logicFile) ? rn.logicFile : undefined;
    mapDir = lf ? str(lf.filepath) || undefined : undefined;
  } else {
    mapDir = str(scenario.mapDir) || undefined;
  }
  return {
    id: str(raw.id),
    mapId: str(raw.mapId) || undefined,
    mapDir,
    type: str(raw.type) || undefined,
    tags,
    descriptionEn: str(raw.descriptionEn) || undefined,
    authorName: str(raw.authorName) || undefined,
    simulatorTime: parseSimulatorTime(scenario, format),
  };
}

function parseSimulatorTime(
  scenario: Record<string, unknown>,
  format: ScenarioFormat,
): number | undefined {
  if (format === 'classic') {
    return typeof scenario.simulatorTime === 'number' ? scenario.simulatorTime : undefined;
  }
  const sb = isRecord(scenario.storyboard) ? scenario.storyboard : undefined;
  const stop = sb && isRecord(sb.stopTrigger) ? sb.stopTrigger : undefined;
  const groups = stop && Array.isArray(stop.conditionGroups) ? stop.conditionGroups : [];
  for (const g of groups) {
    const t = simTimeFromConditionGroup(g);
    if (t !== undefined) return t;
  }
  return undefined;
}

function simTimeFromConditionGroup(group: unknown): number | undefined {
  if (!isRecord(group) || !Array.isArray(group.conditions)) return undefined;
  for (const c of group.conditions) {
    if (!isRecord(c)) continue;
    const bvc = isRecord(c.byValueCondition) ? c.byValueCondition : undefined;
    const stc =
      bvc && isRecord(bvc.simulationTimeCondition) ? bvc.simulationTimeCondition : undefined;
    if (stc && typeof stc.value === 'number') return stc.value;
  }
  return undefined;
}

// ─── openscenario: ego ─────────────────────────────────────────────────────

function parseEgoOpenScenario(scenario: Record<string, unknown>): ScenarioEgo {
  const aci = isRecord(scenario.autoCarInfo) ? scenario.autoCarInfo : {};
  const start = parsePointLike(aci.start) ?? { x: 0, y: 0 };
  const end = parsePointLike(aci.end) ?? { x: 0, y: 0 };
  const waypoints: WorldPoint[] = [];
  const rr = isRecord(aci.routingRequest) ? aci.routingRequest : undefined;
  if (rr && Array.isArray(rr.waypoint)) {
    for (const w of rr.waypoint) {
      if (isRecord(w)) {
        const p = parsePointLike(w.pose);
        if (p) waypoints.push(p);
      }
    }
  }
  return {
    start,
    end,
    waypoints,
    startVelocity: typeof aci.startVelocity === 'number' ? aci.startVelocity : undefined,
    startAcceleration:
      typeof aci.startAcceleration === 'number' ? aci.startAcceleration : undefined,
    parkingPoint: parsePointLike(aci.parkingPoint) ?? undefined,
  };
}

// ─── openscenario: obstacles ────────────────────────────────────────────────

function parseObstaclesOpenScenario(scenario: Record<string, unknown>): ScenarioObstacle[] {
  const entities = isRecord(scenario.entities) ? scenario.entities : {};
  const objs = Array.isArray(entities.scenarioObjects) ? entities.scenarioObjects : [];
  const sb = isRecord(scenario.storyboard) ? scenario.storyboard : {};
  const init = isRecord(sb.init) ? sb.init : {};
  const actions = isRecord(init.actions) ? init.actions : {};
  const privates = Array.isArray(actions.privates) ? actions.privates : [];

  // entityRef keys on `name`（已实测：121 处 name≠id，全部按 name 匹配）。
  const privateByName = new Map<string, number>();
  privates.forEach((p, i) => {
    if (isRecord(p) && isRecord(p.entityRef)) {
      privateByName.set(str(p.entityRef.entityRef), i);
    }
  });

  const result: ScenarioObstacle[] = [];
  const eventsByActor = parseStories(scenario);
  objs.forEach((obj, objIndex) => {
    if (!isRecord(obj)) return;
    const name = str(obj.name, String(num(obj.id)));
    const apolloId = num(obj.id);
    const { kind, dimensions } = parseEntityObject(obj.entityObject);
    const privateIndex = privateByName.get(name);
    const priv = privateIndex !== undefined ? privates[privateIndex] : undefined;
    const motion = parsePrivateMotion(isRecord(priv) ? priv : undefined);
    result.push({
      uid: nanoid(),
      name,
      apolloId,
      kind,
      dimensions,
      position: motion.position,
      initialSpeed: motion.initialSpeed,
      moving: motion.trajectory.length > 1,
      trajectory: motion.trajectory,
      triggerType: 'NA',
      events: eventsByActor.get(name) ?? [],
      ref: { kind: 'openscenario', objIndex, privateIndex },
    });
  });
  return result;
}

function parseEntityObject(entityObject: unknown): { kind: ObstacleKind; dimensions: Dimensions } {
  const eo = isRecord(entityObject) ? entityObject : {};
  if (isRecord(eo.vehicle)) {
    const cat = str(eo.vehicle.vehicleCategory);
    const kind: ObstacleKind = cat === 'bicycle' ? 'bicycle' : 'vehicle';
    return { kind, dimensions: parseDimensions(eo.vehicle.boundingBox) };
  }
  if (isRecord(eo.pedestrian)) {
    return { kind: 'pedestrian', dimensions: parseDimensions(eo.pedestrian.boundingBox) };
  }
  if (isRecord(eo.unknownUnmovableObject)) {
    return {
      kind: 'staticObstacle',
      dimensions: parseDimensions(eo.unknownUnmovableObject.boundingBox),
    };
  }
  return { kind: 'unknown', dimensions: { length: 1, width: 1, height: 1 } };
}

function parseDimensions(boundingBox: unknown): Dimensions {
  const bb = isRecord(boundingBox) ? boundingBox : {};
  const d = isRecord(bb.dimensions) ? bb.dimensions : {};
  return { length: num(d.length, 1), width: num(d.width, 1), height: num(d.height, 1) };
}

interface PrivateMotion {
  position: WorldPoint;
  initialSpeed: number;
  trajectory: TrajectoryVertex[];
}

function parsePrivateMotion(priv: Record<string, unknown> | undefined): PrivateMotion {
  const out: PrivateMotion = { position: { x: 0, y: 0 }, initialSpeed: 0, trajectory: [] };
  if (!priv) return out;
  const actions = Array.isArray(priv.privateActions) ? priv.privateActions : [];
  for (const a of actions) {
    if (!isRecord(a)) continue;
    if (isRecord(a.teleportAction)) {
      const pos = parseWorldPosition(a.teleportAction);
      if (pos) out.position = pos;
    }
    if (isRecord(a.longitudinalAction)) {
      const speed = parseSpeedAction(a.longitudinalAction);
      if (speed !== undefined) out.initialSpeed = speed;
    }
    if (isRecord(a.routingAction)) {
      out.trajectory = parseTrajectory(a.routingAction);
    }
  }
  return out;
}

function parseWorldPosition(teleportAction: Record<string, unknown>): WorldPoint | null {
  const pos = isRecord(teleportAction.position) ? teleportAction.position : undefined;
  const wp = pos && isRecord(pos.worldPosition) ? pos.worldPosition : undefined;
  if (!wp) return null;
  return {
    x: num(wp.x),
    y: num(wp.y),
    h: typeof wp.h === 'number' ? wp.h : undefined,
    v: typeof wp.v === 'number' ? wp.v : undefined,
  };
}

function parseSpeedAction(longitudinalAction: Record<string, unknown>): number | undefined {
  const sa = isRecord(longitudinalAction.speedAction) ? longitudinalAction.speedAction : undefined;
  const tgt = sa && isRecord(sa.speedActionTarget) ? sa.speedActionTarget : undefined;
  const abs = tgt && isRecord(tgt.absoluteTargetSpeed) ? tgt.absoluteTargetSpeed : undefined;
  return abs && typeof abs.value === 'number' ? abs.value : undefined;
}

function parseTrajectory(routingAction: Record<string, unknown>): TrajectoryVertex[] {
  const fta = isRecord(routingAction.followTrajectoryAction)
    ? routingAction.followTrajectoryAction
    : undefined;
  const tr = fta && isRecord(fta.trajectoryRef) ? fta.trajectoryRef : undefined;
  const traj = tr && isRecord(tr.trajectory) ? tr.trajectory : undefined;
  const shape = traj && isRecord(traj.shape) ? traj.shape : undefined;
  const poly = shape && isRecord(shape.polyline) ? shape.polyline : undefined;
  const verts = poly && Array.isArray(poly.vertices) ? poly.vertices : [];
  const out: TrajectoryVertex[] = [];
  for (const v of verts) {
    if (!isRecord(v)) continue;
    const pos = parseWorldPosition(v);
    if (pos) out.push({ x: pos.x, y: pos.y, h: pos.h });
  }
  return out;
}

// ─── openscenario: 动态机动 (storyboard.stories) ─────────────────────────────

/** 解析 storyboard.stories，把事件按 actor(entityRef 名) 归集。
 *  只收识别得了的 speed/laneChange 动作；其余形态略过（靠 raw 保留）。 */
function parseStories(scenario: Record<string, unknown>): Map<string, ScenarioEvent[]> {
  const byActor = new Map<string, ScenarioEvent[]>();
  const sb = isRecord(scenario.storyboard) ? scenario.storyboard : undefined;
  const stories = sb && Array.isArray(sb.stories) ? sb.stories : [];
  stories.forEach((story, storyIndex) => {
    const acts = isRecord(story) && Array.isArray(story.acts) ? story.acts : [];
    acts.forEach((act, actIndex) => {
      const mgs = isRecord(act) && Array.isArray(act.maneuverGroups) ? act.maneuverGroups : [];
      mgs.forEach((mg, mgIndex) => {
        if (!isRecord(mg)) return;
        const actors = collectActorRefs(mg.actors);
        const maneuvers = Array.isArray(mg.maneuvers) ? mg.maneuvers : [];
        maneuvers.forEach((man, manIndex) => {
          const events = isRecord(man) && Array.isArray(man.events) ? man.events : [];
          events.forEach((ev, eventIndex) => {
            const parsed = parseEvent(ev, { storyIndex, actIndex, mgIndex, manIndex, eventIndex });
            if (!parsed) return;
            for (const actor of actors) {
              const list = byActor.get(actor) ?? [];
              list.push(parsed);
              byActor.set(actor, list);
            }
          });
        });
      });
    });
  });
  return byActor;
}

/** maneuverGroup.actors.entityRefs[].entityRef → 名字数组。 */
function collectActorRefs(actors: unknown): string[] {
  if (!isRecord(actors) || !Array.isArray(actors.entityRefs)) return [];
  const out: string[] = [];
  for (const r of actors.entityRefs) {
    if (isRecord(r)) {
      const name = str(r.entityRef);
      if (name) out.push(name);
    }
  }
  return out;
}

/** 解析单个事件；动作不可识别则返回 null（不建模、保留在 raw）。 */
function parseEvent(ev: unknown, ref: EventRef): ScenarioEvent | null {
  if (!isRecord(ev)) return null;
  const actions = Array.isArray(ev.actions) ? ev.actions : [];
  const first = actions.find(isRecord);
  const action = first ? parseEventAction(first.privateAction) : null;
  if (!action) return null;
  return {
    uid: nanoid(),
    name: str(ev.name),
    trigger: parseStartTrigger(ev.startTrigger),
    action,
    ref,
  };
}

/** 一个 raw 事件是否“建模得了”（parse 会收集它）。序列化剪枝用：只删除被建模但已失存活的事件，
 *  保留不可识别的事件（靠 raw 无损保留）。 */
export function isModeledRawEvent(ev: unknown): boolean {
  if (!isRecord(ev)) return false;
  const actions = Array.isArray(ev.actions) ? ev.actions : [];
  const first = actions.find(isRecord);
  return first ? parseEventAction(first.privateAction) !== null : false;
}

function parseEventAction(privateAction: unknown): ScenarioEventAction | null {
  if (!isRecord(privateAction)) return null;
  const lon = isRecord(privateAction.longitudinalAction)
    ? privateAction.longitudinalAction
    : undefined;
  if (lon) {
    const sa = isRecord(lon.speedAction) ? lon.speedAction : undefined;
    const dyn = sa && isRecord(sa.speedActionDynamics) ? sa.speedActionDynamics : undefined;
    const tgt = sa && isRecord(sa.speedActionTarget) ? sa.speedActionTarget : undefined;
    const abs = tgt && isRecord(tgt.absoluteTargetSpeed) ? tgt.absoluteTargetSpeed : undefined;
    if (abs) {
      return {
        kind: 'speed',
        targetSpeed: num(abs.value),
        dynamicsShape: 'linear',
        dynamicsDimension: parseDynamicsDimension(dyn?.dynamicsDimension),
        dynamicsValue: dyn ? num(dyn.value) : 0,
      };
    }
  }
  const lat = isRecord(privateAction.lateralAction) ? privateAction.lateralAction : undefined;
  if (lat) {
    const lca = isRecord(lat.laneChangeAction) ? lat.laneChangeAction : undefined;
    const dyn =
      lca && isRecord(lca.laneChangeActionDynamics) ? lca.laneChangeActionDynamics : undefined;
    const tgt = lca && isRecord(lca.laneChangeTarget) ? lca.laneChangeTarget : undefined;
    const rel = tgt && isRecord(tgt.relativeTargetLane) ? tgt.relativeTargetLane : undefined;
    if (rel) {
      const entityRef = isRecord(rel.entityRef) ? str(rel.entityRef.entityRef) : '';
      return {
        kind: 'laneChange',
        relativeTargetLane: num(rel.value),
        targetRef: entityRef || undefined,
        dynamicsDimension: dyn ? str(dyn.dynamicsDimension) : 'distance',
        dynamicsValue: dyn ? num(dyn.value) : 0,
      };
    }
  }
  return null;
}

function parseDynamicsDimension(value: unknown): 'time' | 'distance' | 'rate' {
  const s = str(value);
  return s === 'time' || s === 'rate' ? s : 'distance';
}

/** startTrigger → 首个条件。语料里 conditionGroups/conditions 几乎都是单元素。 */
function parseStartTrigger(startTrigger: unknown): ScenarioTrigger | null {
  if (!isRecord(startTrigger)) return null;
  const groups = Array.isArray(startTrigger.conditionGroups) ? startTrigger.conditionGroups : [];
  for (const g of groups) {
    const conds = isRecord(g) && Array.isArray(g.conditions) ? g.conditions : [];
    for (const c of conds) {
      const trig = parseCondition(c);
      if (trig) return trig;
    }
  }
  return null;
}

function parseCondition(cond: unknown): ScenarioTrigger | null {
  if (!isRecord(cond)) return null;
  const byValue = isRecord(cond.byValueCondition) ? cond.byValueCondition : undefined;
  if (byValue && isRecord(byValue.simulationTimeCondition)) {
    const st = byValue.simulationTimeCondition;
    return { kind: 'simulationTime', rule: parseRule(st.rule), value: num(st.value) };
  }
  const byEntity = isRecord(cond.byEntityCondition) ? cond.byEntityCondition : undefined;
  const ec = byEntity && isRecord(byEntity.entityCondition) ? byEntity.entityCondition : undefined;
  if (ec && isRecord(ec.distanceCondition)) {
    const dc = ec.distanceCondition;
    const pos = parseWorldPosition(dc);
    return {
      kind: 'distance',
      rule: parseRule(dc.rule),
      value: num(dc.value),
      position: pos ?? undefined,
      relativeDistanceType: str(dc.relativeDistanceType) || undefined,
    };
  }
  if (ec && isRecord(ec.relativeDistanceCondition)) {
    const rdc = ec.relativeDistanceCondition;
    const entityRef = isRecord(rdc.entityRef) ? str(rdc.entityRef.entityRef) : str(rdc.entityRef);
    return {
      kind: 'relativeDistance',
      rule: parseRule(rdc.rule),
      value: num(rdc.value),
      targetRef: entityRef || undefined,
      relativeDistanceType: str(rdc.relativeDistanceType) || undefined,
    };
  }
  return null;
}

function parseRule(value: unknown): TriggerRule {
  return str(value) === 'lessOrEqual' ? 'lessOrEqual' : 'greaterOrEqual';
}

const TRIGGER_TYPES: readonly TriggerType[] = ['TIME', 'DISTANCE', 'NA'];
const TL_COLORS: readonly TrafficLightColor[] = ['RED', 'GREEN', 'YELLOW'];

/** 把语料字符串收敛到 TriggerType 联合；非成员回退 'NA'（避免给受控 select 喂无匹配项的值）。 */
function toTriggerType(value: unknown): TriggerType {
  const s = str(value);
  return (TRIGGER_TYPES as readonly string[]).includes(s) ? (s as TriggerType) : 'NA';
}

/** 把语料字符串收敛到 TrafficLightColor 联合；非成员回退 'RED'。 */
function toTrafficLightColor(value: unknown): TrafficLightColor {
  const s = str(value);
  return (TL_COLORS as readonly string[]).includes(s) ? (s as TrafficLightColor) : 'RED';
}

// ─── openscenario: traffic lights ───────────────────────────────────────────

function parseTrafficLightsOpenScenario(scenario: Record<string, unknown>): ScenarioTrafficLight[] {
  const rn = isRecord(scenario.roadNetwork) ? scenario.roadNetwork : {};
  const lights = Array.isArray(rn.trafficLights) ? rn.trafficLights : [];
  return lights.map((tl, tlIndex) => parseTrafficLight(tl, { kind: 'openscenario', tlIndex }));
}

// ─── classic ────────────────────────────────────────────────────────────────

function parseEgoClassic(scenario: Record<string, unknown>): ScenarioEgo {
  const start = parsePointLike(scenario.start) ?? { x: 0, y: 0 };
  const end = parsePointLike(scenario.end) ?? { x: 0, y: 0 };
  return {
    start,
    end,
    waypoints: [],
    startVelocity: typeof scenario.startVelocity === 'number' ? scenario.startVelocity : undefined,
    startAcceleration:
      typeof scenario.startAcceleration === 'number' ? scenario.startAcceleration : undefined,
  };
}

function parseObstaclesClassic(scenario: Record<string, unknown>): ScenarioObstacle[] {
  const agents = Array.isArray(scenario.agent) ? scenario.agent : [];
  const result: ScenarioObstacle[] = [];
  agents.forEach((a, agentIndex) => {
    if (!isRecord(a)) return;
    const startPos = parsePointLike(a.startPosition) ?? { x: 0, y: 0 };
    const tracked = Array.isArray(a.trackedPoint) ? a.trackedPoint : [];
    const trajectory: TrajectoryVertex[] = [];
    for (const t of tracked) {
      if (isRecord(t)) {
        trajectory.push({
          x: num(t.x),
          y: num(t.y),
          speed: typeof t.speed === 'number' ? t.speed : undefined,
        });
      }
    }
    const moving = str(a.motiontype) === 'TRACKED';
    result.push({
      uid: nanoid(),
      name: String(num(a.id)),
      apolloId: num(a.id),
      kind: classicTypeToKind(str(a.type)),
      dimensions: { length: num(a.length, 1), width: num(a.width, 1), height: num(a.height, 1) },
      position: startPos,
      initialSpeed: typeof startPos.v === 'number' ? startPos.v : num(a.startVelocity, 0),
      moving,
      trajectory,
      triggerType: toTriggerType(a.triggerType),
      triggerValue: typeof a.startDistance === 'number' ? a.startDistance : undefined,
      events: [],
      ref: { kind: 'classic', agentIndex },
    });
  });
  return result;
}

export function classicTypeToKind(type: string): ObstacleKind {
  switch (type) {
    case 'VEHICLE':
      return 'vehicle';
    case 'PEDESTRIAN':
      return 'pedestrian';
    case 'UNKNOWN_UNMOVABLE':
      return 'staticObstacle';
    case 'BICYCLE':
      return 'bicycle';
    default:
      return 'unknown';
  }
}

function parseTrafficLightsClassic(scenario: Record<string, unknown>): ScenarioTrafficLight[] {
  const lights = Array.isArray(scenario.trafficLights) ? scenario.trafficLights : [];
  return lights.map((tl, tlIndex) => parseTrafficLight(tl, { kind: 'classic', tlIndex }));
}

// ─── shared ─────────────────────────────────────────────────────────────────

function parseTrafficLight(
  tl: unknown,
  ref: { kind: 'openscenario' | 'classic'; tlIndex: number },
): ScenarioTrafficLight {
  const t = isRecord(tl) ? tl : {};
  const loc = parsePointLike(t.location) ?? { x: 0, y: 0 };
  const initial = isRecord(t.initialState) ? t.initialState : {};
  const stateGroup: TrafficLightState[] = [];
  if (Array.isArray(t.stateGroup)) {
    for (const s of t.stateGroup) {
      if (isRecord(s)) {
        stateGroup.push({
          color: toTrafficLightColor(s.color),
          keepTime: typeof s.keepTime === 'number' ? s.keepTime : undefined,
          blink: typeof s.blink === 'boolean' ? s.blink : undefined,
        });
      }
    }
  }
  return {
    uid: nanoid(),
    signalId: str(t.id),
    location: loc,
    triggerType: toTriggerType(t.triggerType),
    triggerValue: typeof t.triggerValue === 'number' ? t.triggerValue : undefined,
    initialColor: toTrafficLightColor(initial.color),
    initialBlink: typeof initial.blink === 'boolean' ? initial.blink : undefined,
    stateGroup,
    ref,
  };
}

/** 解析 {x,y,z?,heading?,h?,speed?} 形状的点。 */
function parsePointLike(value: unknown): WorldPoint | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== 'number' || typeof value.y !== 'number') return null;
  const heading = typeof value.heading === 'number' ? value.heading : undefined;
  const h = typeof value.h === 'number' ? value.h : heading;
  return {
    x: value.x,
    y: value.y,
    z: typeof value.z === 'number' ? value.z : undefined,
    h,
    v:
      typeof value.speed === 'number'
        ? value.speed
        : typeof value.v === 'number'
          ? value.v
          : undefined,
  };
}
