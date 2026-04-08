import { setup, assign } from 'xstate';
import type { BezierAnchor } from '@/core/geometry/interpolate';

type LngLat = [number, number];

export type DrawTool = 'drawPolyline' | 'drawCatmullRom' | 'drawBezier' | 'drawArc';

export interface EditorContext {
  drawPoints: LngLat[];
  previewPoint: LngLat | null;
  /** 贝塞尔锚点（含控制柄） */
  bezierAnchors: BezierAnchor[];
  /** 贝塞尔：当前正在拖拽控制柄 */
  isDraggingHandle: boolean;
  activeTool: DrawTool | null;
}

export type EditorEvent =
  | { type: 'SELECT_TOOL'; tool: DrawTool }
  | { type: 'MOUSE_DOWN'; point: LngLat }
  | { type: 'MOUSE_MOVE'; point: LngLat }
  | { type: 'MOUSE_UP'; point: LngLat }
  | { type: 'DOUBLE_CLICK'; point: LngLat }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const resetDraw = assign<EditorContext, EditorEvent>({
  drawPoints: [],
  previewPoint: null,
  bezierAnchors: [],
  isDraggingHandle: false,
});

const addPoint = assign<EditorContext, EditorEvent>({
  drawPoints: ({ context, event }) => {
    if (event.type !== 'MOUSE_DOWN') return context.drawPoints;
    return [...context.drawPoints, event.point];
  },
});

const updatePreview = assign<EditorContext, EditorEvent>({
  previewPoint: ({ event }) => {
    if (event.type !== 'MOUSE_MOVE') return null;
    return event.point;
  },
});

/** 贝塞尔：mousedown 添加锚点并开始拖拽控制柄 */
const bezierAddAnchor = assign<EditorContext, EditorEvent>({
  bezierAnchors: ({ context, event }) => {
    if (event.type !== 'MOUSE_DOWN') return context.bezierAnchors;
    const anchor: BezierAnchor = {
      point: event.point,
      handleIn: null,
      handleOut: null,
    };
    return [...context.bezierAnchors, anchor];
  },
  isDraggingHandle: true,
});

/** 贝塞尔：拖拽中更新当前锚点的控制柄 */
const bezierDragHandle = assign<EditorContext, EditorEvent>({
  bezierAnchors: ({ context, event }) => {
    if (event.type !== 'MOUSE_MOVE') return context.bezierAnchors;
    if (!context.isDraggingHandle || context.bezierAnchors.length === 0) return context.bezierAnchors;

    const anchors = [...context.bezierAnchors];
    const last = { ...anchors[anchors.length - 1] };
    const pt = last.point;

    // handleOut = 鼠标位置, handleIn = 镜像
    last.handleOut = event.point;
    last.handleIn = [2 * pt[0] - event.point[0], 2 * pt[1] - event.point[1]];
    anchors[anchors.length - 1] = last;
    return anchors;
  },
  previewPoint: ({ event }) => {
    if (event.type !== 'MOUSE_MOVE') return null;
    return event.point;
  },
});

/** 贝塞尔：mouseup 确认控制柄，如果拖拽距离太小则清除控制柄（纯单击） */
const bezierConfirmHandle = assign<EditorContext, EditorEvent>({
  isDraggingHandle: false,
  bezierAnchors: ({ context, event }) => {
    if (event.type !== 'MOUSE_UP' || context.bezierAnchors.length === 0) return context.bezierAnchors;
    const anchors = [...context.bezierAnchors];
    const last = { ...anchors[anchors.length - 1] };
    const pt = last.point;
    // 拖拽距离小于阈值 → 视为纯单击，不产生控制柄
    const dx = event.point[0] - pt[0];
    const dy = event.point[1] - pt[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) {
      last.handleIn = null;
      last.handleOut = null;
      anchors[anchors.length - 1] = last;
    }
    return anchors;
  },
});

