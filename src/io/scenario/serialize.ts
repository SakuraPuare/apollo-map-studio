import type {
  ObstacleKind,
  ScenarioDoc,
  ScenarioEgo,
  ScenarioEvent,
  ScenarioObstacle,
  ScenarioTrafficLight,
  ScenarioTrigger,
  TrajectoryVertex,
  WorldPoint,
} from '@/types/scenario';
import { deepClone, isRecord, str } from './detect';
import { patchMetaClassic, patchMetaOpenScenario } from './metaPatch';
import { classicTypeToKind, isModeledRawEvent } from './parse';

/** 归一 kind → classic `agent.type` 字面量（classicTypeToKind 的逆）。 */
const KIND_TO_CLASSIC: Record<ScenarioObstacle['kind'], string> = {
  vehicle: 'VEHICLE',
  pedestrian: 'PEDESTRIAN',
  staticObstacle: 'UNKNOWN_UNMOVABLE',
  bicycle: 'BICYCLE',
  unknown: 'UNKNOWN',
};

/**
 * 把归一化文档序列化回 Apollo scenario JSON。
 *
 * **preserve-and-patch**：以 `doc.raw` 的深拷贝为基线，**就地覆写**已存在的
 * 标量字段（不重建嵌套对象），从而：
 *   - 未编辑的文档 → 写回完全相同的值 → 与原文件深度相等（无损 round-trip）；
 *   - 已编辑的字段 → 新值写入既有结构 → 同级未建模字段（trafficFlow 等）原样保留。
 * 新建障碍物（ref===null）按 openscenario 规范结构追加。
 */
export function serializeScenario(doc: ScenarioDoc): Record<string, unknown> {
  const out = deepClone(doc.raw);
  const scenario = isRecord(out.scenario) ? out.scenario : (out.scenario = {});
  nameCounter = 0;

  if (doc.format === 'openscenario') {
    patchMetaOpenScenario(scenario, doc);
    patchEgoOpenScenario(scenario, doc.ego);
    patchObstaclesOpenScenario(scenario, doc.obstacles);
    patchTrafficLightsOpenScenario(scenario, doc.trafficLights);
  } else {
    patchMetaClassic(scenario, doc);
    patchEgoClassic(scenario, doc.ego);
    patchObstaclesClassic(scenario, doc.obstacles);
    patchTrafficLightsClassic(scenario, doc.trafficLights);
  }
  return out;
}

// ─── in-place scalar patch helpers ──────────────────────────────────────────

/** 写入数值（undefined 跳过）。用于 ego 速度/加速度等可选标量。 */
function setIfPresent(obj: Record<string, unknown>, key: string, value: number | undefined): void {
  if (value === undefined) return;
  obj[key] = value;
}

function asRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return isRecord(parent[key]) ? (parent[key] as Record<string, unknown>) : null;
}

// ─── openscenario: ego ──────────────────────────────────────────────────────

function patchEgoOpenScenario(scenario: Record<string, unknown>, ego: ScenarioEgo): void {
  const aci = asRecord(scenario, 'autoCarInfo');
  if (!aci) return;
  patchWorldXY(asRecord(aci, 'start'), ego.start, true);
  patchWorldXY(asRecord(aci, 'end'), ego.end, false);
  const rr = asRecord(aci, 'routingRequest');
  if (rr) {
    const existing = Array.isArray(rr.waypoint) ? rr.waypoint : null;
    if (existing && existing.length === ego.waypoints.length) {
      // 顶点数一致逐点就地覆写（无损）。
      existing.forEach((w, i) => {
        const wp = ego.waypoints[i];
        if (isRecord(w) && wp) patchWorldXY(asRecord(w, 'pose'), wp, false);
      });
    } else if (existing || ego.waypoints.length > 0) {
      // 数目变化或新增：重建数组（仅当原本有 waypoint 或确有航点要写，避免凭空加键）。
      rr.waypoint = ego.waypoints.map((wp) => ({ pose: { x: wp.x, y: wp.y } }));
    }
  }
  setIfPresent(aci, 'startVelocity', ego.startVelocity);
  setIfPresent(aci, 'startAcceleration', ego.startAcceleration);
}

/** 写 {x,y} 与可选 heading（ego start 用 heading 字段）。 */
function patchWorldXY(
  target: Record<string, unknown> | null,
  p: WorldPoint,
  withHeading: boolean,
): void {
  if (!target) return;
  target.x = p.x;
  target.y = p.y;
  if (withHeading && 'heading' in target && typeof p.h === 'number') target.heading = p.h;
}

// ─── openscenario: obstacles ────────────────────────────────────────────────

function patchObstaclesOpenScenario(
  scenario: Record<string, unknown>,
  obstacles: ScenarioObstacle[],
): void {
  const hasNew = obstacles.some((o) => !o.ref);
  // privateless 障碍物若被编辑出运动，需要 append private（见 needsPrivateFor）。
  const needsPrivate = obstacles.some(
    (o) => o.ref?.kind === 'openscenario' && o.ref.privateIndex === undefined && hasMotion(o),
  );
  const { objs, privates } = resolveOpenScenarioArrays(scenario, hasNew || needsPrivate);

  // 先 patch 既有项（此时 ref 索引仍有效），再按存活索引剪枝（删除回写），最后 append 新建。
  for (const ob of obstacles) {
    if (ob.ref && ob.ref.kind === 'openscenario') {
      patchOneObstacleOpenScenario(ob, objs, privates);
    }
  }
  pruneBySurvivors(
    objs,
    survivorIndices(obstacles, (o) => o.ref?.objIndex),
  );
  pruneBySurvivors(
    privates,
    survivorIndices(obstacles, (o) => o.ref?.privateIndex),
  );

  if (objs && privates) appendObstaclesOpenScenario(obstacles, objs, privates);

  const sb = asRecord(scenario, 'storyboard');
  if (sb) appendEventsOpenScenario(sb, obstacles);
  else if (obstacles.some((o) => o.events.some((e) => !e.ref))) {
    appendEventsOpenScenario((scenario.storyboard = {}) as Record<string, unknown>, obstacles);
  }
}

