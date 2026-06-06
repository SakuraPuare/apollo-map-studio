import type {
  ScenarioDoc,
  ScenarioObstacle,
  ScenarioTrafficLight,
  TrafficLightColor,
  TrajectoryVertex,
  WorldPoint,
} from '@/types/scenario';

/**
 * 场景时间采样器（纯函数，无副作用，便于单测）。
 *
 * 给定一份场景文档与仿真时刻 `t`（秒），算出每个动态实体在该时刻的姿态：
 *   - 障碍物：沿 trajectory 按速度积分求弧长位置 + 朝向（段方向）。
 *   - 红绿灯：按 stateGroup 的 keepTime 累加求当前色（循环）。
 *   - ego：沿 start→waypoints→end 在 simulatorTime 内匀速推进。
 *
 * **速度来源（见 [[apollo-scenario-format]]）**：
 *   - classic：trajectory 顶点逐点带 speed → 逐段按平均速度求段时长，精确。
 *   - openscenario：顶点无 speed → 用 initialSpeed 匀速，叠加 speedAction 事件
 *     （simulationTime 触发）构造分段速度剖面，再积分。
 *
 * 设计为「派生姿态」而非「改 doc」：返回轻量 PosedScenario，渲染层据此打补丁，
 * 绝不污染 ScenarioDoc.raw 的 round-trip 保真度。
 */

/** 某障碍物在某时刻的姿态。 */
export interface ObstaclePose {
  uid: string;
  position: WorldPoint;
}

/** 某红绿灯在某时刻的颜色。 */
export interface TrafficLightPose {
  uid: string;
  color: TrafficLightColor;
  blink: boolean;
}

/** ego 在某时刻的姿态。 */
export interface EgoPose {
  position: WorldPoint;
}

/** 整份场景在某时刻的派生姿态。 */
export interface PosedScenario {
  obstacles: ObstaclePose[];
  trafficLights: TrafficLightPose[];
  ego: EgoPose | null;
}

/** 默认仿真时长（秒），当 meta.simulatorTime 缺省时兜底。 */
export const DEFAULT_SIM_DURATION = 30;

/**
 * 场景仿真总时长（秒）。优先 meta.simulatorTime；否则取所有实体运动结束时刻的最大值；
 * 仍无则 DEFAULT_SIM_DURATION。
 */
export function scenarioDuration(doc: ScenarioDoc): number {
  if (typeof doc.meta.simulatorTime === 'number' && doc.meta.simulatorTime > 0) {
    return doc.meta.simulatorTime;
  }
  let max = 0;
  for (const ob of doc.obstacles) {
    const prof = obstacleProfile(ob);
    if (prof) max = Math.max(max, prof.startTime + prof.totalTime);
  }
  for (const tl of doc.trafficLights) {
    const cycle = trafficLightCycle(tl);
    if (cycle > 0) max = Math.max(max, cycle);
  }
  return max > 0 ? Math.ceil(max) : DEFAULT_SIM_DURATION;
}

/** 在时刻 t 采样整份场景。 */
export function sampleScenarioAt(doc: ScenarioDoc, t: number): PosedScenario {
  return {
    obstacles: doc.obstacles.map((ob) => sampleObstacle(ob, t)),
    trafficLights: doc.trafficLights.map((tl) => sampleTrafficLight(tl, t)),
    ego: sampleEgo(doc, t),
  };
}

// ─── 障碍物运动 ──────────────────────────────────────────────────────────────

/**
 * 障碍物的「时间→弧长」剖面：把 trajectory 折线参数化为按时间推进。
 * cumDist[i] = 起点到第 i 个顶点的累计弧长（米）；
 * cumTime[i] = 到达第 i 个顶点的时刻（相对运动开始，秒）。
 */
