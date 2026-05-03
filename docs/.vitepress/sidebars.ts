export const zhSidebarGuide = [
  {
    text: '入门指南',
    items: [
      { text: '快速开始', link: '/guide/getting-started' },
      { text: '安装与启动', link: '/guide/installation' },
      { text: '导入地图（概览）', link: '/guide/import' },
      { text: '导入地图（深度）', link: '/guide/importing' },
    ],
  },
  {
    text: '坐标与几何',
    items: [
      { text: '坐标系统', link: '/guide/coordinate-system' },
      { text: '绘制工具总览', link: '/guide/drawing-tools' },
      { text: '车道绘制', link: '/guide/drawing-lanes' },
      { text: '编辑与吸附', link: '/guide/editing-and-snapping' },
    ],
  },
  {
    text: '拓扑与元素',
    items: [
      { text: '拓扑与连接', link: '/guide/topology' },
      { text: '拓扑与路口', link: '/guide/topology-and-junctions' },
      { text: '地图元素清单', link: '/guide/map-elements' },
    ],
  },
  {
    text: '工作台',
    items: [
      { text: '图层树', link: '/guide/layer-tree' },
      { text: 'Inspector 属性面板', link: '/guide/inspector' },
      { text: '菜单栏与工具条', link: '/guide/menubar-and-toolstrip' },
      { text: 'Activity Bar 与面板', link: '/guide/activity-bar-and-panels' },
      { text: '命令面板', link: '/guide/command-palette' },
      { text: '设置面板', link: '/guide/settings' },
    ],
  },
  {
    text: '导出与发布',
    items: [
      { text: '导出概览', link: '/guide/export' },
      { text: '导出深度', link: '/guide/exporting' },
      { text: '离线激活', link: '/guide/license-activation' },
    ],
  },
  {
    text: '快捷键与排错',
    items: [
      { text: '键盘快捷键', link: '/guide/shortcuts' },
      { text: '快捷键别名', link: '/guide/keyboard-shortcuts' },
      { text: '常见问题排查', link: '/guide/troubleshooting' },
    ],
  },
];

export const zhSidebarArchitecture = [
  {
    text: '架构设计',
    items: [
      { text: '总览', link: '/architecture/overview' },
      { text: '技术栈', link: '/architecture/tech-stack' },
      { text: '分层架构', link: '/architecture/layered-architecture' },
      { text: '工作台布局', link: '/architecture/workspace-layout' },
    ],
  },
  {
    text: '状态与动作',
    items: [
      { text: '状态管理', link: '/architecture/state-management' },
      { text: '动作注册表', link: '/architecture/action-registry' },
      { text: 'FSM 设计', link: '/architecture/fsm-design' },
      { text: 'entityOps 防腐层', link: '/architecture/entityops' },
      { text: 'Anti-Corruption Layer', link: '/architecture/anti-corruption-layer' },
    ],
  },
  {
    text: '渲染管线',
    items: [
      { text: '渲染管线', link: '/architecture/rendering' },
      { text: '渲染管线深度', link: '/architecture/rendering-pipeline' },
      { text: '冷热分层', link: '/architecture/cold-hot-layers' },
      { text: '几何引擎', link: '/architecture/geometry-engine' },
      { text: '坐标系统', link: '/architecture/coordinate-system' },
      { text: '空间索引', link: '/architecture/spatial-index' },
      { text: '地图事件路由', link: '/architecture/map-event-router' },
    ],
  },
  {
    text: '拓扑与重叠',
    items: [
      { text: 'Junction 图', link: '/architecture/junction-graph' },
      { text: 'Junction 缝合', link: '/architecture/junction-stitching' },
      { text: 'Overlap 派生', link: '/architecture/overlap-derivation' },
      { text: 'Derive Engine', link: '/architecture/derive-engine' },
    ],
  },
  {
    text: 'Inspector 与 IO',
    items: [
      { text: 'Inspector 系统', link: '/architecture/inspector-system' },
      { text: 'Inspector Schema', link: '/architecture/inspector-schema' },
      { text: 'Worker 协议', link: '/architecture/worker-protocol' },
      { text: '导出引擎', link: '/architecture/export-engine' },
      { text: 'Electron 集成', link: '/architecture/electron-integration' },
      { text: '授权系统', link: '/architecture/license-system' },
    ],
  },
  {
    text: '工程化',
    items: [
      { text: '设计令牌', link: '/architecture/design-tokens' },
      { text: '测试策略', link: '/architecture/testing-strategy' },
      { text: '构建打包', link: '/architecture/build-and-bundle' },
    ],
  },
];

