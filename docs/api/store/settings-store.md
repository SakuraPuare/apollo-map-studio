---
title: settingsStore — 用户偏好持久化
description: 历史限制、地图初始视角、车道默认半宽等用户偏好；带 localStorage 持久化与边界裁剪。
---

# `settingsStore` — 用户偏好持久化

> 源码：`src/store/settingsStore.ts` · 149 行 · 不参与撤销

## 用途

`settingsStore` 是一个 **持久化的** Zustand 单例，承载所有"用户偏好"——这类设置不应进入 Ctrl+Z 历史，但应在重启后保留。

它持久化到 `localStorage`（key 前缀 `apollo-map-studio:`），并在每次写入时做范围裁剪，防止脏数据破坏 UI。SSR / 隐私模式 / 浏览器禁用 localStorage 时退化为内存存储。

字段分四档：

| 档位     | 字段                                        | 单位        | 默认                        |
| -------- | ------------------------------------------- | ----------- | --------------------------- |
| 撤销限制 | `historyLimit`                              | 步          | 100                         |
| 地图视角 | `mapCenterLng` / `mapCenterLat` / `mapZoom` | °, °, level | 见 `mapConstants`           |
| 车道几何 | `laneHalfWidth`                             | 米          | 1.75                        |
| 渲染装饰 | `laneArrowSpacing`                          | 像素        | `LANE_ARROW_SYMBOL_SPACING` |

## 公共 API

### Store hook

| 符号               | 类型      | 签名                                    | 摘要               |
| ------------------ | --------- | --------------------------------------- | ------------------ |
| `useSettingsStore` | hook      | `() => SettingsState & SettingsActions` | Zustand store hook |
| `SettingsState`    | interface | 见下                                    | 6 字段 state       |
| `SettingsActions`  | interface | 见下                                    | 5 setter           |

### Setter

| 名称                         | 签名                       | 备注                             |
| ---------------------------- | -------------------------- | -------------------------------- |
| `setHistoryLimit(value)`     | `(number) => void`         | 裁剪到 `[10, 1000]`，整数        |
| `setMapCenter(lng, lat)`     | `(number, number) => void` | 裁剪到 `[-180,180]` × `[-90,90]` |
| `setMapZoom(value)`          | `(number) => void`         | 裁剪到 `[1, 22]`，浮点           |
| `setLaneHalfWidth(value)`    | `(number) => void`         | 裁剪到 `[0.5, 10]`，米           |
| `setLaneArrowSpacing(value)` | `(number) => void`         | 裁剪到 `[40, 500]`，整数像素     |

### 启动期读函数

供 `useEffect` 之外（`map.ts` 初始化）静态调用：

| 名称                     | 返回               | 说明                   |
| ------------------------ | ------------------ | ---------------------- |
| `readHistoryLimit()`     | `number`           | 从 LS 读，否则默认 100 |
| `readMapCenter()`        | `[number, number]` | `[lng, lat]`           |
| `readMapZoom()`          | `number`           | level                  |
| `readLaneHalfWidth()`    | `number`           | 米                     |
| `readLaneArrowSpacing()` | `number`           | 像素                   |

### 范围常量

```ts
DEFAULT_HISTORY_LIMIT = 100;
MIN_HISTORY_LIMIT = 10;
MAX_HISTORY_LIMIT = 1000;

MIN_MAP_ZOOM = 1;
MAX_MAP_ZOOM = 22;

MIN_LANE_HALF_WIDTH = 0.5;
MAX_LANE_HALF_WIDTH = 10;

MIN_LANE_ARROW_SPACING = 40;
MAX_LANE_ARROW_SPACING = 500;
```

供 Settings 面板的 `<Slider min max>` 直接消费。

## localStorage key 一览

| key                                  | 字段               |
| ------------------------------------ | ------------------ |
| `apollo-map-studio:historyLimit`     | `historyLimit`     |
| `apollo-map-studio:mapCenterLng`     | `mapCenterLng`     |
| `apollo-map-studio:mapCenterLat`     | `mapCenterLat`     |
| `apollo-map-studio:mapZoom`          | `mapZoom`          |
| `apollo-map-studio:laneHalfWidth`    | `laneHalfWidth`    |
| `apollo-map-studio:laneArrowSpacing` | `laneArrowSpacing` |

注意所有 key 都用同一个 namespace 前缀，多 app 同源共存时无冲突。

## 详细条目

### `readNum(key, fallback, min, max)` — 内部辅助

```ts
function readNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
    }
  } catch {
    /* SSR / 隐私模式 */
  }
  return fallback;
}
```

每个公开的 `readXxx()` 都委托给它，行为一致：

- localStorage 不可用 → 走 fallback
- 值非数字或越界 → 裁剪 / fallback

### `useSettingsStore` 工厂

工厂体内首次执行时调用 `readMapCenter()` / `readMapZoom()` 等同步读取——这意味着 store 的初始值已经是 LS 值，不需要任何 `useEffect` 来 hydrate。代价是 store 在 SSR 阶段会试图读 `localStorage`；`readNum` 的 try/catch 已经覆盖。