interface MotionProfile {
  startTime: number; // 何时开始动（秒，相对仿真起点）
  totalTime: number; // 走完全程耗时（秒）
  cumDist: number[];
  cumTime: number[];
  vertices: TrajectoryVertex[];
  /** classic 模式（顶点带 speed）：用 cumTime 段线性反查距离。 */
  classic: boolean;
  /** openscenario 模式速度剖面（localTime→speed）；classic 下不用。 */
  speedAt: (localTime: number) => number;
}

/** 两点世界距离（米）。 */
function dist(a: TrajectoryVertex, b: TrajectoryVertex): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 障碍物触发起始时刻（秒）。仅 TIME 触发延后；DISTANCE/NA 视作 0（按主车距离触发无法在纯运动学里解算）。 */
function obstacleStartTime(ob: ScenarioObstacle): number {
  if (ob.triggerType === 'TIME' && typeof ob.triggerValue === 'number') {
    return Math.max(0, ob.triggerValue);
  }
  return 0;
}

/**
 * 构造障碍物运动剖面。静态物 / 单点轨迹返回 null（不参与动画，保持初始位置）。
 *
 * classic：顶点逐点带 speed → 逐段按两端平均速度求段时长，用 cumTime 段线性反查。
 * openscenario：顶点无 speed，用 initialSpeed + speedAction 事件（simulationTime 触发）
 *   构造**随时间**变化的速度剖面，distanceAtTime 对其在时间上数值积分（不受顶点疏密影响，
 *   故中途变速事件能正确反映在位置上）。
 */
function obstacleProfile(ob: ScenarioObstacle): MotionProfile | null {
  if (!ob.moving || ob.trajectory.length < 2) return null;

  const verts = ob.trajectory;
  const cumDist = [0];
  for (let i = 1; i < verts.length; i++) {
    cumDist.push(cumDist[i - 1]! + dist(verts[i - 1]!, verts[i]!));
  }
  const total = cumDist[cumDist.length - 1]!;
  if (total <= 1e-9) return null;

  const startTime = obstacleStartTime(ob);
  const speedAt = makeSpeedProfile(ob);
  // 任一顶点带 speed → classic 逐点速度模式。
  const classic = verts.some((v) => typeof v.speed === 'number');

  if (classic) {
    const cumTime = [0];
    for (let i = 1; i < verts.length; i++) {
      const segLen = cumDist[i]! - cumDist[i - 1]!;
      const v = segmentClassicSpeed(verts[i - 1]!, verts[i]!) ?? Math.max(ob.initialSpeed, 0.1);
      cumTime.push(cumTime[i - 1]! + segLen / Math.max(v, 0.1));
    }
    return {
      startTime,
      totalTime: cumTime[cumTime.length - 1]!,
      cumDist,
      cumTime,
      vertices: verts,
      classic: true,
      speedAt,
    };
  }

  // openscenario：按速度剖面在时间上积分到走完全程，求 totalTime。
  const totalTime = integrateTimeForDistance(speedAt, total);
  return {
    startTime,
    totalTime,
    cumDist,
    cumTime: [],
    vertices: verts,
    classic: false,
    speedAt,
  };
}

/** 数值步长（秒）：速度剖面在时间上积分用。 */
const INTEGRATION_DT = 0.05;

/** 在速度剖面下走完 targetDist（米）所需时间（秒）。速度恒 0 时返回 Infinity 兜底为大值。 */
function integrateTimeForDistance(speedAt: (t: number) => number, targetDist: number): number {
  let d = 0;
  let t = 0;
  // 上限保护：避免速度恒 0 时死循环。
  const MAX_T = 3600;
  while (d < targetDist && t < MAX_T) {
    d += Math.max(speedAt(t), 0) * INTEGRATION_DT;
    t += INTEGRATION_DT;
  }
  return t;
}