/** prune 之后追加：新建障碍物（obj+private），以及 private-less 但被编辑出运动的障碍物（仅 private）。 */
function appendObstaclesOpenScenario(
  obstacles: ScenarioObstacle[],
  objs: unknown[],
  privates: unknown[],
): void {
  for (const ob of obstacles) {
    if (!ob.ref) {
      // 新建障碍物：按规范结构追加。raw 不含本实体，故每次 serialize 都从克隆重新追加 → 幂等。
      objs.push(buildScenarioObject(ob));
      privates.push(buildPrivate(ob));
    } else if (
      ob.ref.kind === 'openscenario' &&
      ob.ref.privateIndex === undefined &&
      hasMotion(ob)
    ) {
      // C5：scenarioObject 存在但解析时无对应 private，且已被编辑出运动 → 追加 private（按 name 关联）。
      // 从纯净克隆每次重建 → 幂等；未编辑（无运动）的 privateless 障碍物不追加，保 round-trip 无损。
      privates.push(buildPrivate(ob));
    }
  }
}

/** 障碍物是否有非平凡运动（用于判断 privateless 障碍物是否被编辑过 → 需 append private）。 */
function hasMotion(ob: ScenarioObstacle): boolean {
  return (
    ob.position.x !== 0 || ob.position.y !== 0 || ob.initialSpeed !== 0 || ob.trajectory.length > 0
  );
}

/** 收集存活的原始数组索引（来自带 ref 的实体）。 */
function survivorIndices<T>(items: T[], pick: (t: T) => number | undefined): Set<number> {
  const set = new Set<number>();
  for (const it of items) {
    const i = pick(it);
    if (typeof i === 'number') set.add(i);
  }
  return set;
}

/**
 * 按存活索引就地剪枝数组：丢弃原始范围内未被任何存活实体引用的项（= 已删除的实体），
 * 保留顺序与 append 段（索引 ≥ 调用时长度的新项不在此函数职责内，调用顺序保证 append 在剪枝后）。
 * 无删除时存活集含全部索引 → 原样保留（保 round-trip 无损）。
 */
function pruneBySurvivors(arr: unknown[] | null, survivors: Set<number>): void {
  if (!arr) return;
  const kept = arr.filter((_, i) => survivors.has(i));
  if (kept.length !== arr.length) arr.splice(0, arr.length, ...kept);
}

/**
 * 解析 openscenario 的 scenarioObjects / privates 数组。
 * patch 路径只读导航既有数组（不存在则 null，不补键）；append 路径（hasNew）
 * 才补建 entities/storyboard.init.actions 链路 + 数组，保证只在新增实体时改结构。
 */
function resolveOpenScenarioArrays(
  scenario: Record<string, unknown>,
  hasNew: boolean,
): { objs: unknown[] | null; privates: unknown[] | null } {
  let entities = asRecord(scenario, 'entities');
  let objs = entities && Array.isArray(entities.scenarioObjects) ? entities.scenarioObjects : null;
  const sb = asRecord(scenario, 'storyboard');
  let actions = sb && asRecord(asRecord(sb, 'init') ?? {}, 'actions');
  let privates = actions && Array.isArray(actions.privates) ? actions.privates : null;

  if (hasNew) {
    entities = entities ?? (scenario.entities = {});
    objs = ensureArray(entities, 'scenarioObjects');
    const sbR = sb ?? (scenario.storyboard = {});
    const init = asRecord(sbR, 'init') ?? (sbR.init = {});
    actions = asRecord(init, 'actions') ?? (init.actions = {});
    privates = ensureArray(actions, 'privates');
  }
  return { objs, privates };
}

/** 取/建一个数组属性。 */
function ensureArray(parent: Record<string, unknown>, key: string): unknown[] {
  if (!Array.isArray(parent[key])) parent[key] = [];
  return parent[key] as unknown[];
}

/** openscenario kind → entityObject 子树。 */
function buildEntityObject(ob: ScenarioObstacle): Record<string, unknown> {
  const bb = {
    boundingBox: {
      dimensions: {
        length: ob.dimensions.length,
        width: ob.dimensions.width,
        height: ob.dimensions.height,
      },
    },
  };
  if (ob.kind === 'vehicle' || ob.kind === 'bicycle') {
    return { vehicle: { vehicleCategory: ob.kind === 'bicycle' ? 'bicycle' : 'car', ...bb } };
  }
  if (ob.kind === 'pedestrian') {
    return { pedestrian: { pedestrianCategory: 'pedestrian', ...bb } };
  }
  return { unknownUnmovableObject: { ...bb } };
}

