# Store / UI、Action 与面板 API

`src/store/uiStore.ts` 是 Apollo Map Studio 的瞬时 UI 状态层。它不持久化、不接入 zundo，也不保存地图实体。地图实体见 `docs/api/store-map.md`；本文覆盖当前 UI store、settings store、Action Registry、Action Dispatcher、侧边栏面板、Inspector 和 renderer 侧授权 UI。

## UI Store 边界

- `uiStore` 保存模式、网格、吸附、图层显隐/锁定、鼠标经纬度、zoom、侧边栏、当前吸附目标和 lane 连接模式。
- 选择状态不在 `uiStore`，而在编辑 FSM context，例如 `selectedEntityId`。
- Settings 在 `settingsStore`，写 localStorage。
- License 在 `licenseStore`，通过 Electron preload bridge 同步主进程状态。
- UI 状态不可 undo/redo；zundo 只覆盖 `mapStore.entities`。

## UI State

```ts
export type AppMode = 'drawing' | 'scene';

interface UIState {
  appMode: AppMode;
  gridEnabled: boolean;
  snapEnabled: boolean;
  layerStates: Record<string, { visible: boolean; locked: boolean }>;
  cursorLngLat: [number, number] | null;
  currentZoom: number;
  sidebarVisible: boolean;
  currentSnapTarget: SnapTarget | null;
  connectMode: {
    active: boolean;
    firstLaneId: string | null;
  };
}
```

初始值：

| 字段                | 初始值    | 说明                  |
| ------------------- | --------- | --------------------- |
| `appMode`           | `drawing` | 默认绘图/编辑模式     |
| `gridEnabled`       | `true`    | 默认显示网格          |
| `snapEnabled`       | `false`   | 默认关闭吸附          |
| `cursorLngLat`      | `null`    | 鼠标经纬度            |
| `currentZoom`       | `18`      | 当前 zoom             |
| `sidebarVisible`    | `true`    | 左侧栏默认打开        |
| `currentSnapTarget` | `null`    | 绘制/拖拽实时吸附目标 |
| `connectMode`       | inactive  | lane 两步连接模式     |

默认注册图层类型：

```text
lane, junction, parkingSpace, signal, crosswalk, stopSign, speedBump,
polyline, catmullRom, bezier, arc, rect, polygon
```

未注册 type 读取时回退 `visible=true`、`locked=false`，避免新实体类型因缺少 UI 配置而默认不可见。

## UI Actions

```ts
setAppMode(mode: AppMode): void;
toggleAppMode(): void;
toggleGrid(): void;
toggleSnap(): void;
setLayerVisible(type: string, visible: boolean): void;
setLayerLocked(type: string, locked: boolean): void;
toggleLayerVisible(type: string): void;
toggleLayerLocked(type: string): void;
isLayerVisible(type: string): boolean;
isLayerLocked(type: string): boolean;
setCursorLngLat(pos: [number, number] | null): void;
setCurrentZoom(zoom: number): void;
toggleSidebar(): void;
setSnapTarget(target: SnapTarget | null): void;
toggleConnectMode(): void;
exitConnectMode(): void;
setConnectFirstLane(id: string | null): void;
```

实现要点：

- layer 写入通过 `patchLayer()` 返回新对象，保证 React selector 能感知变化。
- `setSnapTarget()` 有同值去重，避免鼠标移动时 overlay 高频重渲染。
- `toggleConnectMode()` 关闭时会清空 `firstLaneId`。
- `exitConnectMode()` 用于 ESC、Default Mode 或第二次 lane 点击提交后强制退出。

## Settings Store

`src/store/settingsStore.ts` 持久化全局设置，localStorage key 都以 `apollo-map-studio:` 开头。

```ts
interface SettingsState {
  historyLimit: number; // default 100, range 10-1000
  mapCenterLng: number; // default 116.4
  mapCenterLat: number; // default 39.9
  mapZoom: number; // default 18, range 1-22
  laneHalfWidth: number; // default 1.75, range 0.5-10
  laneArrowSpacing: number; // default 160, range 40-500
}
```

setter 会 clamp 并持久化：

- `setHistoryLimit()`：四舍五入，10-1000。
- `setMapCenter()`：经度 -180 到 180，纬度 -90 到 90。
- `setMapZoom()`：1-22，允许小数。
- `setLaneHalfWidth()`：0.5-10。
- `setLaneArrowSpacing()`：四舍五入，40-500。

导出读取函数：`readHistoryLimit()`、`readMapCenter()`、`readMapZoom()`、`readLaneHalfWidth()`、`readLaneArrowSpacing()`。这些函数供 Map 初始化或 store 初始化在 React effect 外读取。