export const zhSidebarApi = [
  {
    text: '顶层 API',
    items: [
      { text: 'API 总览', link: '/api/' },
      { text: 'store/mapStore', link: '/api/store-map' },
      { text: 'store/uiStore', link: '/api/store-ui' },
      { text: 'geo/projection', link: '/api/geo-projection' },
      { text: 'geo/laneGeometry', link: '/api/geo-lane-geometry' },
      { text: 'geo/overlapCalc', link: '/api/geo-overlap-calc' },
      { text: 'proto/loader', link: '/api/proto-loader' },
      { text: 'proto/codec', link: '/api/proto-codec' },
      { text: 'proto/schema', link: '/api/proto-schema' },
      { text: 'export/buildBaseMap', link: '/api/export-base-map' },
      { text: 'export/buildSimMap', link: '/api/export-sim-map' },
      { text: 'export/buildRoutingMap', link: '/api/export-routing-map' },
      { text: 'import/parseBaseMap', link: '/api/import-parse-base-map' },
    ],
  },
  {
    text: 'Components',
    collapsed: true,
    items: [
      { text: 'Components Overview', link: '/api/components/' },
      { text: 'WorkspaceLayout', link: '/api/components/workspace-layout' },
      { text: 'MapCanvas', link: '/api/components/map-canvas' },
      { text: 'MenuBar', link: '/api/components/menu-bar' },
      { text: 'ToolStrip', link: '/api/components/tool-strip' },
      { text: 'ActivityBar', link: '/api/components/activity-bar' },
      { text: 'MapOutline', link: '/api/components/map-outline' },
      { text: 'LayerTree', link: '/api/components/layer-tree' },
      { text: 'SearchPanel', link: '/api/components/search-panel' },
      { text: 'InspectorForms', link: '/api/components/inspector-forms' },
      { text: 'LaneRefList', link: '/api/components/lane-ref-list' },
      { text: 'SettingsPanel', link: '/api/components/settings-panel' },
      { text: 'StatusBar', link: '/api/components/status-bar' },
      { text: 'TimelinePanel', link: '/api/components/timeline-panel' },
      { text: 'CommandPalette', link: '/api/components/command-palette' },
      { text: 'TaskProgressOverlay', link: '/api/components/task-progress-overlay' },
      { text: 'ProjPickerDialog', link: '/api/components/proj-picker-dialog' },
      { text: 'LicenseBanner', link: '/api/components/license-banner' },
      { text: 'ActivationDialog', link: '/api/components/activation-dialog' },
    ],
  },
  {
    text: 'Hooks',
    collapsed: true,
    items: [
      { text: 'Hooks 总览', link: '/api/hooks' },
      { text: 'useActionDispatcher', link: '/api/hooks/use-action-dispatcher' },
      { text: 'useApolloLayer', link: '/api/hooks/use-apollo-layer' },
      { text: 'useColdLayer', link: '/api/hooks/use-cold-layer' },
      { text: 'useHotLayer', link: '/api/hooks/use-hot-layer' },
      { text: 'useOverlayLayer', link: '/api/hooks/use-overlay-layer' },
      { text: 'useGridLayer', link: '/api/hooks/use-grid-layer' },
      { text: 'useMapLibreInit', link: '/api/hooks/use-map-libre-init' },
      { text: 'useMapEventRouter', link: '/api/hooks/use-map-event-router' },
      { text: 'Event Router 内部', link: '/api/hooks/map-event-router-internals' },
      { text: 'useDrawCommit', link: '/api/hooks/use-draw-commit' },
      { text: 'useCursorManager', link: '/api/hooks/use-cursor-manager' },
      { text: 'useDragPan', link: '/api/hooks/use-drag-pan' },
      { text: 'useLicense', link: '/api/hooks/use-license' },
    ],
  },
  {
    text: 'Core',
    collapsed: true,
    items: [
      { text: 'Core 总览', link: '/api/core/' },
      { text: 'Actions Registry', link: '/api/core/actions-registry' },
      { text: 'editorMachine', link: '/api/core/fsm-editor-machine' },
      { text: 'Elements', link: '/api/core/elements' },
      { text: 'Elements Derive', link: '/api/core/elements-derive' },
      { text: 'Elements Overlap', link: '/api/core/elements-overlap' },
      { text: 'Apollo Compile', link: '/api/core/geometry-apollo-compile' },
      { text: 'Connect Lanes', link: '/api/core/geometry-connect-lanes' },
      { text: 'Lane Topology', link: '/api/core/geometry-lane-topology' },
      { text: 'Interpolate', link: '/api/core/geometry-interpolate' },
      { text: 'Snap', link: '/api/core/geometry-snap' },
      { text: 'Validation', link: '/api/core/geometry-validation' },
      { text: 'Hit Test', link: '/api/core/geometry-hit-test' },
      { text: 'Lane Junctions', link: '/api/core/geometry-lane-junctions' },
      { text: 'Spatial Worker', link: '/api/core/workers-spatial' },
      { text: 'Overlap Worker', link: '/api/core/workers-overlap' },
      { text: 'Worker 协议', link: '/api/core/workers-protocol' },
      { text: 'Junction Graph Worker', link: '/api/core/workers-junction-graph' },
    ],
  },
  {
    text: 'IO',
    collapsed: true,
    items: [
      { text: 'Map IO', link: '/api/io/map-io' },
      { text: 'Apollo IO Bridge', link: '/api/io/apollo-io-bridge' },
      { text: 'Apollo IO Protocol', link: '/api/io/apollo-io-protocol' },
      { text: 'File IO', link: '/api/io/file-io' },
      { text: 'Proto Loader', link: '/api/io/proto-loader' },
      { text: 'Proto Bin Codec', link: '/api/io/proto-codec-bin' },
      { text: 'Proto Text Codec', link: '/api/io/proto-codec-text' },
      { text: 'Proto Adapter', link: '/api/io/proto-adapter' },
      { text: 'Proto Projection', link: '/api/io/proto-projection' },
      { text: 'Proto Entity Bridge', link: '/api/io/proto-entity-bridge' },
      { text: 'Proto Apollo GeoJSON', link: '/api/io/proto-apollo-geojson' },
      { text: 'Proto Editor Meta', link: '/api/io/proto-editor-meta' },
    ],
  },
  {
    text: 'Stores · Lib · Types · Electron',
    collapsed: true,
    items: [
      { text: 'Apollo Map Store', link: '/api/store/apollo-map-store' },
      { text: 'License Store', link: '/api/store/license-store' },
      { text: 'Settings Store', link: '/api/store/settings-store' },
      { text: 'Task Progress Store', link: '/api/store/task-progress-store' },
      { text: 'Proj Dialog Store', link: '/api/store/proj-dialog-store' },
      { text: 'lib/entityOps', link: '/api/lib/entity-ops' },
      { text: 'lib/editableGuard', link: '/api/lib/editable-guard' },
      { text: 'lib/enumLabels', link: '/api/lib/enum-labels' },
      { text: 'lib/geo', link: '/api/lib/geo' },
      { text: 'lib/geoJsonHelpers', link: '/api/lib/geo-json-helpers' },
      { text: 'lib/idGenerator', link: '/api/lib/id-generator' },
      { text: 'lib/licenseBridge', link: '/api/lib/license-bridge' },
      { text: 'lib/mapIcons', link: '/api/lib/map-icons' },
      { text: 'types/apollo', link: '/api/types/apollo' },
      { text: 'types/entities', link: '/api/types/entities' },
      { text: 'types/editor', link: '/api/types/editor' },
      { text: 'types/inspectorSchema', link: '/api/types/inspector-schema' },
      { text: 'Electron 总览', link: '/api/electron' },
      { text: 'Electron Main', link: '/api/electron/main-process' },
      { text: 'Electron Preload', link: '/api/electron/preload' },
      { text: 'License Manager', link: '/api/electron/license-manager' },
    ],
  },
];