function buildScenarioObject(ob: ScenarioObstacle): Record<string, unknown> {
  return { name: ob.name, id: ob.apolloId, entityObject: buildEntityObject(ob) };
}

/** 既有 entityObject 当前对应的归一 kind（parseEntityObject 的逆，用于判断是否变更）。 */
function entityObjectKind(eo: Record<string, unknown>): ObstacleKind {
  if (isRecord(eo.vehicle)) {
    return str(eo.vehicle.vehicleCategory) === 'bicycle' ? 'bicycle' : 'vehicle';
  }
  if (isRecord(eo.pedestrian)) return 'pedestrian';
  if (isRecord(eo.unknownUnmovableObject)) return 'staticObstacle';
  return 'unknown';
}

/** 新障碍物的 init.privates 条目：teleport + speed (+ routing 若有轨迹)。 */
function buildPrivate(ob: ScenarioObstacle): Record<string, unknown> {
  const wp: Record<string, unknown> = { x: ob.position.x, y: ob.position.y };
  if (typeof ob.position.h === 'number') wp.h = ob.position.h;
  const privateActions: Record<string, unknown>[] = [
    { teleportAction: { position: { worldPosition: wp } } },
    {
      longitudinalAction: {
        speedAction: {
          speedActionDynamics: { dynamicsDimension: 'distance', dynamicsShape: 'linear', value: 0 },
          speedActionTarget: { absoluteTargetSpeed: { value: ob.initialSpeed } },
        },
      },
    },
  ];
  if (ob.trajectory.length > 1) {
    privateActions.push(buildRoutingAction(ob.trajectory));
  }
  return { entityRef: { entityRef: ob.name }, privateActions };
}

function buildRoutingAction(trajectory: TrajectoryVertex[]): Record<string, unknown> {
  return {
    routingAction: {
      followTrajectoryAction: {
        trajectoryRef: {
          trajectory: { shape: { polyline: { vertices: trajectory.map(buildVertex) } } },
        },
      },
    },
  };
}

// ─── openscenario: 动态事件 (storyboard.stories) ─────────────────────────────

/** 回写事件：已有 ref 的就地 patch；剪除被删除的建模事件；新事件 append 到对应 actor。 */
function appendEventsOpenScenario(
  sb: Record<string, unknown>,
  obstacles: ScenarioObstacle[],
): void {
  // 已有 stories 才 patch/prune；仅当有新事件时才创建 stories（避免给原本无 stories 的文件凭空加键）。
  const existingStories = Array.isArray(sb.stories) ? sb.stories : null;
  if (existingStories) {
    for (const ob of obstacles) {
      for (const ev of ob.events) {
        if (ev.ref) patchExistingEvent(existingStories, ev, ob.name);
      }
    }
    pruneStoryEvents(existingStories, survivorEventKeys(obstacles));
  }
  for (const ob of obstacles) {
    for (const ev of ob.events) {
      if (!ev.ref) appendNewEvent(ensureArray(sb, 'stories'), ob.name, ev);
    }
  }
}

/** 存活事件的来源路径键集合（删除障碍物 / removeEvent 后，其建模事件不再出现于此集 → 被剪除）。 */
function survivorEventKeys(obstacles: ScenarioObstacle[]): Set<string> {
  const set = new Set<string>();
  for (const ob of obstacles) {
    for (const ev of ob.events) {
      const r = ev.ref;
      if (r) set.add(`${r.storyIndex}/${r.actIndex}/${r.mgIndex}/${r.manIndex}/${r.eventIndex}`);
    }
  }
  return set;
}

/**
 * 剪除已删除的建模事件：遍历 stories 的每个 maneuver.events，丢弃“原本被建模(isModeledRawEvent)
 * 但已不在存活集”的项；不可识别的事件一律保留（保 round-trip 无损）。无删除时存活集含全部建模事件 → 原样保留。
 */
function pruneStoryEvents(stories: unknown[], survivors: Set<string>): void {
  stories.forEach((story, storyIndex) => {
    if (!isRecord(story) || !Array.isArray(story.acts)) return;
    story.acts.forEach((act, actIndex) => {
      if (!isRecord(act) || !Array.isArray(act.maneuverGroups)) return;
      act.maneuverGroups.forEach((mg, mgIndex) => {
        if (!isRecord(mg) || !Array.isArray(mg.maneuvers)) return;
        mg.maneuvers.forEach((man, manIndex) => {
          if (!isRecord(man) || !Array.isArray(man.events)) return;
          const kept = man.events.filter((ev, eventIndex) => {
            if (!isModeledRawEvent(ev)) return true; // 未建模 → 保留
            return survivors.has(`${storyIndex}/${actIndex}/${mgIndex}/${manIndex}/${eventIndex}`);
          });
          if (kept.length !== man.events.length) man.events = kept;
        });
      });
    });
  });
}

function patchExistingEvent(stories: unknown[], ev: ScenarioEvent, actorName: string): void {
  const r = ev.ref!;
  const story = stories[r.storyIndex];
  const act = nthRecord(story, 'acts', r.actIndex);
  const mg = nthRecord(act, 'maneuverGroups', r.mgIndex);
  const man = nthRecord(mg, 'maneuvers', r.manIndex);
  const rawEv = man && Array.isArray(man.events) ? man.events[r.eventIndex] : undefined;
  if (isRecord(rawEv)) writeEventInto(rawEv, ev, actorName);
}