/** classic 段速度：两端 speed 均值（都缺则 null，交给 openscenario 剖面）。 */
function segmentClassicSpeed(a: TrajectoryVertex, b: TrajectoryVertex): number | null {
  const sa = a.speed;
  const sb = b.speed;
  if (typeof sa === 'number' && typeof sb === 'number') return Math.max((sa + sb) / 2, 0.1);
  if (typeof sa === 'number') return Math.max(sa, 0.1);
  if (typeof sb === 'number') return Math.max(sb, 0.1);
  return null;
}

/**
 * openscenario 速度剖面：初速 + speedAction 事件（simulationTime 触发）的阶梯函数。
 * 返回 `(localTime) → speed`，localTime 相对运动开始（秒）。
 * dynamics 的渐变这里简化为「到触发时刻即切到目标速度」（阶梯），位置精度足够动画用。
 */
function makeSpeedProfile(ob: ScenarioObstacle): (localTime: number) => number {
  const base = Math.max(ob.initialSpeed, 0);
  const steps: Array<{ at: number; speed: number }> = [];
  for (const ev of ob.events) {
    if (ev.action.kind !== 'speed') continue;
    if (ev.trigger?.kind !== 'simulationTime') continue;
    // 事件触发用绝对仿真时刻；剖面是相对运动开始，减去 startTime。
    const at = ev.trigger.value - obstacleStartTime(ob);
    steps.push({ at, speed: Math.max(ev.action.targetSpeed, 0) });
  }
  steps.sort((a, b) => a.at - b.at);
  return (localTime) => {
    let v = base;
    for (const s of steps) {
      if (localTime >= s.at) v = s.speed;
      else break;
    }
    return v;
  };
}