export const zhSidebarReference = [
  {
    text: '参考资料',
    items: [
      { text: '总览', link: '/reference/' },
      { text: 'Proto Schema', link: '/reference/proto-schema' },
      { text: 'Apollo 类型', link: '/reference/apollo-types' },
      { text: '枚举映射', link: '/reference/enum-mappings' },
      { text: '基准预算', link: '/reference/benchmark-budgets' },
      { text: 'CI Pipeline', link: '/reference/ci-pipeline' },
      { text: '配色板', link: '/reference/color-palette' },
      { text: '设计令牌', link: '/reference/design-tokens' },
      { text: '术语表', link: '/reference/glossary' },
    ],
  },
];

export const zhSidebarRecipes = [
  {
    text: '操作手册',
    items: [
      { text: '新增动作', link: '/recipes/adding-a-new-action' },
      { text: '新增绘制工具', link: '/recipes/adding-a-new-drawing-tool' },
      { text: '新增地图元素', link: '/recipes/adding-a-new-element' },
      { text: '新增 Worker', link: '/recipes/adding-a-worker' },
      { text: '自定义快捷键', link: '/recipes/customizing-shortcuts' },
      { text: '调试地图管线', link: '/recipes/debugging-the-map-pipeline' },
      { text: '扩展 Inspector', link: '/recipes/extending-the-inspector' },
      { text: '签发授权 Key', link: '/recipes/issuing-license-keys' },
      { text: '打包桌面构建', link: '/recipes/packaging-desktop-builds' },
      { text: '使用 ams 主题', link: '/recipes/theming-with-ams-tokens' },
    ],
  },
];