/** 取 record.key[i] 若为对象。 */
function nthRecord(parent: unknown, key: string, i: number): Record<string, unknown> | undefined {
  if (!isRecord(parent) || !Array.isArray(parent[key])) return undefined;
  const v = parent[key][i];
  return isRecord(v) ? v : undefined;
}

/** 把建模过的事件值就地写进既有 raw 事件（只覆写标量叶子，保留同级未建模字段与键序）。 */
function writeEventInto(
  rawEv: Record<string, unknown>,
  ev: ScenarioEvent,
  actorName: string,
): void {
  const actions = Array.isArray(rawEv.actions) ? rawEv.actions : [];
  let first = actions.find(isRecord);
  if (!first) {
    first = { name: cryptoName() };
    rawEv.actions = [first];
  }
  const pa = asRecord(first, 'privateAction');
  if (pa && eventActionMatches(pa, ev.action.kind)) {
    patchEventActionInto(pa, ev);
  } else {
    first.privateAction = buildEventAction(ev);
  }
  if (ev.trigger) {
    const trig = asRecord(rawEv, 'startTrigger');
    if (trig) writeTriggerInto(trig, ev, actorName);
    else rawEv.startTrigger = buildStartTrigger(actorName, ev.trigger);
  } else {
    delete rawEv.startTrigger;
  }
}

/** 就地覆写 speed/laneChange 的标量叶子。 */
function patchEventActionInto(pa: Record<string, unknown>, ev: ScenarioEvent): void {
  if (ev.action.kind === 'speed') {
    delete pa.lateralAction;
    const longitudinalAction = asRecord(pa, 'longitudinalAction') ?? (pa.longitudinalAction = {});
    const sa =
      asRecord(longitudinalAction, 'speedAction') ??
      (longitudinalAction.speedAction = {
        speedActionDynamics: {},
        speedActionTarget: { absoluteTargetSpeed: {} },
      });
    const dyn = asRecord(sa, 'speedActionDynamics');
    const dynamics = dyn ?? (sa.speedActionDynamics = {});
    dynamics.dynamicsDimension = ev.action.dynamicsDimension;
    dynamics.dynamicsShape = ev.action.dynamicsShape;
    dynamics.value = ev.action.dynamicsValue;
    const target = asRecord(sa, 'speedActionTarget') ?? (sa.speedActionTarget = {});
    const abs = asRecord(target, 'absoluteTargetSpeed') ?? (target.absoluteTargetSpeed = {});
    abs.value = ev.action.targetSpeed;
  } else {
    delete pa.longitudinalAction;
    const lateralAction = asRecord(pa, 'lateralAction') ?? (pa.lateralAction = {});
    const lca =
      asRecord(lateralAction, 'laneChangeAction') ??
      (lateralAction.laneChangeAction = {
        laneChangeActionDynamics: {},
        laneChangeTarget: { relativeTargetLane: {} },
      });
    const dyn = asRecord(lca, 'laneChangeActionDynamics') ?? (lca.laneChangeActionDynamics = {});
    dyn.dynamicsDimension = ev.action.dynamicsDimension;
    dyn.dynamicsShape = 'linear';
    dyn.value = ev.action.dynamicsValue;
    const target = asRecord(lca, 'laneChangeTarget') ?? (lca.laneChangeTarget = {});
    const rel = asRecord(target, 'relativeTargetLane') ?? (target.relativeTargetLane = {});
    if (ev.action.targetRef) rel.entityRef = { entityRef: ev.action.targetRef };
    else delete rel.entityRef;
    rel.value = ev.action.relativeTargetLane;
  }
}

function eventActionMatches(
  pa: Record<string, unknown>,
  kind: ScenarioEvent['action']['kind'],
): boolean {
  if (kind === 'speed') {
    return Boolean(asRecord(asRecord(pa, 'longitudinalAction') ?? {}, 'speedAction'));
  }
  return Boolean(asRecord(asRecord(pa, 'lateralAction') ?? {}, 'laneChangeAction'));
}

/** 把触发值就地写进既有 startTrigger 的首个条件（只覆写 value/rule/position 标量）。 */
function writeTriggerInto(
  trig: Record<string, unknown>,
  ev: ScenarioEvent,
  actorName: string,
): void {
  const trigger = ev.trigger!;
  const groups = Array.isArray(trig.conditionGroups) ? trig.conditionGroups : null;
  if (!groups) {
    trig.conditionGroups = [{ conditions: [buildTriggerCondition(actorName, trigger)] }];
    return;
  }
  let g0 = groups.find(isRecord);
  if (!g0) {
    g0 = { conditions: [buildTriggerCondition(actorName, trigger)] };
    groups.push(g0);
    return;
  }
  const conds = Array.isArray(g0.conditions) ? g0.conditions : null;
  if (!conds) {
    g0.conditions = [buildTriggerCondition(actorName, trigger)];
    return;
  }
  const c0 = conds.find(isRecord);
  if (!c0) {
    conds.push(buildTriggerCondition(actorName, trigger));
  } else if (conditionMatchesTrigger(c0, trigger.kind)) {
    patchConditionInto(c0, trigger);
  } else {
    replaceConditionInto(c0, actorName, trigger);
  }
}