文件位置：`settingsStore.ts:107-148`。

### setter 的统一写法

```ts
setHistoryLimit(value) {
  const v = Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(value)));
  set({ historyLimit: v });
  persist(HISTORY_LIMIT_KEY, v);
}
```

每个 setter：

1. 裁剪到合法区间
2. 写入 store state
3. 写入 localStorage

`persist` 也封装了 try/catch——LS 写入失败不会冒泡到调用方，但 store 内部值依然更新（一致性优先）。

### 与 `mapStore` 的耦合

`historyLimit` 通过 `temporal.partialize` 反射给 zundo——每次 `setHistoryLimit` 后，`mapStore.temporal.getState().setState({ limit: v })` 应被同步触发，由调用方（`SettingsPanel.tsx`）负责。

### 与 `laneHalfWidth` 的耦合

`laneHalfWidth` 是 `entityOps.createEntity` 的可选参数，画 Lane 时若未传 `options.laneHalfWidth` 会读默认值；Settings 面板里的滑块直接修改该字段，下一笔新建生效，不会回写历史 lane 的 sample width。

## 副作用

- localStorage 读写（被 try/catch 保护）
- 没有 IPC、没有定时器
- 没有跨标签同步：另一个标签页改了值不会推到当前页（产品决定——避免 zundo 历史在标签间错位）

## 测试覆盖

`src/store/__tests__/settingsStore.test.ts`——验证：

- 边界裁剪（zoom = 1000 → 22）
- localStorage 不可用时 fallback
- setter 触发 persist

## 调用方

- `src/components/layout/panels/SettingsPanel.tsx` — 4 个滑块直接绑定 setter
- `src/store/mapStore.ts` — 启动时读 `historyLimit` 配置 zundo limit
- `src/components/map/MapCanvas.tsx` — 初始化时读 `mapCenter` / `mapZoom`
- `src/lib/entityOps/edit.ts` — `createEntity` 默认 lane 宽度回退

## 源码索引

| 行      | 内容                                      |
| ------- | ----------------------------------------- |
| 11–16   | localStorage key 常量                     |
| 20–31   | 范围常量                                  |
| 35–46   | `readNum` 辅助                            |
| 48–78   | `readHistoryLimit` / `readMapCenter` / 等 |
| 82–97   | `SettingsState` / `SettingsActions`       |
| 99–105  | `persist` 辅助                            |
| 107–148 | `useSettingsStore` 工厂                   |

## 隐私模式 / SSR 处理

`readNum` 用 try/catch 包裹 `localStorage.getItem`：

```ts
try {
  const raw = localStorage.getItem(key);
  // ...
} catch {
  /* SSR / 隐私模式 */
}
```

触发场景：

- SSR：`localStorage` 未定义
- 隐私模式：`localStorage.getItem` 可能 throw `SecurityError`
- iframe 跨域：`localStorage` 访问受限

任意失败都退化到 `fallback`。`persist()` 同样有 try/catch——写入失败不上抛。

## Store 启动时的同步读取

```ts
export const useSettingsStore = create<SettingsState & SettingsActions>()((set) => {
  const [lng, lat] = readMapCenter();
  return {
    historyLimit: readHistoryLimit(),
    mapCenterLng: lng,
    mapCenterLat: lat,
    // ...
  };
});
```

工厂体内立即调用 reader——store 创建瞬间就已 hydrate。代价：

- store 模块在 `import` 时就触发 LS 读
- SSR 环境会立即触发 try/catch（不爆，但有性能 cost）

收益：

- 消费方不需要 `useEffect(() => store.hydrate())`，省一次 re-render
- 启动期 `MapCanvas` 可直接 `readMapCenter()` 同步读

## 与 zundo 历史限制的耦合

```ts
// SettingsPanel.tsx 简化
function HistoryLimitSlider() {
  const [v, setV] = useSettingsStore((s) => [s.historyLimit, s.setHistoryLimit]);
  return (
    <Slider
      min={MIN_HISTORY_LIMIT} max={MAX_HISTORY_LIMIT}
      value={v}
      onChange={(next) => {
        setV(next);
        // 同步给 zundo
        useMapStore.temporal.getState().setState({ limit: next });
      }}
    />
  );
}
```

setter 在 store + zundo 之间手动同步—— Settings store 不知道 mapStore 的存在（避免循环依赖）。

## 与多标签页的隔离

故意 **不** 监听 `storage` 事件。如果两个标签页都打开同一个工程：

- 标签 A 改 `historyLimit = 200`
- 标签 B 不响应——继续用 100

这是产品决定：每个标签页有独立的 zundo 历史，跨标签同步会让 undo 计数错位。代价是用户在第二个标签里看到旧值，刷新即可恢复。

## 参见

- `mapStore` — `historyLimit` 的真实消费者
- `mapConstants` (`src/config/mapConstants.ts`) — 默认中心 / 默认 lane 宽
- [`apolloMapStore`](./apollo-map-store.md) — 不持久化的导入态对照组
- `src/components/layout/panels/SettingsPanel.tsx` — UI