export const zhSidebarContributing = [
  {
    text: '贡献指南',
    items: [
      { text: '开发环境', link: '/contributing/development-setup' },
      { text: '代码风格', link: '/contributing/code-style' },
      { text: 'Commit 规范', link: '/contributing/commit-conventions' },
      { text: 'PR Checklist', link: '/contributing/pr-checklist' },
      { text: '测试规范', link: '/contributing/testing' },
      { text: 'Benchmark', link: '/contributing/benchmarking' },
      { text: '发版流程', link: '/contributing/release-process' },
    ],
  },
];

export const zhSidebarSuperpowers = [
  {
    text: '设计规格',
    items: [
      { text: '总览', link: '/superpowers/' },
      {
        text: '视口裁剪设计',
        link: '/superpowers/specs/2026-04-02-viewport-culling-design',
      },
    ],
  },
];

export const enSidebarGuide = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Quick Start', link: '/en/guide/getting-started' },
      { text: 'Installation', link: '/en/guide/installation' },
      { text: 'Import (Overview)', link: '/en/guide/import' },
      { text: 'Import (Deep Dive)', link: '/en/guide/importing' },
    ],
  },
  {
    text: 'Coordinates & Geometry',
    items: [
      { text: 'Coordinate System', link: '/en/guide/coordinate-system' },
      { text: 'Drawing Tools', link: '/en/guide/drawing-tools' },
      { text: 'Drawing Lanes', link: '/en/guide/drawing-lanes' },
      { text: 'Editing & Snapping', link: '/en/guide/editing-and-snapping' },
    ],
  },
  {
    text: 'Topology & Elements',
    items: [
      { text: 'Topology & Connections', link: '/en/guide/topology' },
      { text: 'Topology & Junctions', link: '/en/guide/topology-and-junctions' },
      { text: 'Map Elements', link: '/en/guide/map-elements' },
    ],
  },
  {
    text: 'Workbench',
    items: [
      { text: 'Layer Tree', link: '/en/guide/layer-tree' },
      { text: 'Inspector', link: '/en/guide/inspector' },
      { text: 'MenuBar & ToolStrip', link: '/en/guide/menubar-and-toolstrip' },
      { text: 'Activity Bar & Panels', link: '/en/guide/activity-bar-and-panels' },
      { text: 'Command Palette', link: '/en/guide/command-palette' },
      { text: 'Settings', link: '/en/guide/settings' },
    ],
  },
  {
    text: 'Export & Release',
    items: [
      { text: 'Export (Overview)', link: '/en/guide/export' },
      { text: 'Export (Deep Dive)', link: '/en/guide/exporting' },
      { text: 'License Activation', link: '/en/guide/license-activation' },
    ],
  },
  {
    text: 'Shortcuts & Troubleshooting',
    items: [
      { text: 'Keyboard Shortcuts', link: '/en/guide/shortcuts' },
      { text: 'Shortcut Aliases', link: '/en/guide/keyboard-shortcuts' },
      { text: 'Troubleshooting', link: '/en/guide/troubleshooting' },
    ],
  },
];