function patchConditionInto(c0: Record<string, unknown>, trigger: ScenarioTrigger): void {
  if (trigger.kind === 'simulationTime') {
    const st = asRecord(asRecord(c0, 'byValueCondition') ?? {}, 'simulationTimeCondition');
    if (st) {
      st.rule = trigger.rule;
      st.value = trigger.value;
    }
    return;
  }
  const ec = asRecord(asRecord(c0, 'byEntityCondition') ?? {}, 'entityCondition');
  if (!ec) return;
  const dc =
    trigger.kind === 'distance'
      ? asRecord(ec, 'distanceCondition')
      : asRecord(ec, 'relativeDistanceCondition');
  if (!dc) return;
  dc.rule = trigger.rule;
  dc.value = trigger.value;
  if (trigger.kind === 'distance') {
    delete dc.entityRef;
    if (trigger.position) {
      const pos = asRecord(dc, 'position') ?? (dc.position = {});
      const wp = asRecord(pos, 'worldPosition') ?? (pos.worldPosition = {});
      wp.x = trigger.position.x;
      wp.y = trigger.position.y;
    } else {
      delete dc.position;
    }
  }
  if (trigger.relativeDistanceType) {
    dc.relativeDistanceType = trigger.relativeDistanceType;
  } else {
    delete dc.relativeDistanceType;
  }
  if (trigger.kind === 'relativeDistance') {
    delete dc.position;
    if (trigger.targetRef) dc.entityRef = { entityRef: trigger.targetRef };
    else delete dc.entityRef;
  }
}

function conditionMatchesTrigger(
  c0: Record<string, unknown>,
  kind: ScenarioTrigger['kind'],
): boolean {
  if (kind === 'simulationTime') {
    return Boolean(asRecord(asRecord(c0, 'byValueCondition') ?? {}, 'simulationTimeCondition'));
  }
  const ec = asRecord(asRecord(c0, 'byEntityCondition') ?? {}, 'entityCondition');
  return kind === 'distance'
    ? Boolean(ec && asRecord(ec, 'distanceCondition'))
    : Boolean(ec && asRecord(ec, 'relativeDistanceCondition'));
}

function replaceConditionInto(
  c0: Record<string, unknown>,
  actorName: string,
  trigger: ScenarioTrigger,
): void {
  delete c0.byValueCondition;
  delete c0.byEntityCondition;
  Object.assign(c0, buildConditionWithEntities(actorName, trigger));
}

function buildStartTrigger(
  actorName: string,
  trigger: NonNullable<ScenarioEvent['trigger']>,
): Record<string, unknown> {
  return {
    conditionGroups: [
      {
        conditions: [buildTriggerCondition(actorName, trigger)],
      },
    ],
  };
}

function buildTriggerCondition(
  actorName: string,
  trigger: NonNullable<ScenarioEvent['trigger']>,
): Record<string, unknown> {
  return {
    conditionEdge: 'none',
    ...buildConditionWithEntities(actorName, trigger),
  };
}

function appendNewEvent(stories: unknown[], actorName: string, ev: ScenarioEvent): void {
  const mg = findOrCreateManeuverGroup(stories, actorName);
  const maneuvers = ensureArray(mg, 'maneuvers');
  let man = maneuvers.find(isRecord);
  if (!man) {
    man = { events: [] };
    maneuvers.push(man);
  }
  ensureArray(man, 'events').push(buildEvent(actorName, ev));
}

/** 找到 actor 匹配的 maneuverGroup，没有则建一条完整 story→act→mg 链。 */
function findOrCreateManeuverGroup(stories: unknown[], actorName: string): Record<string, unknown> {
  for (const story of stories) {
    if (!isRecord(story) || !Array.isArray(story.acts)) continue;
    for (const act of story.acts) {
      if (!isRecord(act) || !Array.isArray(act.maneuverGroups)) continue;
      for (const mg of act.maneuverGroups) {
        if (isRecord(mg) && mgActorMatches(mg, actorName)) return mg;
      }
    }
  }
  const mg: Record<string, unknown> = {
    actors: { entityRefs: [{ entityRef: actorName }] },
    maneuvers: [],
  };
  stories.push({ acts: [{ maneuverGroups: [mg] }] });
  return mg;
}

function mgActorMatches(mg: Record<string, unknown>, actorName: string): boolean {
  const actors = asRecord(mg, 'actors');
  const refs = actors && Array.isArray(actors.entityRefs) ? actors.entityRefs : [];
  return refs.some((r) => isRecord(r) && r.entityRef === actorName);
}

function buildEvent(actorName: string, ev: ScenarioEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: ev.name || cryptoName(),
    actions: [{ name: cryptoName(), privateAction: buildEventAction(ev) }],
  };
  if (ev.trigger) {
    out.startTrigger = buildStartTrigger(actorName, ev.trigger);
  }
  return out;
}

/** byEntityCondition 需要 triggeringEntities（指向自身 actor）；simulationTime 不需要。 */
function buildConditionWithEntities(
  actorName: string,
  trigger: NonNullable<ScenarioEvent['trigger']>,
): Record<string, unknown> {
  const cond = buildCondition(trigger);
  if (trigger.kind === 'simulationTime') return cond;
  const byEntity = cond.byEntityCondition as Record<string, unknown>;
  return {
    byEntityCondition: {
      triggeringEntities: {
        triggeringEntitiesRule: 'any',
        entityRefs: [{ entityRef: actorName }],
      },
      ...byEntity,
    },
  };
}

