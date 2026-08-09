import { setup, assign } from 'xstate';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { mirrorPoint } from '@/core/geometry/interpolate';
import { appendDistinctPolylineDrawPoint } from '@/core/geometry/drawPoints';
import { wouldSelfIntersect, polygonSelfIntersects } from '@/core/geometry/validation';
import type { DragPointType } from '@/types/editor';
import type { MapElementType } from '@/core/elements';

export type { DragPointType } from '@/types/editor';

export type DrawTool =
  'drawPolyline' | 'drawCatmullRom' | 'drawBezier' | 'drawArc' | 'drawRotatedRect' | 'drawPolygon';

const DRAW_STATES: readonly DrawTool[] = [
  'drawPolyline',
  'drawCatmullRom',
  'drawBezier',
  'drawArc',
  'drawRotatedRect',
  'drawPolygon',
];

/** 判断 FSM state value 是否为绘制状态 */
export function isDrawingState(state: string): boolean {
  return (DRAW_STATES as readonly string[]).includes(state);
}

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
  // 提交完成后清空 draw context（activeElement / drawPoints / bezierAnchors）。
  // 与 CANCEL 区别：CANCEL 是用户主动取消，可能在 drawing 态触发；
  // RESET 由 useDrawCommit 在 idle 态收到 commit 之后发，专做收尾清理。
  | { type: 'RESET' }
  // 选中 + 编辑
  | { type: 'SELECT_ENTITY'; id: string }
  | { type: 'DESELECT' }
  | { type: 'START_DRAG'; index: number; pointType: DragPointType; altKey?: boolean }
  | { type: 'DRAG_MOVE'; point: LngLat }
  | { type: 'DRAG_END'; point: LngLat }
  | { type: 'DELETE_ENTITY' }
  | { type: 'TOGGLE_SMOOTH'; index: number };

/** SELECT_TOOL 转换：每个 draw state 一条，结构一致只换 target/guard 的 tool。
 *  从 DRAW_STATES 单一事实源生成，避免 6 条手抄记录漂移。 */
const selectToolTransitions = DRAW_STATES.map((tool) => ({
  guard: ({ event }: { event: EditorEvent }) => event.type === 'SELECT_TOOL' && event.tool === tool,
  target: tool,
  actions: ['resetDraw'] as const,
}));

/** SELECT_TOOL 转换（selected 用，需先 deselectEntity） */
const selectToolFromSelected = selectToolTransitions.map((t) => ({
  ...t,
  actions: ['deselectEntity', ...t.actions] as const,
}));

// ─── 共享绘制事件 ──────────────────────────────────────────

// 历史上这里有 `removeLastPoint`：双击会触发两次 mousedown，FSM 多收一个点，
// 所以 DOUBLE_CLICK 时削掉一个。但 useMapEventRouter 的 isDuplicateInput
// 已经在输入层把标准 dblclick 的第二次 click 吞掉了——DOUBLE_CLICK 不能再 slice。
// 慢双击会退化成普通 click 序列，因此 addPolylinePoint 再按地理距离吞掉连续近点。