/** 贝塞尔：非拖拽时的 mousemove 仅更新预览 */
const bezierPreview = assign<EditorContext, EditorEvent>({
  previewPoint: ({ event }) => {
    if (event.type !== 'MOUSE_MOVE') return null;
    return event.point;
  },
});

/** 圆弧：第三个点放下后自动完成，所以也用 addPoint */

// 共享的绘制状态事件（Catmull-Rom / Polyline 通用）
const sharedDrawEvents = {
  MOUSE_DOWN: { actions: 'addPoint' as const },
  MOUSE_MOVE: { actions: 'updatePreview' as const },
  DOUBLE_CLICK: {
    guard: 'minPointsReached' as const,
    target: 'idle' as const,
  },
  CONFIRM: {
    guard: 'minPointsReached' as const,
    target: 'idle' as const,
  },
  CANCEL: {
    target: 'idle' as const,
    actions: 'resetDraw' as const,
  },
};

export const editorMachine = setup({
  types: {
    context: {} as EditorContext,
    events: {} as EditorEvent,
  },
  guards: {
    minPointsReached: ({ context }) => context.drawPoints.length >= 2,
    bezierMinAnchors: ({ context }) => context.bezierAnchors.length >= 2,
    arcComplete: ({ context }) => context.drawPoints.length >= 3,
    isDraggingHandle: ({ context }) => context.isDraggingHandle,
    isNotDraggingHandle: ({ context }) => !context.isDraggingHandle,
  },
  actions: {
    addPoint,
    updatePreview,
    resetDraw,
    bezierAddAnchor,
    bezierDragHandle,
    bezierConfirmHandle,
    bezierPreview,
    setTool: assign({
      activeTool: ({ event }) => {
        if (event.type !== 'SELECT_TOOL') return null;
        return event.tool;
      },
    }),
  },
}).createMachine({
  id: 'editor',
  initial: 'idle',
  context: {
    drawPoints: [],
    previewPoint: null,
    bezierAnchors: [],
    isDraggingHandle: false,
    activeTool: null,
  },
  states: {
    idle: {
      on: {
        SELECT_TOOL: [
          { guard: ({ event }) => event.tool === 'drawPolyline', target: 'drawPolyline', actions: ['resetDraw', 'setTool'] },
          { guard: ({ event }) => event.tool === 'drawCatmullRom', target: 'drawCatmullRom', actions: ['resetDraw', 'setTool'] },
          { guard: ({ event }) => event.tool === 'drawBezier', target: 'drawBezier', actions: ['resetDraw', 'setTool'] },
          { guard: ({ event }) => event.tool === 'drawArc', target: 'drawArc', actions: ['resetDraw', 'setTool'] },
        ],
      },
    },

    drawPolyline: {
      on: sharedDrawEvents,
    },

    drawCatmullRom: {
      on: sharedDrawEvents,
    },

    drawBezier: {
      on: {
        MOUSE_DOWN: {
          actions: 'bezierAddAnchor',
        },
        MOUSE_MOVE: [
          { guard: 'isDraggingHandle', actions: 'bezierDragHandle' },
          { actions: 'bezierPreview' },
        ],
        MOUSE_UP: {
          actions: 'bezierConfirmHandle',
        },
        DOUBLE_CLICK: {
          guard: 'bezierMinAnchors',
          target: 'idle',
        },
        CONFIRM: {
          guard: 'bezierMinAnchors',
          target: 'idle',
        },
        CANCEL: {
          target: 'idle',
          actions: 'resetDraw',
        },
      },
    },

    drawArc: {
      on: {
        MOUSE_DOWN: [
          // 第三个点放下 → 自动完成
          {
            guard: ({ context }) => context.drawPoints.length === 2,
            target: 'idle',
            actions: 'addPoint',
          },
          { actions: 'addPoint' },
        ],
        MOUSE_MOVE: {
          actions: 'updatePreview',
        },
        CANCEL: {
          target: 'idle',
          actions: 'resetDraw',
        },
      },
    },
  },
});