function buildEventAction(ev: ScenarioEvent): Record<string, unknown> {
  if (ev.action.kind === 'speed') {
    return {
      longitudinalAction: {
        speedAction: {
          speedActionDynamics: {
            dynamicsDimension: ev.action.dynamicsDimension,
            dynamicsShape: 'linear',
            value: ev.action.dynamicsValue,
          },
          speedActionTarget: { absoluteTargetSpeed: { value: ev.action.targetSpeed } },
        },
      },
    };
  }
  const lc = ev.action;
  return {
    lateralAction: {
      laneChangeAction: {
        laneChangeActionDynamics: {
          dynamicsDimension: lc.dynamicsDimension,
          dynamicsShape: 'linear',
          value: lc.dynamicsValue,
        },
        laneChangeTarget: {
          relativeTargetLane: {
            ...(lc.targetRef ? { entityRef: { entityRef: lc.targetRef } } : {}),
            value: lc.relativeTargetLane,
          },
        },
      },
    },
  };
}

function buildCondition(trigger: NonNullable<ScenarioEvent['trigger']>): Record<string, unknown> {
  if (trigger.kind === 'simulationTime') {
    return {
      byValueCondition: {
        simulationTimeCondition: { rule: trigger.rule, value: trigger.value },
      },
    };
  }
  if (trigger.kind === 'distance') {
    const dc: Record<string, unknown> = { rule: trigger.rule, value: trigger.value };
    if (trigger.position) {
      dc.position = { worldPosition: { x: trigger.position.x, y: trigger.position.y } };
    }
    if (trigger.relativeDistanceType) dc.relativeDistanceType = trigger.relativeDistanceType;
    return { byEntityCondition: { entityCondition: { distanceCondition: dc } } };
  }
  const rdc: Record<string, unknown> = { rule: trigger.rule, value: trigger.value };
  if (trigger.targetRef) rdc.entityRef = { entityRef: trigger.targetRef };
  if (trigger.relativeDistanceType) rdc.relativeDistanceType = trigger.relativeDistanceType;
  return { byEntityCondition: { entityCondition: { relativeDistanceCondition: rdc } } };
}

let nameCounter = 0;
function cryptoName(): string {
  // 稳定可复现的事件/动作名（不依赖随机，便于测试与 diff）。
  return `evt-${(nameCounter++).toString(36)}`;
}

function patchOneObstacleOpenScenario(
  ob: ScenarioObstacle,
  objs: unknown[] | null,
  privates: unknown[] | null,
): void {
  const ref = ob.ref!;
  if (objs && ref.objIndex !== undefined) {
    const obj = objs[ref.objIndex];
    if (isRecord(obj)) patchScenarioObject(obj, ob);
  }
  if (privates && ref.privateIndex !== undefined) {
    const priv = privates[ref.privateIndex];
    if (isRecord(priv)) patchPrivateMotion(priv, ob);
  }
}

/** 回写 scenarioObject 的 name/id、kind（变更时重建 entityObject 子树）与尺寸。 */
function patchScenarioObject(obj: Record<string, unknown>, ob: ScenarioObstacle): void {
  if ('name' in obj || ob.name) obj.name = ob.name;
  if ('id' in obj) obj.id = ob.apolloId;
  const eo = asRecord(obj, 'entityObject');
  if (!eo) {
    obj.entityObject = buildEntityObject(ob);
    return;
  }
  // kind 变了：重建 entityObject 持有者子树（与 classic 的 type 重写对称）。
  if (entityObjectKind(eo) !== ob.kind) {
    obj.entityObject = buildEntityObject(ob);
    return;
  }
  patchEntityObjectDims(eo, ob);
}

function patchEntityObjectDims(eo: Record<string, unknown>, ob: ScenarioObstacle): void {
  const holder =
    asRecord(eo, 'vehicle') ?? asRecord(eo, 'pedestrian') ?? asRecord(eo, 'unknownUnmovableObject');
  const bb = holder && asRecord(holder, 'boundingBox');
  const dims = bb && asRecord(bb, 'dimensions');
  if (!dims) return;
  dims.length = ob.dimensions.length;
  dims.width = ob.dimensions.width;
  dims.height = ob.dimensions.height;
}

function patchPrivateMotion(priv: Record<string, unknown>, ob: ScenarioObstacle): void {
  const actions = Array.isArray(priv.privateActions) ? priv.privateActions : [];
  let hasRoutingAction = false;
  for (const a of actions) {
    if (!isRecord(a)) continue;
    if (isRecord(a.teleportAction)) patchWorldPosition(a.teleportAction, ob.position);
    if (isRecord(a.longitudinalAction)) patchSpeedAction(a.longitudinalAction, ob.initialSpeed);
    if (isRecord(a.routingAction)) {
      hasRoutingAction = true;
      patchTrajectory(a.routingAction, ob.trajectory);
    }
  }
  if (!hasRoutingAction && ob.trajectory.length > 1) {
    ensureArray(priv, 'privateActions').push(buildRoutingAction(ob.trajectory));
  }
}

function patchWorldPosition(teleportAction: Record<string, unknown>, p: WorldPoint): void {
  const pos = asRecord(teleportAction, 'position');
  const wp = pos && asRecord(pos, 'worldPosition');
  if (!wp) return;
  wp.x = p.x;
  wp.y = p.y;
  if ('h' in wp && typeof p.h === 'number') wp.h = p.h;
}

