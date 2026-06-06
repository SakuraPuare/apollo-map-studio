import { nanoid } from 'nanoid';
import type {
  ObstacleKind,
  ScenarioDoc,
  ScenarioEgo,
  ScenarioEvent,
  ScenarioFormat,
  ScenarioObstacle,
  ScenarioTrafficLight,
  TrafficLightColor,
  WorldPoint,
} from '@/types/scenario';

/**
 * 新建场景实体工厂。
 *
 * 关键约束：新建的 `ScenarioDoc.raw` 必须是**可被 serializer append 的合法骨架**
 * （openscenario: roadNetwork/entities/storyboard.init/stopTrigger；
 *  classic: start/end/agent[]/trafficLights[]）。新实体 `ref` 一律为 null，
 * 序列化时按规范结构 append。幂等性不靠回填 ref，而靠 serialize 始终基于 `doc.raw`
 * 的纯净深拷贝重建（doc.raw 永不被写回），故每次 serialize 输出一致。详见 [[apollo-scenario-format]]。
 */

/** 按障碍物类别给合理默认尺寸（米）。来自语料常见值。 */
const DEFAULT_DIMS: Record<ObstacleKind, { length: number; width: number; height: number }> = {
  vehicle: { length: 4.5, width: 2, height: 1.5 },
  bicycle: { length: 2, width: 0.6, height: 1.5 },
  pedestrian: { length: 0.5, width: 0.5, height: 1.8 },
  staticObstacle: { length: 1, width: 1, height: 1 },
  unknown: { length: 1, width: 1, height: 1 },
};

/** 取 doc 中现有最大 apolloId + 1（新实体 id，避免冲突）。 */
export function nextApolloId(doc: ScenarioDoc): number {
  let max = 0;
  for (const ob of doc.obstacles) if (ob.apolloId > max) max = ob.apolloId;
  return max + 1;
}

/** 新建一个障碍物（ref=null，待序列化时 append）。 */
export function makeObstacle(
  kind: ObstacleKind,
  position: WorldPoint,
  apolloId: number,
): ScenarioObstacle {
  return {
    uid: nanoid(),
    name: String(apolloId),
    apolloId,
    kind,
    dimensions: { ...DEFAULT_DIMS[kind] },
    position: { x: position.x, y: position.y, h: position.h ?? 0 },
    initialSpeed: 0,
    moving: false,
    trajectory: [],
    triggerType: 'NA',
    events: [],
    ref: null,
  };
}

/** 新建一个红绿灯（ref=null）。默认 RED→GREEN 配时。 */
export function makeTrafficLight(location: WorldPoint, signalId?: string): ScenarioTrafficLight {
  return {
    uid: nanoid(),
    signalId: signalId ?? `Signal_${Math.floor(Math.random() * 1e6)}`,
    location: { x: location.x, y: location.y },
    triggerType: 'NA',
    triggerValue: undefined,
    initialColor: 'GREEN' as TrafficLightColor,
    initialBlink: undefined,
    stateGroup: [
      { color: 'GREEN', keepTime: 30 },
      { color: 'RED', keepTime: 30 },
    ],
    ref: null,
  };
}

/** 新建一个动态事件（ref=null，待序列化时 append）。默认：仿真 5s 时变速到 5 m/s。 */
export function makeEvent(): ScenarioEvent {
  return {
    uid: nanoid(),
    name: '',
    trigger: { kind: 'simulationTime', rule: 'greaterOrEqual', value: 5 },
    action: {
      kind: 'speed',
      targetSpeed: 5,
      dynamicsShape: 'linear',
      dynamicsDimension: 'time',
      dynamicsValue: 1,
    },
    ref: null,
  };
}

function makeBlankEgo(): ScenarioEgo {
  return {
    start: { x: 0, y: 0, h: 0 },
    end: { x: 0, y: 0 },
    waypoints: [],
    startVelocity: 0,
  };
}

export interface BlankScenarioOptions {
  /** 地图目录（openscenario logicFile.filepath / classic mapDir）。 */
  mapDir?: string;
  mapId?: string;
  /** 仿真时长（秒），默认 100。 */
  simulatorTime?: number;
}

/** 构造 openscenario 的最小合法 raw 骨架（数组就位，供 serializer append）。 */
function blankOpenScenarioRaw(id: string, opts: BlankScenarioOptions): Record<string, unknown> {
  const simTime = opts.simulatorTime ?? 100;
  return {
    id,
    type: 'worldsim',
    mapId: opts.mapId ?? '',
    tags: [],
    scenario: {
      roadNetwork: {
        logicFile: { filepath: opts.mapDir ?? '' },
        trafficLights: [],
      },
      entities: { scenarioObjects: [] },
      storyboard: {
        init: { actions: { privates: [] } },
        stories: [],
        stopTrigger: {
          conditionGroups: [
            {
              conditions: [
                {
                  conditionEdge: 'none',
                  name: 'end',
                  byValueCondition: {
                    simulationTimeCondition: { rule: 'greaterOrEqual', value: simTime },
                  },
                },
              ],
            },
          ],
        },
      },
      autoCarInfo: {
        start: { x: 0, y: 0, heading: 0 },
        end: { x: 0, y: 0 },
        routingRequest: { waypoint: [] },
        startVelocity: 0,
      },
      gradingConfigInfo: {
        baseGradeConfigFile: 'grading_system/conf/grading_metrics_default.conf',
      },
    },
  };
}

/** 构造 classic 的最小合法 raw 骨架。 */
function blankClassicRaw(id: string, opts: BlankScenarioOptions): Record<string, unknown> {
  return {
    id,
    type: 'worldsim',
    mapId: opts.mapId ?? '',
    tags: [],
    scenario: {
      start: { x: 0, y: 0, heading: 0 },
      end: { x: 0, y: 0 },
      mapDir: opts.mapDir ?? '',
      agent: [],
      trafficLights: [],
      simulatorTime: opts.simulatorTime ?? 100,
      baseGradeConfigFile: 'grading_system/conf/grading_metrics_default.conf',
    },
  };
}

/** 新建一份空场景文档。raw 是可 append 的合法骨架，obstacles/lights 为空。 */
export function makeBlankScenario(
  format: ScenarioFormat,
  opts: BlankScenarioOptions = {},
): ScenarioDoc {
  const id = nanoid();
  const raw =
    format === 'openscenario' ? blankOpenScenarioRaw(id, opts) : blankClassicRaw(id, opts);
  return {
    format,
    meta: {
      id,
      mapId: opts.mapId,
      mapDir: opts.mapDir,
      type: 'worldsim',
      tags: [],
      simulatorTime: opts.simulatorTime ?? 100,
    },
    ego: makeBlankEgo(),
    obstacles: [],
    trafficLights: [],
    raw,
  };
}