const sharedDrawEvents = {
  SELECT_TOOL: selectToolTransitions,
  MOUSE_DOWN: { actions: 'addPolylinePoint' as const },
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

/** 三次点击 commit 模式：第三次 MOUSE_DOWN 落点后 → idle。
 *  drawArc / drawRotatedRect 共享。 */
const threeClickCommitEvents = {
  SELECT_TOOL: selectToolTransitions,
  MOUSE_DOWN: [
    { guard: 'twoPointsLaid' as const, target: 'idle' as const, actions: 'addPoint' as const },
    { actions: 'addPoint' as const },
  ],
  MOUSE_MOVE: { actions: 'updatePreview' as const },
  CANCEL: { target: 'idle' as const, actions: 'resetDraw' as const },
};

// ─── Machine ───────────────────────────────────────────────
//
// XState 5 typed pattern: define context/events on `setup({ types })` and
// declare actions/guards inline so generic inference flows from the typed
// setup. A previous revision lifted each `assign(...)` to a top-level const
// with `assign<EditorContext, EditorEvent>(...)`, which fails because XState 5's
// `assign` signature requires 5 type arguments (TContext, TExpressionEvent,
// TParams, TEvent, TActor) and the resulting ActionFunction's `_out_TEvent`
// widens to `EventObject`, breaking the structural match against the
// `setup.actions` map. Inlining sidesteps that entirely.

export const editorMachine = setup({
  types: {
    context: {} as EditorContext,
    events: {} as EditorEvent,
  },
  guards: {
    minPointsReached: ({ context }) => context.drawPoints.length >= 2,
    bezierMinAnchors: ({ context }) => context.bezierAnchors.length >= 2,
    isDraggingHandle: ({ context }) => context.isDraggingHandle,
    // drawArc 和 drawRotatedRect 都是"两点已落、第三次点击 commit"的形态
    twoPointsLaid: ({ context }) => context.drawPoints.length === 2,
    polygonNoSelfIntersect: ({ context, event }) => {
      if (event.type !== 'MOUSE_DOWN') return false;
      return !wouldSelfIntersect(context.drawPoints, event.point);
    },
    polygonCanClose: ({ context }) => {
      // 输入层已 dedup dblclick 的第二次 click；drawPoints 不再有"多余的最后一点"。
      const pts = context.drawPoints;
      if (pts.length < 3) return false;
      return !polygonSelfIntersects(pts);
    },
    polygonCanConfirm: ({ context }) => {
      if (context.drawPoints.length < 3) return false;
      return !polygonSelfIntersects(context.drawPoints);
    },
  },
  actions: {
    // ─── 绘制 actions ──────────────────────────────────────
    resetDraw: assign({
      drawPoints: [],
      previewPoint: null,
      bezierAnchors: [],
      isDraggingHandle: false,
      activeElement: ({ event }) => (event.type === 'SELECT_TOOL' ? (event.element ?? null) : null),
    }),
    addPoint: assign({
      drawPoints: ({ context, event }) => {
        if (event.type !== 'MOUSE_DOWN') return context.drawPoints;
        return [...context.drawPoints, event.point];
      },
    }),
    addPolylinePoint: assign({
      drawPoints: ({ context, event }) => {
        if (event.type !== 'MOUSE_DOWN') return context.drawPoints;
        return appendDistinctPolylineDrawPoint(context.drawPoints, event.point);
      },
    }),
    updatePreview: assign({
      previewPoint: ({ event }) => {
        if (event.type !== 'MOUSE_MOVE') return null;
        return event.point;
      },
    }),
    bezierAddAnchor: assign({
      bezierAnchors: ({ context, event }) => {
        if (event.type !== 'MOUSE_DOWN') return context.bezierAnchors;
        const anchor: BezierAnchor = { point: event.point, handleIn: null, handleOut: null };
        return [...context.bezierAnchors, anchor];
      },
      isDraggingHandle: true,
    }),
    bezierDragHandle: assign({
      bezierAnchors: ({ context, event }) => {
        if (event.type !== 'MOUSE_MOVE') return context.bezierAnchors;
        if (!context.isDraggingHandle || context.bezierAnchors.length === 0)
          return context.bezierAnchors;
        const anchors = [...context.bezierAnchors];
        // length > 0 已检查；noUncheckedIndexedAccess 仍把 [n-1] 推为 T|undefined。
        const tail = anchors[anchors.length - 1];
        if (!tail) return context.bezierAnchors;
        const last: BezierAnchor = { ...tail };
        const pt = last.point;
        last.handleOut = event.point;
        last.handleIn = mirrorPoint(pt, event.point);
        anchors[anchors.length - 1] = last;
        return anchors;
      },
      previewPoint: ({ event }) => (event.type === 'MOUSE_MOVE' ? event.point : null),
    }),
    bezierConfirmHandle: assign({
      isDraggingHandle: false,
      bezierAnchors: ({ context, event }) => {
        if (event.type !== 'MOUSE_UP' || context.bezierAnchors.length === 0)
          return context.bezierAnchors;
        const anchors = [...context.bezierAnchors];
        // length > 0 已检查；noUncheckedIndexedAccess 仍把 [n-1] 推为 T|undefined。
        const tail = anchors[anchors.length - 1];
        if (!tail) return context.bezierAnchors;
        const last: BezierAnchor = { ...tail };
        const pt = last.point;
        const dist = Math.hypot(event.point[0] - pt[0], event.point[1] - pt[1]);
        if (dist < 1e-6) {
          last.handleIn = null;
          last.handleOut = null;
          anchors[anchors.length - 1] = last;
        }
        return anchors;
      },
    }),
    bezierPreview: assign({
      previewPoint: ({ event }) => (event.type === 'MOUSE_MOVE' ? event.point : null),
    }),
    // ─── 选中/编辑 actions ───────────────────────────────
    selectEntity: assign({
      selectedEntityId: ({ event }) => (event.type === 'SELECT_ENTITY' ? event.id : null),
      dragPointIndex: -1,
      dragPointType: 'vertex' as DragPointType,
      dragCurrentPoint: null,
    }),
    deselectEntity: assign({
      selectedEntityId: null,
      dragPointIndex: -1,
      dragCurrentPoint: null,
    }),
    startDrag: assign({
      dragPointIndex: ({ event }) => (event.type === 'START_DRAG' ? event.index : -1),
      dragPointType: ({ event }) =>
        event.type === 'START_DRAG' ? event.pointType : ('vertex' as DragPointType),
      dragCurrentPoint: null,
      dragAltKey: ({ event }) => (event.type === 'START_DRAG' ? !!event.altKey : false),
    }),
    dragMove: assign({
      dragCurrentPoint: ({ event }) => (event.type === 'DRAG_MOVE' ? event.point : null),
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
        // commit transitions（DOUBLE_CLICK / CONFIRM / 三点 commit）只 target idle
        // 不带 actions——必须保留 drawPoints/bezierAnchors 让 useDrawCommit 读取
        // post-snapshot 完成 commit。useDrawCommit commit 后再发 RESET 收尾，
        // 否则 activeElement 残留导致 ToolStrip 元素高亮不会清。
        RESET: { actions: 'resetDraw' },
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
          actions: assign({
            // dedup 同 sharedDrawEvents：输入层已吞掉 dblclick 的第二次 click，
            // 不再 slice 锚点，否则会丢最后一个锚点。
            isDraggingHandle: false,
          }),
        },
        CONFIRM: { guard: 'bezierMinAnchors', target: 'idle' },
        CANCEL: { target: 'idle', actions: 'resetDraw' },
      },
    },

    // drawArc + drawRotatedRect 都是"两点已落、第三次点击落点 commit"的形态：
    //   drawArc:         click1=起点  click2=中点    click3=终点 (commit)
    //   drawRotatedRect: click1=轴起  click2=轴终    click3=宽度 (commit)
    // 共享同一份 on-handler，只是出现在 states map 里的两个 key 不同。
    drawArc: { on: threeClickCommitEvents },
    drawRotatedRect: { on: threeClickCommitEvents },

    drawPolygon: {
      on: {
        SELECT_TOOL: selectToolTransitions,
        MOUSE_DOWN: {
          guard: 'polygonNoSelfIntersect',
          actions: 'addPoint',
        },
        MOUSE_MOVE: { actions: 'updatePreview' },
        DOUBLE_CLICK: {
          // dedup 同 sharedDrawEvents：输入层已吞掉 dblclick 的第二次 click，
          // 不再补偿性 slice，否则会丢闭合点。
          guard: 'polygonCanClose',
          target: 'idle',
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