/** 沿剖面在 localDist 处插值出世界点（含段方向朝向 h）。 */
function pointAtDistance(prof: MotionProfile, localDist: number): WorldPoint {
  const { cumDist, vertices } = prof;
  const total = cumDist[cumDist.length - 1]!;
  const d = Math.min(Math.max(localDist, 0), total);
  for (let i = 1; i < cumDist.length; i++) {
    if (d <= cumDist[i]! + 1e-9) {
      const segLen = cumDist[i]! - cumDist[i - 1]!;
      const frac = segLen > 1e-9 ? (d - cumDist[i - 1]!) / segLen : 0;
      const a = vertices[i - 1]!;
      const b = vertices[i]!;
      return {
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
        h: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
  }
  const last = vertices[vertices.length - 1]!;
  const prev = vertices[vertices.length - 2] ?? last;
  return { x: last.x, y: last.y, h: Math.atan2(last.y - prev.y, last.x - prev.x) };
}

/** localTime（相对运动开始）→ 已行驶弧长。 */
function distanceAtTime(prof: MotionProfile, localTime: number): number {
  const total = prof.cumDist[prof.cumDist.length - 1]!;
  if (localTime <= 0) return 0;
  if (localTime >= prof.totalTime) return total;

  if (prof.classic) {
    // classic：按 cumTime 段线性插值。
    const { cumTime, cumDist } = prof;
    for (let i = 1; i < cumTime.length; i++) {
      if (localTime <= cumTime[i]!) {
        const segDt = cumTime[i]! - cumTime[i - 1]!;
        const frac = segDt > 1e-9 ? (localTime - cumTime[i - 1]!) / segDt : 0;
        return cumDist[i - 1]! + (cumDist[i]! - cumDist[i - 1]!) * frac;
      }
    }
    return total;
  }

  // openscenario：对速度剖面在时间上数值积分到 localTime。
  let d = 0;
  for (let t = 0; t < localTime; t += INTEGRATION_DT) {
    const step = Math.min(INTEGRATION_DT, localTime - t);
    d += Math.max(prof.speedAt(t), 0) * step;
    if (d >= total) return total;
  }
  return Math.min(d, total);
}

function sampleObstacle(ob: ScenarioObstacle, t: number): ObstaclePose {
  const prof = obstacleProfile(ob);
  if (!prof) return { uid: ob.uid, position: ob.position };
  const localTime = t - prof.startTime;
  if (localTime <= 0) {
    // 未触发：停在轨迹起点（保留初始朝向）。
    const first = prof.vertices[0]!;
    return { uid: ob.uid, position: { x: first.x, y: first.y, h: ob.position.h } };
  }
  const d = distanceAtTime(prof, localTime);
  return { uid: ob.uid, position: pointAtDistance(prof, d) };
}

// ─── 红绿灯配时 ──────────────────────────────────────────────────────────────

/** 一个完整配时周期时长（秒）。stateGroup 为空或无 keepTime 时返回 0（视作静态）。 */
function trafficLightCycle(tl: ScenarioTrafficLight): number {
  let sum = 0;
  for (const st of tl.stateGroup) {
    if (typeof st.keepTime === 'number' && st.keepTime > 0) sum += st.keepTime;
  }
  return sum;
}

/**
 * 红绿灯触发起始时刻（秒）。TIME 触发延后；否则 0。
 */
function trafficLightStartTime(tl: ScenarioTrafficLight): number {
  if (tl.triggerType === 'TIME' && typeof tl.triggerValue === 'number') {
    return Math.max(0, tl.triggerValue);
  }
  return 0;
}

function sampleTrafficLight(tl: ScenarioTrafficLight, t: number): TrafficLightPose {
  const cycle = trafficLightCycle(tl);
  // 无配时方案：恒为初始色。
  if (cycle <= 0 || tl.stateGroup.length === 0) {
    return { uid: tl.uid, color: tl.initialColor, blink: tl.initialBlink ?? false };
  }
  const start = trafficLightStartTime(tl);
  if (t < start) {
    return { uid: tl.uid, color: tl.initialColor, blink: tl.initialBlink ?? false };
  }
  // 在周期内定位当前态（循环播放）。
  let local = (t - start) % cycle;
  for (const st of tl.stateGroup) {
    const keep = typeof st.keepTime === 'number' && st.keepTime > 0 ? st.keepTime : 0;
    if (keep <= 0) continue;
    if (local < keep) return { uid: tl.uid, color: st.color, blink: st.blink ?? false };
    local -= keep;
  }
  // 浮点兜底：落回最后一个有效态。
  const last = tl.stateGroup[tl.stateGroup.length - 1]!;
  return { uid: tl.uid, color: last.color, blink: last.blink ?? false };
}

// ─── ego 运动 ────────────────────────────────────────────────────────────────

/**
 * ego 在 simulatorTime 内沿 start→waypoints→end 匀速推进。
 * ego 无逐点速度（见 [[apollo-scenario-format]]），只能按总时长均匀分配。
 */
function sampleEgo(doc: ScenarioDoc, t: number): EgoPose | null {
  const path: WorldPoint[] = [doc.ego.start, ...doc.ego.waypoints, doc.ego.end];
  const valid = path.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length < 2) {
    return valid.length === 1 ? { position: valid[0]! } : null;
  }
  const cum = [0];
  for (let i = 1; i < valid.length; i++) {
    cum.push(
      cum[i - 1]! + Math.hypot(valid[i]!.x - valid[i - 1]!.x, valid[i]!.y - valid[i - 1]!.y),
    );
  }
  const total = cum[cum.length - 1]!;
  if (total <= 1e-9) return { position: valid[0]! };

  const duration = scenarioDuration(doc);
  const frac = Math.min(Math.max(t / Math.max(duration, 1e-6), 0), 1);
  const target = total * frac;
  for (let i = 1; i < cum.length; i++) {
    if (target <= cum[i]! + 1e-9) {
      const segLen = cum[i]! - cum[i - 1]!;
      const f = segLen > 1e-9 ? (target - cum[i - 1]!) / segLen : 0;
      const a = valid[i - 1]!;
      const b = valid[i]!;
      return {
        position: {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          h: Math.atan2(b.y - a.y, b.x - a.x),
        },
      };
    }
  }
  return { position: valid[valid.length - 1]! };
}
