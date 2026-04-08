import { setup, assign } from 'xstate';

type LngLat = [number, number];

export interface EditorContext {
  drawPoints: LngLat[];
  previewPoint: LngLat | null;
}

export type EditorEvent =
  | { type: 'SELECT_TOOL'; tool: 'drawPolyline' }
  | { type: 'MOUSE_DOWN'; point: LngLat }
  | { type: 'MOUSE_MOVE'; point: LngLat }
  | { type: 'DOUBLE_CLICK'; point: LngLat }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

export const editorMachine = setup({
  types: {
    context: {} as EditorContext,
    events: {} as EditorEvent,
  },
  guards: {
    minPointsReached: ({ context }) => context.drawPoints.length >= 2,
  },
  actions: {
    addPoint: assign({
      drawPoints: ({ context, event }) => {
        if (event.type !== 'MOUSE_DOWN') return context.drawPoints;
        return [...context.drawPoints, event.point];
      },
    }),
    updatePreview: assign({
      previewPoint: ({ event }) => {
        if (event.type !== 'MOUSE_MOVE') return null;
        return event.point;
      },
    }),
    resetDraw: assign({
      drawPoints: [],
      previewPoint: null,
    }),
  },
}).createMachine({
  id: 'editor',
  initial: 'idle',
  context: {
    drawPoints: [],
    previewPoint: null,
  },
  states: {
    idle: {
      on: {
        SELECT_TOOL: {
          guard: ({ event }) => event.tool === 'drawPolyline',
          target: 'drawPolyline',
          actions: 'resetDraw',
        },
      },
    },
    drawPolyline: {
      on: {
        MOUSE_DOWN: {
          actions: 'addPoint',
        },
        MOUSE_MOVE: {
          actions: 'updatePreview',
        },
        DOUBLE_CLICK: {
          guard: 'minPointsReached',
          target: 'idle',
          // 完成绘制的逻辑由组件层通过 snapshot 监听处理
        },
        CONFIRM: {
          guard: 'minPointsReached',
          target: 'idle',
        },
        CANCEL: {
          target: 'idle',
          actions: 'resetDraw',
        },
      },
    },
  },
});