风险点：`mapStore` 的 zundo limit 在 store 创建时读取 `readHistoryLimit()`。SettingsPanel 修改 history limit 后，当前 temporal store 不会自动重建，通常需要 reload 才完整生效。

## Action Registry

动作定义在 `src/core/actions/registry/*`。

```ts
export type ActionCategory = 'file' | 'edit' | 'view' | 'tool' | 'selection';
export type ToolStripSlot = 'selection' | 'view';

interface ActionDef {
  id: ActionId;
  label: string;
  category: ActionCategory;
  shortcut?: string;
  keybinding?: KeyBinding;
  icon?: IconType;
  inCommandPalette: boolean;
  menu?: string;
  menuOrder?: number;
  isToggle?: boolean;
  drawTool?: DrawTool;
  uiSlot?: ToolStripSlot;
  uiOrder?: number;
}
```

当前 ActionId：

```text
importApollo, exportApolloBin, exportApolloText, settings,
undo, redo, delete, toggleGrid, toggleSnap, resetLayout, commandPalette,
defaultMode, connectLanes,
tool:drawPolyline, tool:drawBezier, tool:drawArc, tool:drawRotatedRect,
tool:drawPolygon, tool:drawCatmullRom
```

helper：

- `ACTION_MAP`
- `getActionsByCategory(category)`
- `getMenuActions(menu)`：按 `menuOrder` 排序。
- `getMenuNames()`
- `getCommandPaletteActions()`
- `getKeyBindingActions()`
- `getToolAction(drawTool)`
- `getToolStripSlotActions(slot)`：按 `uiOrder` 排序。
- `matchesKeybinding(e, kb)`：大小写不敏感，Ctrl 和 Meta 等价。
- `formatShortcut(shortcut)`：Mac 保留 glyph，非 Mac 转为 `Ctrl+` / `Shift+` / `Alt+`。

快捷键规则：

```ts
interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  global?: boolean;
}
```

未声明的 modifier 不能被按下。输入控件中，只有 `global=true` 的快捷键继续生效。

## Action Dispatcher

`src/hooks/useActionDispatcher.ts` 把 registry 接到真实副作用。

```ts
interface ActionDispatcher {
  execute(actionId: ActionId): void;
  getToggleState(actionId: ActionId): boolean;
  actions: ActionDef[];
}
```

handler 映射：

- File：`pickAndImportApollo()`、`exportApolloBin()`、`exportApolloText()`、打开 Settings。
- Edit：undo/redo、删除、connect lanes。
- View：toggle grid/snap、reset layout、command palette。
- Selection：Default Mode 发送 `CANCEL` 和 `RESET`，并退出 connect mode。
- Tools：所有带 `drawTool` 的 action 自动映射为 `SELECT_TOOL`。

undo/redo 必须先：

```ts
actorRef.send({ type: 'CANCEL' });
```

再调用 `useMapStore.temporal.getState().undo/redo()`，避免实体回滚后 FSM 继续持有旧 draw/drag 上下文。

授权拦截：

- `category === 'edit' | 'tool' | 'selection'` 需要编辑权限。
- `connectLanes` 需要编辑权限。
- `execute()` 在 handler 前调用 `assertEditable(actionId)`。

当前实现中 undo/redo 也属于 edit，因此只读状态下会被拦截，防止通过历史回滚改变文档。

## Command Palette

`CommandPalette` 使用 `cmdk`，动作来自 `getCommandPaletteActions()`。

输入：

```ts
interface CommandPaletteProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onExecute(actionId: ActionId): void;
  getToggleState?(actionId: ActionId): boolean;
}
```

行为：

- 按 action category 分组。
- 执行动作后关闭并清空搜索。
- toggle action 显示选中标记。
- shortcut 通过 `formatShortcut()` 平台化显示。
- 组件内部监听 Ctrl/Cmd+K 和 Escape；全局 dispatcher 也有 `commandPalette` action，调用方应保证 open state 单一。

## 侧边栏面板

`SidebarPanelContent` 是左侧 Dockview panel 容器。当前 tab 来自 `SidebarContext`：

- `explorer` -> `MapOutline`
- `layers` -> `LayerTree`
- `search` -> `SearchPanel`
- `timeline` -> `TimelinePanel`
- `settings` -> 打开 Settings modal，然后回到 `explorer`

### MapOutline

只读结构概览：

