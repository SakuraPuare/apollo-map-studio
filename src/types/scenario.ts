/**
 * 归一化场景模型（Apollo scenario 的编辑器内部表示）
 *
 * 设计原则 —— **preserve-and-patch（保留并打补丁）**：
 *   真实 Apollo 场景文件含有 `set/CombinedSchema.json` 之外的字段
 *   （trafficFlow / intelligentObstacleConfig / realisticPerceptionConfig /
 *    detectDistance / agent.startTime …）。要做到 100% round-trip，
 *   解析时必须**保留原始 JSON**（`ScenarioDoc.raw`），序列化时只把编辑过的
 *   字段打回去，绝不从“仅含已建模字段”的类型重新生成整份文件。
 *
 * 坐标一律是**世界米**（UTM-like easting/northing，与场景引用的地图同一 CRS）。
 * 投影到 lngLat 渲染是 `scenarioProjection.ts` 的职责，不在本模型内。
 */

/** 世界坐标点（UTM-like 米）。h = heading(rad)，v = 速度（部分顶点带）。 */
export interface WorldPoint {
  x: number;
  y: number;
  z?: number;
  h?: number;
  v?: number;
}

/** 障碍物三维尺寸（米）。 */
export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

/** 障碍物类别。openscenario 用 vehicle/pedestrian/unknownUnmovableObject 三选一；
 *  classic 用 agent.type。统一成本枚举，序列化时各自映射回去。 */
export type ObstacleKind = 'vehicle' | 'bicycle' | 'pedestrian' | 'staticObstacle' | 'unknown';

/** 轨迹顶点（障碍物路径上的一个点）。 */
export interface TrajectoryVertex {
  x: number;
  y: number;
  /** heading(rad)，仅首点常带。 */
  h?: number;
  /** 该点速度（classic trackedPoint 用 speed；openscenario 顶点一般不带）。 */
  speed?: number;
}

/** 触发方式：按时间 / 按主车距离 / 不触发。 */
export type TriggerType = 'TIME' | 'DISTANCE' | 'NA';

// ─── 动态机动 (storyboard.stories) ──────────────────────────────────────────
//
// Apollo 场景的「中途变速/变道」活在 storyboard.stories[].acts[].maneuverGroups[]
// .maneuvers[].events[] 里，按 actor(entityRef) 归集到对应障碍物。**只建模语料里
// 真实出现的形态**（speedAction / laneChangeAction；simulationTime / distance /
// relativeDistance 触发）；其余变体不收进模型、靠 ScenarioDoc.raw 原样保留，保证
// round-trip 无损（与 obstacle/ego 的 preserve-and-patch 契约一致）。

/** 触发规则（语料里仅 ≥ / ≤ 两种）。 */
export type TriggerRule = 'greaterOrEqual' | 'lessOrEqual';

/** 事件触发条件。 */
export interface ScenarioTrigger {
  /** simulationTime=按仿真时刻；distance=主车到某点距离；relativeDistance=与某实体距离。 */
  kind: 'simulationTime' | 'distance' | 'relativeDistance';
  rule: TriggerRule;
  value: number;
  /** distance 触发点（世界米）。 */
  position?: WorldPoint;
  /** relativeDistance 的目标实体（entityRef 名）。 */
  targetRef?: string;
  /** relativeDistance 的距离类型（'cartesianDistance' 等），原样保留。 */
  relativeDistanceType?: string;
}

/** 变速动作（达到目标速度，按 dynamics 平滑）。 */
export interface SpeedEventAction {
  kind: 'speed';
  targetSpeed: number;
  dynamicsShape: 'linear';
  dynamicsDimension: 'time' | 'distance' | 'rate';
  dynamicsValue: number;
}

/** 变道动作（相对当前车道偏移 ±N 条）。 */
export interface LaneChangeEventAction {
  kind: 'laneChange';
  relativeTargetLane: number;
  /** 相对参照实体（缺省=自身）。 */
  targetRef?: string;
  dynamicsDimension: string;
  dynamicsValue: number;
}

export type ScenarioEventAction = SpeedEventAction | LaneChangeEventAction;

/** 一个动态事件（触发条件 + 动作）。 */
export interface ScenarioEvent {
  uid: string;
  name: string;
  trigger: ScenarioTrigger | null;
  action: ScenarioEventAction;
  /** 反解链接：定位回 raw 的 stories 路径；新建事件为 null（序列化时构造）。 */
  ref: EventRef | null;
}

