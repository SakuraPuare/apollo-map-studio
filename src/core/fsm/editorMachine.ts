// @ts-nocheck
import { setup, assign } from 'xstate';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { mirrorPoint } from '@/core/geometry/interpolate';
import { wouldSelfIntersect, polygonSelfIntersects } from '@/core/geometry/validation';
import type { DragPointType } from '@/types/editor';
import type { MapElementType } from '@/core/elements';

export type { DragPointType } from '@/types/editor';

export type DrawTool = 'drawPolyline' | 'drawCatmullRom' | 'drawBezier' | 'drawArc' | 'drawRect' | 'drawRotatedRect' | 'drawPolygon';

const DRAW_STATES: readonly string[] = ['drawPolyline', 'drawCatmullRom', 'drawBezier', 'drawArc', 'drawRect', 'drawRotatedRect', 'drawPolygon'];

/** 判断 FSM state value 是否为绘制状态 */
export function isDrawingState(state: string): boolean {
  return DRAW_STATES.includes(state);
}

/** SELECT_TOOL 转换（idle 用，无需 deselectEntity） */
const selectToolTransitions = [
  { guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === 'drawPolyline', target: 'drawPolyline' as const, actions: ['resetDraw'] as const },
  { guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === 'drawCatmullRom', target: 'drawCatmullRom' as const, actions: ['resetDraw'] as const },
  { guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === 'drawBezier', target: 'drawBezier' as const, actions: ['resetDraw'] as const },
  { guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === 'drawArc', target: 'drawArc' as const, actions: ['resetDraw'] as const },
  { guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === 'drawRect', target: 'drawRect' as const, actions: ['resetDraw'] as const },
  { guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === 'drawRotatedRect', target: 'drawRotatedRect' as const, actions: ['resetDraw'] as const },
  { guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === 'drawPolygon', target: 'drawPolygon' as const, actions: ['resetDraw'] as const },
];

/** SELECT_TOOL 转换（selected 用，需先 deselectEntity） */
const selectToolFromSelected = selectToolTransitions.map((t) => ({
  ...t,
  actions: ['deselectEntity', ...t.actions] as const,
}));

export interface EditorContext {
  drawPoints: LngLat[];
  previewPoint: LngLat | null;
  bezierAnchors: BezierAnchor[];
  isDraggingHandle: boolean;
  selectedEntityId: string | null;
  dragPointIndex: number;
  dragPointType: DragPointType;
  dragCurrentPoint: LngLat | null;
  dragAltKey: boolean;
  /** 当前正在绘制的 Apollo 元素类型，null 则创建基础几何图形 */
  activeElement: MapElementType | null;
}

export type EditorEvent =
  | { type: 'SELECT_TOOL'; tool: DrawTool; element?: MapElementType }
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
  activeElement: ({ event }) =>
    event.type === 'SELECT_TOOL' ? (event.element ?? null) : null,
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
    last.handleIn = mirrorPoint(pt, event.point);
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
  dragPointIndex: -1,
  dragPointType: 'vertex' as DragPointType,
  dragCurrentPoint: null,
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
  SELECT_TOOL: selectToolTransitions,
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
    arcComplete: ({ context }) => context.drawPoints.length === 2,
    rectComplete: ({ context }) => context.drawPoints.length === 1,
    rotatedRectComplete: ({ context }) => context.drawPoints.length === 2,
    polygonNoSelfIntersect: ({ context, event }) => {
      if (event.type !== 'MOUSE_DOWN') return false;
      return !wouldSelfIntersect(context.drawPoints, event.point);
    },
    polygonCanClose: ({ context }) => {
      const pts = context.drawPoints.slice(0, -1);
      if (pts.length < 3) return false;
      return !polygonSelfIntersects(pts);
    },
    polygonCanConfirm: ({ context }) => {
      if (context.drawPoints.length < 3) return false;
      return !polygonSelfIntersects(context.drawPoints);
    },
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
  },
}).createMachine({
  id: 'editor',
  initial: 'idle',
  context: {
    drawPoints: [],
    previewPoint: null,
    bezierAnchors: [],
    isDraggingHandle: false,
    selectedEntityId: null,
    dragPointIndex: -1,
    dragPointType: 'vertex' as DragPointType,
    dragCurrentPoint: null,
    dragAltKey: false,
    activeElement: null,
  },
  states: {
    idle: {
      on: {
        SELECT_TOOL: selectToolTransitions,
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
        SELECT_TOOL: selectToolFromSelected,
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
        SELECT_TOOL: selectToolTransitions,
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
        SELECT_TOOL: selectToolTransitions,
        MOUSE_DOWN: [
          { guard: 'arcComplete', target: 'idle', actions: 'addPoint' },
          { actions: 'addPoint' },
        ],
        MOUSE_MOVE: { actions: 'updatePreview' },
        CANCEL: { target: 'idle', actions: 'resetDraw' },
      },
    },

    drawRect: {
      on: {
        SELECT_TOOL: selectToolTransitions,
        MOUSE_DOWN: [
          { guard: 'rectComplete', target: 'idle', actions: 'addPoint' },
          { actions: 'addPoint' },
        ],
        MOUSE_MOVE: { actions: 'updatePreview' },
        CANCEL: { target: 'idle', actions: 'resetDraw' },
      },
    },

    // 旋转矩形：3 次点击
    //   click1 = 主轴起点
    //   click2 = 主轴终点（决定长度 + 旋转角度）
    //   click3 = 垂直方向宽度点（commit）
    drawRotatedRect: {
      on: {
        SELECT_TOOL: selectToolTransitions,
        MOUSE_DOWN: [
          { guard: 'rotatedRectComplete', target: 'idle', actions: 'addPoint' },
          { actions: 'addPoint' },
        ],
        MOUSE_MOVE: { actions: 'updatePreview' },
        CANCEL: { target: 'idle', actions: 'resetDraw' },
      },
    },

    drawPolygon: {
      on: {
        SELECT_TOOL: selectToolTransitions,
        MOUSE_DOWN: {
          guard: 'polygonNoSelfIntersect',
          actions: 'addPoint',
        },
        MOUSE_MOVE: { actions: 'updatePreview' },
        DOUBLE_CLICK: {
          guard: 'polygonCanClose',
          target: 'idle',
          actions: 'removeLastPoint',
        },
        CONFIRM: {
          guard: 'polygonCanConfirm',
          target: 'idle',
        },
        CANCEL: { target: 'idle', actions: 'resetDraw' },
      },
    },
  },
});
