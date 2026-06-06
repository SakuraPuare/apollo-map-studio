import { create } from 'zustand';
import type { WorldPoint } from '@/types/scenario';

/**
 * 场景绘制工具状态（与绘图模式的 XState FSM 完全隔离的轻量层）。
 *
 * scenario 覆盖层本就用独立 MapLibre 监听（见 useScenarioLayer），authoring
 * 交互也建成平行子系统：当前工具 + 画轨迹时的草稿顶点。放置/拖拽/画线等手感由
 * src/hooks/scenarioAuthoring/* 读取本 store 驱动。
 */
export type SceneTool =
  | 'select'
  | 'placeVehicle'
  | 'placePedestrian'
  | 'placeBicycle'
  | 'placeStatic'
  | 'placeTrafficLight'
  | 'drawTrajectory'
  | 'setEgoStart'
  | 'setEgoEnd'
  | 'addWaypoint';

/** 放置类工具 → 障碍物 kind 映射（drawTrajectory/ego 不在此列）。 */
export const PLACE_TOOL_KIND = {
  placeVehicle: 'vehicle',
  placePedestrian: 'pedestrian',
  placeBicycle: 'bicycle',
  placeStatic: 'staticObstacle',
} as const;

export type PlaceTool = keyof typeof PLACE_TOOL_KIND;

export function isPlaceTool(tool: SceneTool): tool is PlaceTool {
  return tool in PLACE_TOOL_KIND;
}

interface SceneToolState {
  tool: SceneTool;
  /** drawTrajectory 进行中的草稿顶点（世界米）。提交后清空。 */
  draftVertices: WorldPoint[];
}

interface SceneToolActions {
  setTool(tool: SceneTool): void;
  pushDraftVertex(p: WorldPoint): void;
  clearDraft(): void;
}

export type SceneToolStore = SceneToolState & SceneToolActions;

export const useSceneToolStore = create<SceneToolStore>((set) => ({
  tool: 'select',
  draftVertices: [],
  setTool(tool) {
    // 切工具时丢弃未提交的草稿，避免跨工具残留。
    set({ tool, draftVertices: [] });
  },
  pushDraftVertex(p) {
    set((s) => ({ draftVertices: [...s.draftVertices, p] }));
  },
  clearDraft() {
    set({ draftVertices: [] });
  },
}));
