/**
 * Apollo 地图元素定义
 * 每个元素映射到一个或多个基础绘制工具
 */
import type { IconType } from 'react-icons';
import {
  FaRoad,
  FaSquareParking,
  FaPersonWalking,
  FaTrafficLight,
  FaBan,
  FaRoadBarrier,
} from 'react-icons/fa6';
import { BsFillSignIntersectionFill, BsSignStop, BsSignYieldFill } from 'react-icons/bs';
import { BiShapePolygon } from 'react-icons/bi';
import { PiWarningDiamondFill } from 'react-icons/pi';
import type { DrawTool } from '@/core/fsm/editorMachine';

/** 元素类型的 entityType 判别器 */
export type MapElementType =
  | 'lane'
  | 'junction'
  | 'parkingSpace'
  | 'crosswalk'
  | 'signal'
  | 'stopSign'
  | 'speedBump'
  | 'yieldSign'
  | 'clearArea'
  | 'barrierGate'
  | 'area';

export interface MapElementDef {
  type: MapElementType;
  label: string;
  /** 允许的绘制工具列表 */
  tools: DrawTool[];
  /** 默认绘制工具 */
  defaultTool: DrawTool;
  /** 渲染颜色 */
  color: string;
  /** 几何类型：线还是面 */
  geometry: 'line' | 'polygon';
  /** react-icons 图标组件（直接引用，不走字符串注册表） */
  icon: IconType;
}

export const MAP_ELEMENTS: MapElementDef[] = [
  {
    type: 'lane',
    label: '车道',
    tools: ['drawBezier', 'drawArc'],
    defaultTool: 'drawBezier',
    color: '#4a9eff',
    geometry: 'line',
    icon: FaRoad,
  },
  {
    type: 'junction',
    label: '路口',
    tools: ['drawPolygon'],
    defaultTool: 'drawPolygon',
    color: '#ffcc00',
    geometry: 'polygon',
    icon: BsFillSignIntersectionFill,
  },
  {
    type: 'parkingSpace',
    label: '车位',
    tools: ['drawRotatedRect', 'drawPolygon'],
    defaultTool: 'drawRotatedRect',
    color: '#7c5cbf',
    geometry: 'polygon',
    icon: FaSquareParking,
  },
  {
    type: 'crosswalk',
    label: '人行横道',
    tools: ['drawRotatedRect', 'drawPolygon'],
    defaultTool: 'drawRotatedRect',
    color: '#ffffff',
    geometry: 'polygon',
    icon: FaPersonWalking,
  },
  {
    type: 'signal',
    label: '信号灯',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    color: '#22cc44',
    geometry: 'line',
    icon: FaTrafficLight,
  },
  {
    type: 'stopSign',
    label: '停车标志',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    color: '#ff0000',
    geometry: 'line',
    icon: BsSignStop,
  },
  {
    type: 'speedBump',
    label: '减速带',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    color: '#ffaa00',
    geometry: 'line',
    icon: PiWarningDiamondFill,
  },
  {
    type: 'yieldSign',
    label: '让行标志',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    color: '#ff6600',
    geometry: 'line',
    icon: BsSignYieldFill,
  },
  {
    type: 'clearArea',
    label: '禁停区',
    tools: ['drawRotatedRect', 'drawPolygon'],
    defaultTool: 'drawRotatedRect',
    color: '#ff4466',
    geometry: 'polygon',
    icon: FaBan,
  },
  {
    type: 'barrierGate',
    label: '道闸',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    color: '#aa66ff',
    geometry: 'line',
    icon: FaRoadBarrier,
  },
  {
    type: 'area',
    label: '区域',
    tools: ['drawPolygon'],
    defaultTool: 'drawPolygon',
    color: '#66aaff',
    geometry: 'polygon',
    icon: BiShapePolygon,
  },
];

/** 全部绘制工具定义（drawRect 已统一为 drawRotatedRect，旧项目原本就只有一种矩形） */
export const ALL_DRAW_TOOLS: { tool: DrawTool; label: string; color: string }[] = [
  { tool: 'drawBezier', label: '贝塞尔', color: 'bg-pink-500' },
  { tool: 'drawArc', label: '圆弧', color: 'bg-amber-500' },
  { tool: 'drawRotatedRect', label: '矩形', color: 'bg-red-500' },
  { tool: 'drawPolygon', label: '多边形', color: 'bg-purple-500' },
];

export const ELEMENT_MAP = new Map(MAP_ELEMENTS.map((e) => [e.type, e]));

/** 根据元素类型获取颜色 */
export function elementColor(entityType: string): string | undefined {
  return ELEMENT_MAP.get(entityType as MapElementType)?.color;
}

/**
 * 车道 type 专属配色（Apollo LaneType 七类）
 *
 * 色调取样自现有 elementColor 的 ams-* 调性：
 *   - 蓝色系（#4a9eff / #66aaff）    机动车/共享等可行驶语义
 *   - 绿色系（#22cc44）              绿色出行（非机动车）
 *   - 紫色系（#7c5cbf / #aa66ff）    停车语义
 *   - 橙红系（#ff6600 / #ffaa00）    路肩/警示语义
 *   - 灰白系                         人行道/未知
 *
 * 如果传入未知的 type，回退到 CITY_DRIVING 的蓝色。
 */
export function laneTypeColor(type: string | undefined): string {
  switch (type) {
    case 'CITY_DRIVING':
      return '#4a9eff'; // 机动车主色（与旧硬编码兼容）
    case 'BIKING':
      return '#22cc44'; // 绿色出行
    case 'SIDEWALK':
      return '#cfd4dc'; // 人行道：中性亮灰
    case 'PARKING':
      return '#7c5cbf'; // 停车：紫色（与 parkingSpace 呼应）
    case 'SHOULDER':
      return '#ffaa00'; // 路肩：琥珀警示
    case 'SHARED':
      return '#66aaff'; // 共享：浅蓝
    case 'NONE':
      return '#6b7280'; // 未定义：冷灰
    default:
      return '#4a9eff';
  }
}