export const enSidebarArchitecture = [
  {
    text: 'Architecture',
    items: [
      { text: 'Overview', link: '/en/architecture/overview' },
      { text: 'Tech Stack', link: '/en/architecture/tech-stack' },
      { text: 'Layered Architecture', link: '/en/architecture/layered-architecture' },
      { text: 'Workspace Layout', link: '/en/architecture/workspace-layout' },
    ],
  },
  {
    text: 'State & Actions',
    items: [
      { text: 'State Management', link: '/en/architecture/state-management' },
      { text: 'Action Registry', link: '/en/architecture/action-registry' },
      { text: 'FSM Design', link: '/en/architecture/fsm-design' },
      { text: 'entityOps', link: '/en/architecture/entityops' },
      { text: 'Anti-Corruption Layer', link: '/en/architecture/anti-corruption-layer' },
    ],
  },
  {
    text: 'Rendering',
    items: [
      { text: 'Rendering Pipeline', link: '/en/architecture/rendering' },
      { text: 'Rendering Pipeline Deep Dive', link: '/en/architecture/rendering-pipeline' },
      { text: 'Cold / Hot Layers', link: '/en/architecture/cold-hot-layers' },
      { text: 'Geometry Engine', link: '/en/architecture/geometry-engine' },
      { text: 'Coordinate System', link: '/en/architecture/coordinate-system' },
      { text: 'Spatial Index', link: '/en/architecture/spatial-index' },
      { text: 'Map Event Router', link: '/en/architecture/map-event-router' },
    ],
  },
  {
    text: 'Topology & Overlap',
    items: [
      { text: 'Junction Graph', link: '/en/architecture/junction-graph' },
      { text: 'Junction Stitching', link: '/en/architecture/junction-stitching' },
      { text: 'Overlap Derivation', link: '/en/architecture/overlap-derivation' },
      { text: 'Derive Engine', link: '/en/architecture/derive-engine' },
    ],
  },
  {
    text: 'Inspector & IO',
    items: [
      { text: 'Inspector System', link: '/en/architecture/inspector-system' },
      { text: 'Inspector Schema', link: '/en/architecture/inspector-schema' },
      { text: 'Worker Protocol', link: '/en/architecture/worker-protocol' },
      { text: 'Export Engine', link: '/en/architecture/export-engine' },
      { text: 'Electron Integration', link: '/en/architecture/electron-integration' },
      { text: 'License System', link: '/en/architecture/license-system' },
    ],
  },
  {
    text: 'Engineering',
    items: [
      { text: 'Design Tokens', link: '/en/architecture/design-tokens' },
      { text: 'Testing Strategy', link: '/en/architecture/testing-strategy' },
      { text: 'Build & Bundle', link: '/en/architecture/build-and-bundle' },
    ],
  },
];