- `entities.size` 总数。
- Apollo 顶层类型计数。
- Drawing primitives 计数。
- Health：unparented lanes、dangling junction refs。
- 底部显示 `MapMetadataForm`，读取导入 Apollo header。

### LayerTree

使用 `react-arborist` 和 `buildTree(entities)`：

- 点击实体节点调用 `onSelect(entityId)`，由容器发送 FSM `SELECT_ENTITY`。
- 可新建 Road 和 RSU。
- 拖拽前用 `canReparent()` 判断 drop 是否允许。
- drop 后调用 `reparentEntity()`。
- rejected 当前只 `console.warn`，没有 toast。

### SearchPanel

对 `entities` 线性扫描，按 ID 或 `entityType` 子串匹配，最多返回 200 条。点击结果选择实体。它没有索引层，超大图复杂查询需要另建索引。

### TimelinePanel

当前是本地 state 的 UI 原型面板：duration、currentTime、tracks、播放控制都在组件内部；track 数据是静态示例，不接 `mapStore`。

### SettingsPanel

modal 面板，Escape 或 backdrop 关闭。写入 `settingsStore`。Reset Layout 删除 `ams-layout-v2` 并 reload。默认视口和 history limit 的设置都存在“需要 reload 才完整应用”的初始化时机限制。

## Inspector 表单

入口是 `EntityForm({ entity })`。它按 `entity.entityType` 分发：

- `lane` -> `LaneForm` -> `SchemaForm(LaneInspectorSchema)`
- `junction`、`parkingSpace`、`signal`、`stopSign`、`road`、`area`、`barrierGate` 等 -> 手写属性表单
- `pncJunction` -> passage group / passage 编辑
- `overlap` -> 参与对象摘要、lane `isMerge` 覆盖、region overlap pin
- 其它绘制对象 -> `DrawingForm`

`SchemaForm` 合同：

1. schema read adapter 生成默认值。
2. 只有 `entity.id` 变化时 reset。
3. 同 ID drift 用 `diffFormAgainstEntity()` 逐字段同步。
4. `watch()` 自动保存前用 `shouldPersistForm()` 去重。
5. `mode: 'onChange'` 是测试固定的实时校验行为。

风险点：

- `SignalForm` 改 type 会重新生成 signal geometry。
- `OverlapForm` 写 `_userOverrides`，会影响后续 overlap reconcile。
- Crosswalk、SpeedBump、YieldSign、ClearArea、RSU 等当前主要是只读摘要，几何由 canvas 编辑。

## License Renderer UI

### licenseStore

```ts
interface LicenseStoreState {
  state: LicenseState;
  initialized: boolean;
  hydrate(): Promise<void>;
  setState(s: LicenseState): void;
  promptActivation: () => void;
  registerPromptActivation(fn: () => void): void;
}
```

非 Electron 浏览器预览的初始状态是 permissive trial。Electron 中 `hydrate()` 会通过 `licenseBridge.getState()` 从主进程覆盖。

selectors：

- `selectCanEdit(s)`
- `selectStatus(s)`

### useLicenseSync

挂载后：

1. 调用 `hydrate()`。
2. 订阅 `licenseBridge.onChange(setState)`。
3. window focus 时重新 hydrate，覆盖休眠唤醒或 timer miss。
4. 卸载时取消订阅。

### LicenseBanner

顶部 banner：

- 永久 activated 不显示。
- trial 剩余大于 3 天不显示。
- activated 剩余大于 14 天不显示。
- expired、tampered、machine_mismatch、invalid 等只读状态显示提示。
- Activate / Manage license 调用 `promptActivation()`。

### ActivationDialog

弹窗行为：

- mount 时注册 `promptActivation()`。
- 显示并复制 `machineCode`。
- 粘贴 activation code 后调用 `licenseBridge.activate()`。
- 成功时关闭，失败时显示错误。
- tampered 状态额外提示修正系统时钟和授权文件后重新激活。

## 测试参考

相关测试：

- `src/store/__tests__/uiStore.test.ts`
- `src/store/__tests__/settingsStore.test.ts`
- `src/core/actions/__tests__/registry.test.ts`
- `src/hooks/__tests__/useActionDispatcher.test.ts`
- `src/hooks/__tests__/undoCancel.test.ts`
- `src/components/layout/panels/__tests__/InspectorForms.test.ts`
- `src/components/layout/panels/__tests__/overlapInspector.test.ts`

关键断言包括默认 UI 状态、layer fallback、Action ID 唯一性、菜单排序、所有 tool action 都有 drawTool、快捷键 modifier 匹配、平台化 shortcut 展示，以及 undo/redo 前置 CANCEL。