/** 事件在 raw.storyboard.stories 中的来源路径。 */
export interface EventRef {
  storyIndex: number;
  actIndex: number;
  mgIndex: number;
  manIndex: number;
  eventIndex: number;
}

/** 一个障碍物（车/人/静态物）的归一化视图。 */
export interface ScenarioObstacle {
  /** 编辑器内部稳定 id（nanoid），与 Apollo 的 name/id 解耦。 */
  uid: string;
  /** Apollo 实体名（openscenario entityRef 的 key；classic agent.id 的字符串化）。 */
  name: string;
  /** Apollo 数值 id（openscenario scenarioObject.id；classic agent.id）。 */
  apolloId: number;
  kind: ObstacleKind;
  dimensions: Dimensions;
  /** 初始位置 + 朝向（世界米）。 */
  position: WorldPoint;
  /** 初始速度 m/s。 */
  initialSpeed: number;
  /** 是否运动（false = 静态障碍物）。 */
  moving: boolean;
  /** 运动轨迹顶点（沿此折线行驶）。静态物为空或单点。 */
  trajectory: TrajectoryVertex[];
  /** 触发方式（何时开始动）。 */
  triggerType: TriggerType;
  /** 触发阈值（DISTANCE→米，TIME→秒）。 */
  triggerValue?: number;
  /** 动态机动事件（中途变速/变道）。解析时从 storyboard.stories 按 actor 归集。 */
  events: ScenarioEvent[];
  /** 反解链接：定位回 raw 的来源；新建障碍物为 null（序列化时追加）。 */
  ref: ObstacleRef | null;
}

/** openscenario 障碍物在 raw 中的来源索引；classic 用 agentIndex。 */
export interface ObstacleRef {
  /** 'openscenario' | 'classic'。 */
  kind: 'openscenario' | 'classic';
  /** entities.scenarioObjects[objIndex]（openscenario）。 */
  objIndex?: number;
  /** storyboard.init.actions.privates[privateIndex]（openscenario）。 */
  privateIndex?: number;
  /** scenario.agent[agentIndex]（classic）。 */
  agentIndex?: number;
}

/** 红绿灯归一化视图。 */
export interface ScenarioTrafficLight {
  uid: string;
  /** Apollo signal id（字符串）。 */
  signalId: string;
  location: WorldPoint;
  triggerType: TriggerType;
  triggerValue?: number;
  initialColor: TrafficLightColor;
  initialBlink?: boolean;
  /** 配时方案：颜色 + 保持秒数序列。 */
  stateGroup: TrafficLightState[];
  ref: TrafficLightRef | null;
}

export type TrafficLightColor = 'RED' | 'GREEN' | 'YELLOW';

export interface TrafficLightState {
  color: TrafficLightColor;
  keepTime?: number;
  blink?: boolean;
}

export interface TrafficLightRef {
  kind: 'openscenario' | 'classic';
  /** roadNetwork.trafficLights[tlIndex]（openscenario）或 scenario.trafficLights[tlIndex]（classic）。 */
  tlIndex: number;
}

/** 主车（ego）配置。 */
export interface ScenarioEgo {
  start: WorldPoint;
  end: WorldPoint;
  /** 途经点（openscenario routingRequest.waypoint / classic 无）。 */
  waypoints: WorldPoint[];
  startVelocity?: number;
  startAcceleration?: number;
  parkingPoint?: WorldPoint;
}

/** 场景元信息（地图、标签、描述、评分配置）。编辑器只读展示为主。 */
export interface ScenarioMeta {
  id: string;
  mapId?: string;
  /** 地图目录（openscenario roadNetwork.logicFile.filepath / classic mapDir）。 */
  mapDir?: string;
  type?: string;
  tags: string[];
  descriptionEn?: string;
  authorName?: string;
  /** 仿真时长（秒）。openscenario stopTrigger.simulationTime / classic simulatorTime。 */
  simulatorTime?: number;
}

/** 场景文件格式。 */
export type ScenarioFormat = 'openscenario' | 'classic';

/**
 * 一份完整场景的归一化文档。`raw` 是原始 JSON 的深拷贝，编辑器永不直接改它；
 * 所有编辑落在 obstacles/ego/trafficLights/meta 上，序列化时打回 `raw` 的克隆。
 */
export interface ScenarioDoc {
  format: ScenarioFormat;
  meta: ScenarioMeta;
  ego: ScenarioEgo;
  obstacles: ScenarioObstacle[];
  trafficLights: ScenarioTrafficLight[];
  /** 原始解析结果（深拷贝）。序列化基线，保证未建模字段无损。 */
  raw: Record<string, unknown>;
}
