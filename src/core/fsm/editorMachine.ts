import { setup, assign } from 'xstate';
import type { BezierAnchor } from '@/core/geometry/interpolate';

type LngLat = [number, number];

export type DrawTool = 'drawPolyline' | 'drawCatmullRom' | 'drawBezier' | 'drawArc';
export type DragPointType = 'vertex' | 'handleIn' | 'handleOut';

export interface EditorContext {
  // 绘制相关
  drawPoints: LngLat[];
  previewPoint: LngLat | null;
  bezierAnchors: BezierAnchor[];
  isDraggingHandle: boolean;
  activeTool: DrawTool | null;
  // 选中 + 编辑相关
  selectedEntityId: string | null;
  dragPointIndex: number;
  dragPointType: DragPointType;
  dragCurrentPoint: LngLat | null;
  /** Alt 拖拽控制柄时打破对称（cusp 模式） */
  dragAltKey: boolean;
}

export type EditorEvent =
  | { type: 'SELECT_TOOL'; tool: DrawTool }
  | { type: 'MOUSE_DOWN'; point: LngLat }
  | { type: 'MOUSE_MOVE'; point: LngLat }
  | { type: 'MOUSE_UP'; point: LngLat }
  | { type: 'DOUBLE_CLICK'; point: LngLat }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' }
  // 选中 + 编辑
  | { type: 'SELECT_ENTITY'; id: string }
  | { type: 'DESELECT' }
  | { type: 'START_DRAG'; index: number; pointType: DragPointType; altKey?: boolean }
  | { type: 'DRAG_MOVE'; point: LngLat }
  | { type: 'DRAG_END'; point: LngLat }
  | { type: 'DELETE_ENTITY' }
  | { type: 'TOGGLE_SMOOTH'; index: number };

// ─── 绘制 actions ──────────────────────────────────────────

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

const bezierAddAnchor = assign<EditorContext, EditorEvent>({
  bezierAnchors: ({ context, event }) => {
    if (event.type !== 'MOUSE_DOWN') return context.bezierAnchors;
    const anchor: BezierAnchor = { point: event.point, handleIn: null, handleOut: null };
    return [...context.bezierAnchors, anchor];
  },
  isDraggingHandle: true,
});

const bezierDragHandle = assign<EditorContext, EditorEvent>({
  bezierAnchors: ({ context, event }) => {
    if (event.type !== 'MOUSE_MOVE') return context.bezierAnchors;
    if (!context.isDraggingHandle || context.bezierAnchors.length === 0) return context.bezierAnchors;
    const anchors = [...context.bezierAnchors];
    const last = { ...anchors[anchors.length - 1] };
    const pt = last.point;
    last.handleOut = event.point;
    last.handleIn = [2 * pt[0] - event.point[0], 2 * pt[1] - event.point[1]];
    anchors[anchors.length - 1] = last;
    return anchors;
  },
  previewPoint: ({ event }) => (event.type === 'MOUSE_MOVE' ? event.point : null),
});

const bezierConfirmHandle = assign<EditorContext, EditorEvent>({
  isDraggingHandle: false,
  bezierAnchors: ({ context, event }) => {
    if (event.type !== 'MOUSE_UP' || context.bezierAnchors.length === 0) return context.bezierAnchors;
    const anchors = [...context.bezierAnchors];
    const last = { ...anchors[anchors.length - 1] };
    const pt = last.point;
    const dist = Math.hypot(event.point[0] - pt[0], event.point[1] - pt[1]);
    if (dist < 1e-6) {
      last.handleIn = null;
      last.handleOut = null;
      anchors[anchors.length - 1] = last;
    }
    return anchors;
  },
});

const bezierPreview = assign<EditorContext, EditorEvent>({
  previewPoint: ({ event }) => (event.type === 'MOUSE_MOVE' ? event.point : null),
});

// ─── 选中/编辑 actions ─────────────────────────────────────

const selectEntity = assign<EditorContext, EditorEvent>({
  selectedEntityId: ({ event }) => (event.type === 'SELECT_ENTITY' ? event.id : null),
});

const deselectEntity = assign<EditorContext, EditorEvent>({
  selectedEntityId: null,
  dragPointIndex: -1,
  dragCurrentPoint: null,
});

const startDrag = assign<EditorContext, EditorEvent>({
  dragPointIndex: ({ event }) => (event.type === 'START_DRAG' ? event.index : -1),
  dragPointType: ({ event }) => (event.type === 'START_DRAG' ? event.pointType : 'vertex' as DragPointType),
  dragCurrentPoint: null,
  dragAltKey: ({ event }) => (event.type === 'START_DRAG' ? !!event.altKey : false),
});

const dragMove = assign<EditorContext, EditorEvent>({
  dragCurrentPoint: ({ event }) => (event.type === 'DRAG_MOVE' ? event.point : null),
});

// ─── 共享绘制事件 ──────────────────────────────────────────

