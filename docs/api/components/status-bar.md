---
title: StatusBar
description: 24px 高底部状态条——显示应用模式、FSM 状态、实体计数、Apollo 文件信息、Grid/Snap 指示与光标地理坐标 + Zoom。
---

# StatusBar

> 源码：`src/components/layout/StatusBar.tsx`

## 用途与 UX 角色

`StatusBar` 是 WorkspaceLayout 最下方的 24px 信息条。它没有交互 affordance，**仅展示**：

**左半区：**

- `Mode: 绘图 / 场景` — 当前 `appMode`（`useUIStore`）
- FSM 状态指示灯 + 文本（`idle` / `Selected` / `Dragging` / `Draw: Polyline` …），绘图状态下圆点 cyan + `animate-pulse`
- `Entities: N` — 实体计数
- 若已导入 Apollo 地图：`<FaMap /> {filename}` + `lane=N road=N` 计数；hover 显示完整 PROJ 字符串

**右半区：**

- Grid 指示器：根据 `uiStore.gridEnabled` cyan / 灰
- Snap 指示器：根据 `uiStore.snapEnabled` cyan / 灰
- 光标地理坐标：`{lng.toFixed(6)}, {lat.toFixed(6)}`（仅当鼠标在地图上时）
- Zoom：`{currentZoom.toFixed(1)}x`

## 组件接口

```ts
interface StatusBarProps {
  mode?: string; // FSM 状态名
  entityCount?: number; // 实体数量
}
```

| Prop          | 类型     | 默认值   | 说明                     |
| ------------- | -------- | -------- | ------------------------ |
| `mode`        | `string` | `'idle'` | FSM `s.value` 字符串     |
| `entityCount` | `number` | `0`      | `mapStore.entities.size` |

`MODE_LABELS` 文件内常量映射：

```ts
{
  idle: 'Idle',
  selected: 'Selected',
  editingPoint: 'Dragging',
  drawPolyline: 'Draw: Polyline',
  drawCatmullRom: 'Draw: CatmullRom',
  drawBezier: 'Draw: Bezier',
  drawArc: 'Draw: Arc',
  drawRotatedRect: 'Draw: Rectangle',
  drawPolygon: 'Draw: Polygon',
}
```

未列出的 mode 直接 fallback 显示原字符串。

## 内部状态

| 钩子                         | 用途                                             |
| ---------------------------- | ------------------------------------------------ |
| `useUIStore(s.cursorLngLat)` | 光标地理坐标 `[lng, lat] \| null`                |
| `useUIStore(s.currentZoom)`  | MapLibre 当前 zoom level                         |
| `useUIStore(s.gridEnabled)`  | Grid 显示开关                                    |
| `useUIStore(s.snapEnabled)`  | Snap 开关                                        |
| `useUIStore(s.appMode)`      | 应用模式 (drawing/scene)                         |
| `useApolloMapStore(s.info)`  | Apollo 地图导入信息（`null` 时不渲染 Apollo 段） |

无 effect。

## 副作用

无 effect 或 ref；纯派生展示。光标坐标和 zoom 由 `useMapEventRouter` / `useMapLibreInit` 在 hook 层写入 uiStore，StatusBar 只订阅。

## 渲染骨架

```jsx
<div className="h-6 bg-ams-bg-base border-t border-ams-border-subtle flex items-center px-2 text-[10px] text-ams-text-muted shrink-0">
  <div className="flex items-center gap-3">{/* 左半区 */}</div>
  <div className="flex-1" />
  <div className="flex items-center gap-4">{/* 右半区 */}</div>
</div>
```

## 性能注释

- **细粒度 selector**：每个 `useUIStore(s => s.field)` 只在该字段变化时触发 re-render；不会因 cursor 移动重画 grid 段。
- **`cursorLngLat` 高频写入**：每次 mousemove 都更新坐标，但 React 重渲只刷新 StatusBar 内的小段——其他组件不订阅。
- **设计 token 迁移示范**：StatusBar 与 ActivityBar 一同是 `ams-*` 色板的早期采纳者；详见 [架构](/architecture/) "Design tokens" 章节。

## 已知缺口

- **i18n 未实现**：`Mode:` / `Entities:` 等 UI label 是英文硬编码。中文标签 `绘图` / `场景` 来自 ModeToggle 的本地化（项目目前没用 i18next）。
- **没有错误状态指示**：FSM 异常或 worker 失败时 StatusBar 不会染红。

## 源码索引

| 关注点              | 文件位置                         |
| ------------------- | -------------------------------- |
| 组件主体            | `StatusBar.tsx:22-122`           |
| `MODE_LABELS`       | `StatusBar.tsx:10-20`            |
| 左半区              | `StatusBar.tsx:35-78`            |
| 右半区              | `StatusBar.tsx:82-120`           |
| `cursorLngLat` 写入 | `src/hooks/useMapEventRouter.ts` |
| `currentZoom` 写入  | `src/hooks/useMapLibreInit.ts`   |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — 父组件
- [`uiStore`](/api/store/store-ui) — `gridEnabled` / `snapEnabled` / `cursorLngLat` / `currentZoom` / `appMode`
- [`apolloMapStore`](/api/store/) — `info`
- [架构](/architecture/) — Design tokens

## 英文镜像

[/en/api/components/status-bar](/en/api/components/status-bar)