function patchSpeedAction(longitudinalAction: Record<string, unknown>, speed: number): void {
  const sa = asRecord(longitudinalAction, 'speedAction');
  const tgt = sa && asRecord(sa, 'speedActionTarget');
  const abs = tgt && asRecord(tgt, 'absoluteTargetSpeed');
  if (abs && 'value' in abs) abs.value = speed;
}

function patchTrajectory(routingAction: Record<string, unknown>, traj: TrajectoryVertex[]): void {
  const fta = asRecord(routingAction, 'followTrajectoryAction');
  const tr = fta && asRecord(fta, 'trajectoryRef');
  const trajectory = tr && asRecord(tr, 'trajectory');
  const shape = trajectory && asRecord(trajectory, 'shape');
  const poly = shape && asRecord(shape, 'polyline');
  if (!poly || !Array.isArray(poly.vertices)) return;
  // 仅当顶点数一致时逐点就地覆写（保证无损）；数目变化走 rebuild 分支。
  if (poly.vertices.length === traj.length) {
    poly.vertices.forEach((v, i) => {
      const tv = traj[i]!;
      if (isRecord(v)) patchWorldPosition(v, { x: tv.x, y: tv.y, h: tv.h });
    });
  } else {
    poly.vertices = traj.map((tv) => buildVertex(tv));
  }
}

function buildVertex(tv: TrajectoryVertex): Record<string, unknown> {
  const wp: Record<string, unknown> = { x: tv.x, y: tv.y };
  if (typeof tv.h === 'number') wp.h = tv.h;
  return { position: { worldPosition: wp } };
}

// ─── openscenario: traffic lights ───────────────────────────────────────────

function patchTrafficLightsOpenScenario(
  scenario: Record<string, unknown>,
  lights: ScenarioTrafficLight[],
): void {
  const rn = asRecord(scenario, 'roadNetwork');
  patchTrafficLightList(rn, scenario, 'roadNetwork', lights);
}

// ─── classic ────────────────────────────────────────────────────────────────

function patchEgoClassic(scenario: Record<string, unknown>, ego: ScenarioEgo): void {
  patchWorldXY(asRecord(scenario, 'start'), ego.start, true);
  patchWorldXY(asRecord(scenario, 'end'), ego.end, false);
  setIfPresent(scenario, 'startVelocity', ego.startVelocity);
  setIfPresent(scenario, 'startAcceleration', ego.startAcceleration);
}

function patchObstaclesClassic(
  scenario: Record<string, unknown>,
  obstacles: ScenarioObstacle[],
): void {
  const hasNew = obstacles.some((o) => !o.ref);
  const agents = Array.isArray(scenario.agent)
    ? scenario.agent
    : hasNew
      ? ensureArray(scenario, 'agent')
      : null;
  if (!agents) return;
  // 先 patch 既有 → 剪枝删除项 → append 新建（与 openscenario 对称）。
  for (const ob of obstacles) {
    if (ob.ref && ob.ref.kind === 'classic' && ob.ref.agentIndex !== undefined) {
      const a = agents[ob.ref.agentIndex];
      if (isRecord(a)) patchOneAgentClassic(a, ob);
    }
  }
  pruneBySurvivors(
    agents,
    survivorIndices(obstacles, (o) => o.ref?.agentIndex),
  );
  for (const ob of obstacles) {
    if (!ob.ref) agents.push(buildAgentClassic(ob));
  }
}

function patchOneAgentClassic(a: Record<string, unknown>, ob: ScenarioObstacle): void {
  a.length = ob.dimensions.length;
  a.width = ob.dimensions.width;
  a.height = ob.dimensions.height;
  // 仅当 kind 实际被改动时才覆写 type，否则保留原字面量（含未识别变体）以维持无损 round-trip。
  if ('type' in a && classicTypeToKind(typeof a.type === 'string' ? a.type : '') !== ob.kind) {
    a.type = KIND_TO_CLASSIC[ob.kind];
  }
  const sp = asRecord(a, 'startPosition');
  if (sp) {
    sp.x = ob.position.x;
    sp.y = ob.position.y;
    if ('heading' in sp && typeof ob.position.h === 'number') sp.heading = ob.position.h;
    if ('speed' in sp) sp.speed = ob.initialSpeed;
  }
  if ('triggerType' in a) a.triggerType = ob.triggerType;
  if ('startDistance' in a) {
    if (ob.triggerValue === undefined) delete a.startDistance;
    else a.startDistance = ob.triggerValue;
  }
  patchClassicTrackedPoints(a, ob.trajectory);
}

/** 新建 classic agent。 */
function buildAgentClassic(ob: ScenarioObstacle): Record<string, unknown> {
  const moving = ob.trajectory.length > 1;
  const agent: Record<string, unknown> = {
    id: ob.apolloId,
    width: ob.dimensions.width,
    length: ob.dimensions.length,
    height: ob.dimensions.height,
    type: KIND_TO_CLASSIC[ob.kind],
    motiontype: moving ? 'TRACKED' : 'STATIC',
    startPosition: {
      x: ob.position.x,
      y: ob.position.y,
      heading: ob.position.h ?? 0,
      speed: ob.initialSpeed,
    },
    startVelocity: ob.initialSpeed,
    triggerType: ob.triggerType,
  };
  if (ob.triggerValue !== undefined) agent.startDistance = ob.triggerValue;
  if (moving) {
    agent.trackedPoint = ob.trajectory.map((tv) => ({
      x: tv.x,
      y: tv.y,
      ...(tv.speed !== undefined ? { speed: tv.speed } : {}),
    }));
  }
  return agent;
}