/** 双击完成时移除最后一个多余点（双击触发了两次 mousedown） */
const removeLastPoint = assign<EditorContext, EditorEvent>({
  drawPoints: ({ context }) => context.drawPoints.slice(0, -1),
});

const sharedDrawEvents = {
  MOUSE_DOWN: { actions: 'addPoint' as const },
  MOUSE_MOVE: { actions: 'updatePreview' as const },
  DOUBLE_CLICK: {
    guard: 'minPointsReached' as const,
    target: 'idle' as const,
    actions: 'removeLastPoint' as const,
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

// ─── Machine ───────────────────────────────────────────────

export const editorMachine = setup({
  types: {
    context: {} as EditorContext,
    events: {} as EditorEvent,
  },
  guards: {
    minPointsReached: ({ context }) => context.drawPoints.length >= 2,
    bezierMinAnchors: ({ context }) => context.bezierAnchors.length >= 2,
    isDraggingHandle: ({ context }) => context.isDraggingHandle,
  },
  actions: {
    addPoint,
    updatePreview,
    resetDraw,
    bezierAddAnchor,
    bezierDragHandle,
    bezierConfirmHandle,
    bezierPreview,
    selectEntity,
    deselectEntity,
    startDrag,
    dragMove,
    removeLastPoint,
    setTool: assign({
      activeTool: ({ event }) => (event.type === 'SELECT_TOOL' ? event.tool : null),
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
    selectedEntityId: null,
    dragPointIndex: -1,
    dragPointType: 'vertex' as DragPointType,
    dragCurrentPoint: null,
    dragAltKey: false,
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
        SELECT_ENTITY: {
          target: 'selected',
          actions: 'selectEntity',
        },
      },
    },

    // ─── 选中态 ──────────────────────────────────────────
    selected: {
      on: {
        START_DRAG: {
          target: 'editingPoint',
          actions: 'startDrag',
        },
        DESELECT: {
          target: 'idle',
          actions: 'deselectEntity',
        },
        DELETE_ENTITY: {
          target: 'idle',
          actions: 'deselectEntity',
        },
        SELECT_ENTITY: {
          target: 'selected',
          actions: 'selectEntity',
        },
        SELECT_TOOL: [
          { guard: ({ event }) => event.tool === 'drawPolyline', target: 'drawPolyline', actions: ['deselectEntity', 'resetDraw', 'setTool'] },
          { guard: ({ event }) => event.tool === 'drawCatmullRom', target: 'drawCatmullRom', actions: ['deselectEntity', 'resetDraw', 'setTool'] },
          { guard: ({ event }) => event.tool === 'drawBezier', target: 'drawBezier', actions: ['deselectEntity', 'resetDraw', 'setTool'] },
          { guard: ({ event }) => event.tool === 'drawArc', target: 'drawArc', actions: ['deselectEntity', 'resetDraw', 'setTool'] },
        ],
        CANCEL: {
          target: 'idle',
          actions: 'deselectEntity',
        },
        TOGGLE_SMOOTH: {
          // Alt+点击锚点：尖角↔平滑切换，实际修改由 MapCanvas 执行
          target: 'selected',
        },
      },
    },

    // ─── 拖拽编辑控制点 ──────────────────────────────────
    editingPoint: {
      on: {
        DRAG_MOVE: {
          actions: 'dragMove',
        },
        DRAG_END: {
          target: 'selected',
          // 实际的 entity 更新由 MapCanvas 组件在 DRAG_END 时执行
        },
        CANCEL: {
          target: 'selected',
          actions: assign({ dragPointIndex: -1, dragCurrentPoint: null }),
        },
      },
    },

    // ─── 绘制状态 ────────────────────────────────────────
    drawPolyline: { on: sharedDrawEvents },
    drawCatmullRom: { on: sharedDrawEvents },

    drawBezier: {
      on: {
        MOUSE_DOWN: { actions: 'bezierAddAnchor' },
        MOUSE_MOVE: [
          { guard: 'isDraggingHandle', actions: 'bezierDragHandle' },
          { actions: 'bezierPreview' },
        ],
        MOUSE_UP: { actions: 'bezierConfirmHandle' },
        DOUBLE_CLICK: {
          guard: 'bezierMinAnchors',
          target: 'idle',
          actions: assign<EditorContext, EditorEvent>({
            // 双击会触发两次 mousedown，移除最后一个多余锚点
            bezierAnchors: ({ context }) => context.bezierAnchors.slice(0, -1),
            isDraggingHandle: false,
          }),
        },
        CONFIRM: { guard: 'bezierMinAnchors', target: 'idle' },
        CANCEL: { target: 'idle', actions: 'resetDraw' },
      },
    },

    drawArc: {
      on: {
        MOUSE_DOWN: [
          { guard: ({ context }) => context.drawPoints.length === 2, target: 'idle', actions: 'addPoint' },
          { actions: 'addPoint' },
        ],
        MOUSE_MOVE: { actions: 'updatePreview' },
        CANCEL: { target: 'idle', actions: 'resetDraw' },
      },
    },
  },
});