export const enSidebarApi = [
  {
    text: 'Top-Level API',
    items: [
      { text: 'Overview', link: '/en/api/' },
      { text: 'store/mapStore', link: '/en/api/store-map' },
      { text: 'store/uiStore', link: '/en/api/store-ui' },
      { text: 'geo/projection', link: '/en/api/geo-projection' },
      { text: 'geo/laneGeometry', link: '/en/api/geo-lane-geometry' },
      { text: 'geo/overlapCalc', link: '/en/api/geo-overlap-calc' },
      { text: 'proto/loader', link: '/en/api/proto-loader' },
      { text: 'proto/codec', link: '/en/api/proto-codec' },
      { text: 'proto/schema', link: '/en/api/proto-schema' },
      { text: 'export/buildBaseMap', link: '/en/api/export-base-map' },
      { text: 'export/buildSimMap', link: '/en/api/export-sim-map' },
      { text: 'export/buildRoutingMap', link: '/en/api/export-routing-map' },
      { text: 'import/parseBaseMap', link: '/en/api/import-parse-base-map' },
    ],
  },
  {
    text: 'Components',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/en/api/components/' },
      { text: 'WorkspaceLayout', link: '/en/api/components/workspace-layout' },
      { text: 'MapCanvas', link: '/en/api/components/map-canvas' },
      { text: 'MenuBar', link: '/en/api/components/menu-bar' },
      { text: 'ToolStrip', link: '/en/api/components/tool-strip' },
      { text: 'ActivityBar', link: '/en/api/components/activity-bar' },
      { text: 'MapOutline', link: '/en/api/components/map-outline' },
      { text: 'LayerTree', link: '/en/api/components/layer-tree' },
      { text: 'SearchPanel', link: '/en/api/components/search-panel' },
      { text: 'InspectorForms', link: '/en/api/components/inspector-forms' },
      { text: 'LaneRefList', link: '/en/api/components/lane-ref-list' },
      { text: 'SettingsPanel', link: '/en/api/components/settings-panel' },
      { text: 'StatusBar', link: '/en/api/components/status-bar' },
      { text: 'TimelinePanel', link: '/en/api/components/timeline-panel' },
      { text: 'CommandPalette', link: '/en/api/components/command-palette' },
      { text: 'TaskProgressOverlay', link: '/en/api/components/task-progress-overlay' },
      { text: 'ProjPickerDialog', link: '/en/api/components/proj-picker-dialog' },
      { text: 'LicenseBanner', link: '/en/api/components/license-banner' },
      { text: 'ActivationDialog', link: '/en/api/components/activation-dialog' },
    ],
  },
  {
    text: 'Hooks',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/en/api/hooks' },
      { text: 'useActionDispatcher', link: '/en/api/hooks/use-action-dispatcher' },
      { text: 'useApolloLayer', link: '/en/api/hooks/use-apollo-layer' },
      { text: 'useColdLayer', link: '/en/api/hooks/use-cold-layer' },
      { text: 'useHotLayer', link: '/en/api/hooks/use-hot-layer' },
      { text: 'useOverlayLayer', link: '/en/api/hooks/use-overlay-layer' },
      { text: 'useGridLayer', link: '/en/api/hooks/use-grid-layer' },
      { text: 'useMapLibreInit', link: '/en/api/hooks/use-map-libre-init' },
      { text: 'useMapEventRouter', link: '/en/api/hooks/use-map-event-router' },
      { text: 'Event Router Internals', link: '/en/api/hooks/map-event-router-internals' },
      { text: 'useDrawCommit', link: '/en/api/hooks/use-draw-commit' },
      { text: 'useCursorManager', link: '/en/api/hooks/use-cursor-manager' },
      { text: 'useDragPan', link: '/en/api/hooks/use-drag-pan' },
      { text: 'useLicense', link: '/en/api/hooks/use-license' },
    ],
  },
  {
    text: 'Core',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/en/api/core/' },
      { text: 'Actions Registry', link: '/en/api/core/actions-registry' },
      { text: 'editorMachine', link: '/en/api/core/fsm-editor-machine' },
      { text: 'Elements', link: '/en/api/core/elements' },
      { text: 'Elements Derive', link: '/en/api/core/elements-derive' },
      { text: 'Elements Overlap', link: '/en/api/core/elements-overlap' },
      { text: 'Apollo Compile', link: '/en/api/core/geometry-apollo-compile' },
      { text: 'Connect Lanes', link: '/en/api/core/geometry-connect-lanes' },
      { text: 'Lane Topology', link: '/en/api/core/geometry-lane-topology' },
      { text: 'Interpolate', link: '/en/api/core/geometry-interpolate' },
      { text: 'Snap', link: '/en/api/core/geometry-snap' },
      { text: 'Validation', link: '/en/api/core/geometry-validation' },
      { text: 'Hit Test', link: '/en/api/core/geometry-hit-test' },
      { text: 'Lane Junctions', link: '/en/api/core/geometry-lane-junctions' },
      { text: 'Spatial Worker', link: '/en/api/core/workers-spatial' },
      { text: 'Overlap Worker', link: '/en/api/core/workers-overlap' },
      { text: 'Worker Protocol', link: '/en/api/core/workers-protocol' },
      { text: 'Junction Graph Worker', link: '/en/api/core/workers-junction-graph' },
    ],
  },
  {
    text: 'IO',
    collapsed: true,
    items: [
      { text: 'Map IO', link: '/en/api/io/map-io' },
      { text: 'Apollo IO Bridge', link: '/en/api/io/apollo-io-bridge' },
      { text: 'Apollo IO Protocol', link: '/en/api/io/apollo-io-protocol' },
      { text: 'File IO', link: '/en/api/io/file-io' },
      { text: 'Proto Loader', link: '/en/api/io/proto-loader' },
      { text: 'Proto Bin Codec', link: '/en/api/io/proto-codec-bin' },
      { text: 'Proto Text Codec', link: '/en/api/io/proto-codec-text' },
      { text: 'Proto Adapter', link: '/en/api/io/proto-adapter' },
      { text: 'Proto Projection', link: '/en/api/io/proto-projection' },
      { text: 'Proto Entity Bridge', link: '/en/api/io/proto-entity-bridge' },
      { text: 'Proto Apollo GeoJSON', link: '/en/api/io/proto-apollo-geojson' },
      { text: 'Proto Editor Meta', link: '/en/api/io/proto-editor-meta' },
    ],
  },
  {
    text: 'Stores · Lib · Types · Electron',
    collapsed: true,
    items: [
      { text: 'Apollo Map Store', link: '/en/api/store/apollo-map-store' },
      { text: 'License Store', link: '/en/api/store/license-store' },
      { text: 'Settings Store', link: '/en/api/store/settings-store' },
      { text: 'Task Progress Store', link: '/en/api/store/task-progress-store' },
      { text: 'Proj Dialog Store', link: '/en/api/store/proj-dialog-store' },
      { text: 'lib/entityOps', link: '/en/api/lib/entity-ops' },
      { text: 'lib/editableGuard', link: '/en/api/lib/editable-guard' },
      { text: 'lib/enumLabels', link: '/en/api/lib/enum-labels' },
      { text: 'lib/geo', link: '/en/api/lib/geo' },
      { text: 'lib/geoJsonHelpers', link: '/en/api/lib/geo-json-helpers' },
      { text: 'lib/idGenerator', link: '/en/api/lib/id-generator' },
      { text: 'lib/licenseBridge', link: '/en/api/lib/license-bridge' },
      { text: 'lib/mapIcons', link: '/en/api/lib/map-icons' },
      { text: 'types/apollo', link: '/en/api/types/apollo' },
      { text: 'types/entities', link: '/en/api/types/entities' },
      { text: 'types/editor', link: '/en/api/types/editor' },
      { text: 'types/inspectorSchema', link: '/en/api/types/inspector-schema' },
      { text: 'Electron Overview', link: '/en/api/electron' },
      { text: 'Electron Main', link: '/en/api/electron/main-process' },
      { text: 'Electron Preload', link: '/en/api/electron/preload' },
      { text: 'License Manager', link: '/en/api/electron/license-manager' },
    ],
  },
];

