/**
 * Apollo 地图元素定义
 * 每个元素映射到一个或多个基础绘制工具
 */
import type { IconType } from 'react-icons';
import type { DrawTool } from '@/core/fsm/editorMachine';
import { getEntityColor, getEntityEntry } from './entityRegistry';

/** 元素类型的 entityType 判别器 */
export type MapElementType =
  | 'lane'
  | 'junction'
  | 'pncJunction'
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

const MAP_ELEMENT_CONFIG = [
  {
    type: 'lane',
    tools: ['drawBezier', 'drawArc'],
    defaultTool: 'drawBezier',
    geometry: 'line',
  },
  {
    type: 'junction',
    tools: ['drawPolygon'],
    defaultTool: 'drawPolygon',
    geometry: 'polygon',
  },
  {
    type: 'pncJunction',
    tools: ['drawPolygon'],
    defaultTool: 'drawPolygon',
    geometry: 'polygon',
  },
  {
    type: 'parkingSpace',
    tools: ['drawRotatedRect', 'drawPolygon'],
    defaultTool: 'drawRotatedRect',
    geometry: 'polygon',
  },
  {
    type: 'crosswalk',
    tools: ['drawRotatedRect', 'drawPolygon'],
    defaultTool: 'drawRotatedRect',
    geometry: 'polygon',
  },
  {
    type: 'signal',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    geometry: 'line',
  },
  {
    type: 'stopSign',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    geometry: 'line',
  },
  {
    type: 'speedBump',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    geometry: 'line',
  },
  {
    type: 'yieldSign',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    geometry: 'line',
  },
  {
    type: 'clearArea',
    tools: ['drawRotatedRect', 'drawPolygon'],
    defaultTool: 'drawRotatedRect',
    geometry: 'polygon',
  },
  {
    type: 'barrierGate',
    tools: ['drawBezier'],
    defaultTool: 'drawBezier',
    geometry: 'line',
  },
  {
    type: 'area',
    tools: ['drawPolygon'],
    defaultTool: 'drawPolygon',
    geometry: 'polygon',
  },
] satisfies Pick<MapElementDef, 'type' | 'tools' | 'defaultTool' | 'geometry'>[];

export const MAP_ELEMENTS: MapElementDef[] = MAP_ELEMENT_CONFIG.map((config) => {
  const entry = getEntityEntry(config.type);
  if (!entry) throw new Error(`Missing entity registry entry for ${config.type}`);
  return {
    ...config,
    label: entry.label,
    color: entry.color,
    icon: entry.icon,
  };
});

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
  return getEntityColor(entityType);
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
