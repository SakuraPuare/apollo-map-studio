function attr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function testId(id: string): string {
  return `[data-testid="${attr(id)}"]`;
}

function actionTestId(actionId: string): string {
  return actionId.replace(/[^a-zA-Z0-9]+/g, '-');
}

export type StatusField = 'app-mode' | 'editor-mode' | 'entity-count';
export type AppMode = 'drawing' | 'scene';

export const selectors = {
  workspace: {
    layout: testId('workspace-layout'),
    main: testId('workspace-main'),
    dockview: testId('workspace-dockview'),
    panel: (id: string) => testId(`workspace-panel-${id}`),
  },
  menu: {
    root: (label: string) => testId(`menu-${label.toLowerCase().replace(/\s+/g, '-')}`),
    item: (actionId: string) => testId(`menuitem-${actionTestId(actionId)}`),
    action: (actionId: string) => `[data-action-id="${attr(actionId)}"]`,
  },
  activity: {
    bar: testId('activity-bar'),
    button: (id: string) => testId(`activity-${id}`),
  },
  toolbar: {
    action: (actionId: string) => testId(`action-${actionId}`),
    commandPalette: 'button[aria-label="Command Palette"]',
    drawTool: (element: string, tool: string) => testId(`draw-tool-${element}-${tool}`),
    element: (element: string) => testId(`element-${element}`),
    sceneTool: (tool: string) => testId(`scene-tool-${tool}`),
    tool: (label: string) => `button[aria-label="${attr(label)}"]`,
  },
  mode: {
    button: (mode: AppMode) => testId(`mode-${mode}`),
  },
  status: {
    bar: testId('status-bar'),
    field: (name: StatusField) => testId(`status-${name}`),
    toggle: (name: string) => testId(`status-toggle-${name}`),
  },
  map: {
    host: testId('map-canvas'),
    canvas: testId('maplibre-canvas'),
  },
} as const;