/** classic `trackedPoint`：顶点数一致逐点覆写，否则按 {x,y,speed?} 重建（与 openscenario 对称）。 */
function patchClassicTrackedPoints(a: Record<string, unknown>, traj: TrajectoryVertex[]): void {
  if (!Array.isArray(a.trackedPoint)) return;
  if (a.trackedPoint.length === traj.length) {
    a.trackedPoint.forEach((t, i) => {
      const tv = traj[i]!;
      if (isRecord(t)) {
        t.x = tv.x;
        t.y = tv.y;
        if ('speed' in t && typeof tv.speed === 'number') t.speed = tv.speed;
      }
    });
  } else {
    a.trackedPoint = traj.map((tv) => ({
      x: tv.x,
      y: tv.y,
      ...(tv.speed !== undefined ? { speed: tv.speed } : {}),
    }));
  }
}

function patchTrafficLightsClassic(
  scenario: Record<string, unknown>,
  lights: ScenarioTrafficLight[],
): void {
  patchTrafficLightList(scenario, scenario, '', lights);
}

// ─── shared ─────────────────────────────────────────────────────────────────

/**
 * 红绿灯回写：在 `holder.trafficLights[]` 上 patch 已有项；仅当存在新灯(ref===null)
 * 时才创建数组并 append（避免给原本无此键的文件凭空加键，保 round-trip 无损）。
 * @param holder 持有 trafficLights 数组的对象（openscenario=roadNetwork，classic=scenario）
 * @param holderParent holder 的父级（用于 holder 不存在时补建）
 * @param holderKey holder 在 parent 中的键（''=holder 即 parent）
 */
function patchTrafficLightList(
  holder: Record<string, unknown> | null,
  holderParent: Record<string, unknown>,
  holderKey: string,
  lights: ScenarioTrafficLight[],
): void {
  const existing = holder && Array.isArray(holder.trafficLights) ? holder.trafficLights : null;
  const hasNew = lights.some((l) => !l.ref);
  if (existing) {
    // 先 patch 既有 → 按存活索引剪枝（删除回写），保留顺序。
    for (const tl of lights) {
      if (tl.ref) {
        const raw = existing[tl.ref.tlIndex];
        if (isRecord(raw)) patchOneTrafficLight(raw, tl);
      }
    }
    pruneBySurvivors(
      existing,
      survivorIndices(lights, (l) => l.ref?.tlIndex),
    );
  }
  if (!hasNew) return;
  // 需要 append：确保 holder 与数组存在。
  let h = holder;
  if (!h) h = holderKey ? (holderParent[holderKey] = {}) : holderParent;
  const arr = ensureArray(h, 'trafficLights');
  for (const tl of lights) {
    if (!tl.ref) arr.push(buildTrafficLight(tl));
  }
}

function patchOneTrafficLight(raw: Record<string, unknown>, tl: ScenarioTrafficLight): void {
  // 仅当原本有 id 键或确有非空 signalId 时写入，避免给原本无此键的灯凭空加键（保 round-trip）。
  if ('id' in raw || tl.signalId) raw.id = tl.signalId;
  // triggerType：原本有键则就地覆写（含 'NA'，保留原结构）；原本无键仅在非 'NA' 时才新增。
  if ('triggerType' in raw) raw.triggerType = tl.triggerType;
  else if (tl.triggerType !== 'NA') raw.triggerType = tl.triggerType;
  const loc = asRecord(raw, 'location');
  if (loc) {
    loc.x = tl.location.x;
    loc.y = tl.location.y;
  }
  const initial = asRecord(raw, 'initialState');
  if (initial) {
    if ('color' in initial) initial.color = tl.initialColor;
    if (tl.initialBlink !== undefined) initial.blink = tl.initialBlink;
  }
  if (tl.triggerValue !== undefined) raw.triggerValue = tl.triggerValue;
  else delete raw.triggerValue;
  if (Array.isArray(raw.stateGroup) && raw.stateGroup.length === tl.stateGroup.length) {
    raw.stateGroup.forEach((s, i) => {
      const st = tl.stateGroup[i]!;
      if (isRecord(s)) {
        s.color = st.color;
        if ('keepTime' in s && typeof st.keepTime === 'number') s.keepTime = st.keepTime;
      }
    });
  } else if (Array.isArray(raw.stateGroup)) {
    raw.stateGroup = tl.stateGroup.map(buildState);
  } else if (tl.stateGroup.length > 0) {
    raw.stateGroup = tl.stateGroup.map(buildState);
  }
}

function buildTrafficLight(tl: ScenarioTrafficLight): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: tl.signalId,
    location: { x: tl.location.x, y: tl.location.y },
    initialState: {
      color: tl.initialColor,
      ...(tl.initialBlink !== undefined ? { blink: tl.initialBlink } : {}),
    },
    stateGroup: tl.stateGroup.map(buildState),
  };
  if (tl.triggerType !== 'NA') out.triggerType = tl.triggerType;
  if (tl.triggerValue !== undefined) out.triggerValue = tl.triggerValue;
  return out;
}

function buildState(st: ScenarioTrafficLight['stateGroup'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = { color: st.color };
  if (st.keepTime !== undefined) out.keepTime = st.keepTime;
  if (st.blink !== undefined) out.blink = st.blink;
  return out;
}
