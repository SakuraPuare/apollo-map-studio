/**
 * Apollo 地图元素定义
 * 每个元素映射到一个或多个基础绘制工具
 */
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
}

export const MAP_ELEMENTS: MapElementDef[] = [
  { type: 'lane',         label: '车道',     tools: ['drawBezier', 'drawArc'],          defaultTool: 'drawBezier',       color: '#4a9eff', geometry: 'line' },
  { type: 'junction',     label: '路口',     tools: ['drawPolygon'],                    defaultTool: 'drawPolygon',      color: '#ffcc00', geometry: 'polygon' },
  { type: 'parkingSpace', label: '车位',     tools: ['drawRotatedRect', 'drawPolygon'], defaultTool: 'drawRotatedRect',  color: '#7c5cbf', geometry: 'polygon' },
  { type: 'crosswalk',    label: '人行横道', tools: ['drawRotatedRect', 'drawPolygon'], defaultTool: 'drawRotatedRect',  color: '#ffffff', geometry: 'polygon' },
  { type: 'signal',       label: '信号灯',   tools: ['drawBezier'],                     defaultTool: 'drawBezier',       color: '#22cc44', geometry: 'line' },
  { type: 'stopSign',     label: '停车标志', tools: ['drawBezier'],                     defaultTool: 'drawBezier',       color: '#ff0000', geometry: 'line' },
  { type: 'speedBump',    label: '减速带',   tools: ['drawBezier'],                     defaultTool: 'drawBezier',       color: '#ffaa00', geometry: 'line' },
  { type: 'yieldSign',    label: '让行标志', tools: ['drawBezier'],                     defaultTool: 'drawBezier',       color: '#ff6600', geometry: 'line' },
  { type: 'clearArea',    label: '禁停区',   tools: ['drawRotatedRect', 'drawPolygon'], defaultTool: 'drawRotatedRect',  color: '#ff4466', geometry: 'polygon' },
  { type: 'barrierGate',  label: '道闸',     tools: ['drawBezier'],                     defaultTool: 'drawBezier',       color: '#aa66ff', geometry: 'line' },
  { type: 'area',         label: '区域',     tools: ['drawPolygon'],                    defaultTool: 'drawPolygon',      color: '#66aaff', geometry: 'polygon' },
];

/** 全部绘制工具定义（drawRect 已统一为 drawRotatedRect，旧项目原本就只有一种矩形） */
export const ALL_DRAW_TOOLS: { tool: DrawTool; label: string; color: string }[] = [
  { tool: 'drawBezier',      label: '贝塞尔', color: 'bg-pink-500' },
  { tool: 'drawArc',         label: '圆弧',   color: 'bg-amber-500' },
  { tool: 'drawRotatedRect', label: '矩形',   color: 'bg-red-500' },
  { tool: 'drawPolygon',     label: '多边形', color: 'bg-purple-500' },
];

export const ELEMENT_MAP = new Map(MAP_ELEMENTS.map((e) => [e.type, e]));

/** 根据元素类型获取颜色 */
export function elementColor(entityType: string): string | undefined {
  return ELEMENT_MAP.get(entityType as MapElementType)?.color;
}