export const enSidebarReference = [
  {
    text: 'Reference',
    items: [
      { text: 'Overview', link: '/en/reference/' },
      { text: 'Proto Schema', link: '/en/reference/proto-schema' },
      { text: 'Apollo Types', link: '/en/reference/apollo-types' },
      { text: 'Enum Mappings', link: '/en/reference/enum-mappings' },
      { text: 'Benchmark Budgets', link: '/en/reference/benchmark-budgets' },
      { text: 'CI Pipeline', link: '/en/reference/ci-pipeline' },
      { text: 'Color Palette', link: '/en/reference/color-palette' },
      { text: 'Design Tokens', link: '/en/reference/design-tokens' },
      { text: 'Glossary', link: '/en/reference/glossary' },
    ],
  },
];

export const enSidebarRecipes = [
  {
    text: 'Recipes',
    items: [
      { text: 'Adding a New Action', link: '/en/recipes/adding-a-new-action' },
      { text: 'Adding a Drawing Tool', link: '/en/recipes/adding-a-new-drawing-tool' },
      { text: 'Adding a Map Element', link: '/en/recipes/adding-a-new-element' },
      { text: 'Adding a Worker', link: '/en/recipes/adding-a-worker' },
      { text: 'Customizing Shortcuts', link: '/en/recipes/customizing-shortcuts' },
      { text: 'Debugging Map Pipeline', link: '/en/recipes/debugging-the-map-pipeline' },
      { text: 'Extending the Inspector', link: '/en/recipes/extending-the-inspector' },
      { text: 'Issuing License Keys', link: '/en/recipes/issuing-license-keys' },
      { text: 'Packaging Desktop Builds', link: '/en/recipes/packaging-desktop-builds' },
      { text: 'Theming with AMS Tokens', link: '/en/recipes/theming-with-ams-tokens' },
    ],
  },
];

export const enSidebarContributing = [
  {
    text: 'Contributing',
    items: [
      { text: 'Development Setup', link: '/en/contributing/development-setup' },
      { text: 'Code Style', link: '/en/contributing/code-style' },
      { text: 'Commit Conventions', link: '/en/contributing/commit-conventions' },
      { text: 'PR Checklist', link: '/en/contributing/pr-checklist' },
      { text: 'Testing', link: '/en/contributing/testing' },
      { text: 'Benchmarking', link: '/en/contributing/benchmarking' },
      { text: 'Release Process', link: '/en/contributing/release-process' },
    ],
  },
];

export const enSidebarSuperpowers = [
  {
    text: 'Design Specs',
    items: [
      { text: 'Overview', link: '/en/superpowers/' },
      {
        text: 'Viewport Culling Design',
        link: '/en/superpowers/specs/2026-04-02-viewport-culling-design',
      },
    ],
  },
];
