---
title: licenseStore — 渲染端许可证状态
description: 镜像 Electron 主进程的许可证状态机，作为渲染端 banner / 激活弹窗 / 只读守卫的唯一真值来源。
---

# `licenseStore` — 渲染端许可证状态

> 源码：`src/store/licenseStore.ts` · 65 行 · 不参与撤销

## 用途

`licenseStore` 是一个渲染进程内的 Zustand 单例，作用是把 Electron 主进程许可证管理器（`electron/license/manager.cts`）的状态镜像到 React 树。

它负责三件事：

1. **状态镜像**：通过 `licenseBridge.onChange` 订阅主进程的 `license:state` 广播，更新 `state`。
2. **首屏 hydrate**：组件首次挂载时 `await licenseBridge.getState()`，避免 banner 闪烁。
3. **解耦激活弹窗**：`promptActivation` 使用注册式回调——`ActivationDialog` 挂载时通过 `registerPromptActivation` 替换默认 no-op，让任何 store 调用方（例如 `editable-guard`）都能拉起弹窗，而不需要直接 import 组件。

浏览器预览构建（无 Electron）下走 `licenseBridge` 的 fallback 路径，得到一个永恒 `trial` 状态，`canEdit=true`，dev 不卡死。

## 公共 API

| 符号                       | 类型     | 签名                                      | 摘要                                         |
| -------------------------- | -------- | ----------------------------------------- | -------------------------------------------- |
| `useLicenseStore`          | hook     | `() => LicenseStoreState`                 | Zustand store hook                           |
| `selectCanEdit`            | selector | `(s: LicenseStoreState) => boolean`       | 当前是否允许编辑                             |
| `selectStatus`             | selector | `(s: LicenseStoreState) => LicenseStatus` | 状态字符串投影                               |
| `hydrate`                  | action   | `() => Promise<void>`                     | 主动从主进程拉取一次状态                     |
| `setState`                 | action   | `(s: LicenseState) => void`               | 推送状态（由 `licenseBridge.onChange` 调用） |
| `promptActivation`         | action   | `() => void`                              | 触发激活弹窗（默认 no-op）                   |
| `registerPromptActivation` | action   | `(fn: () => void) => void`                | `ActivationDialog` 挂载时替换默认 no-op      |

## 详细条目

### `interface LicenseStoreState`

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

- `state`：完整 `LicenseState`（见 [`license-bridge`](../lib/license-bridge.md)）。
- `initialized`：`hydrate` 完成或第一次 `setState` 之后为 `true`；banner 在该值为 `false` 时呈现 skeleton。
- `promptActivation` / `registerPromptActivation`：解耦弹窗组件的回调注册槽。

### 初始 state

```ts
const initial: LicenseState = {
  status: 'trial',
  canEdit: true,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 7,
  hoursRemaining: 7 * 24,
  license: null,
  checkedAt: 0,
  reason: '',
};
```

`canEdit: true` 是 **故意** 的——网页预览或 SSR 阶段不应该锁住编辑器。真值由 `hydrate` 在 Electron 进程内获取后覆盖。

文件位置：`licenseStore.ts:23-34`。

### `hydrate()` —— 首屏拉取

```ts
async hydrate() {
  const next = await licenseBridge.getState();
  set({ state: next, initialized: true });
}
```

应在 `App.tsx` 或 `LicenseProvider` 的最外层 `useEffect` 中触发。后续状态变化通过 `licenseBridge.onChange(setState)` 自动推送，不需要重复调用。

### `setState(s)` —— 主进程广播入口

由 `LicenseProvider` 内部的 `useEffect` 调用：

```ts
useEffect(() => {
  const off = licenseBridge.onChange((s) => useLicenseStore.getState().setState(s));
  return off;
}, []);
```

设置 `initialized: true` 以防 `hydrate` 还没完成就先收到广播。

### `promptActivation()` —— 默认 no-op

初始实现是空函数。`ActivationDialog` 在 `useEffect` 内调用 `registerPromptActivation((open) => setOpen(true))`，把默认值替换成"打开弹窗"。任何 store 写入路径（如 `editable-guard.assertEditable`）都能调用 `useLicenseStore.getState().promptActivation()` 拉起弹窗，不再需要把 dialog props 拖过整个组件树。

### `registerPromptActivation(fn)`

```ts
registerPromptActivation(fn) {
  set({ promptActivation: fn });
}
```

注意：不在 mount 阶段做"原子加载"——同一时刻可能存在多个 `ActivationDialog` 实例（路由切换的中间态），最后挂载的覆盖前一个，符合 React 的 `useEffect` 卸载顺序。

### Selectors

```ts
export function selectCanEdit(s: LicenseStoreState): boolean {
  return s.state.canEdit;
}
export function selectStatus(s: LicenseStoreState): LicenseState['status'] {
  return s.state.status;
}
```

外部组件应优先使用 selector 而非整对象——`canEdit` 极少变更，selector 让 `useLicenseStore(selectCanEdit)` 在不相关字段（如 `daysRemaining` 每分钟广播一次）变化时不重渲染。

## 内部状态

- `state` 字段是完整 `LicenseState`，由主进程构造，渲染端不可信任客户端字段（攻击者改 React state 不会改变后端授权）。
- 真正的 enforcement 在 store mutators / `editable-guard` 内：`assertEditable` 直接读 `useLicenseStore.getState()`，绕过组件层。

## 副作用

- 通过 `licenseBridge` 间接访问 `window.apolloMapStudioLicense`（见 [`preload.cts`](../electron/preload.md)）。
- `hydrate` 是异步 IPC 调用，预期 < 5ms。
- 不写 localStorage——状态不在渲染进程持久化。

## 测试覆盖

无独立单测。许可证 e2e 流程在 `electron/license/__tests__/manager.spec.ts`（如果存在）覆盖；渲染端 banner 行为由组件层 storybook / RTL 测试覆盖。

## 调用方

- `src/components/license/LicenseProvider.tsx` — 注册 onChange + 调用 `hydrate`
- `src/components/license/LicenseBanner.tsx` — `useLicenseStore(selectStatus, selectDaysRemaining)`
- `src/components/license/ActivationDialog.tsx` — 调用 `registerPromptActivation`
- `src/lib/editable-guard.ts` — `useLicenseStore.getState()` 读 `canEdit`
- `src/store/mapStore.ts` — 写入前 `if (!isEditable()) return;`

## 源码索引

| 行    | 内容                   |
| ----- | ---------------------- |
| 13–21 | `LicenseStoreState`    |
| 23–34 | `initial` 默认值       |
| 36–54 | `useLicenseStore` 工厂 |
| 56–60 | `selectCanEdit`        |
| 62–64 | `selectStatus`         |

## LicenseProvider 完整模式

```tsx
// src/components/license/LicenseProvider.tsx
export function LicenseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const store = useLicenseStore.getState();
    void store.hydrate();
    const off = licenseBridge.onChange((s) => {
      useLicenseStore.getState().setState(s);
    });
    return off;
  }, []);
  return <>{children}</>;
}
```

挂载在 React 树最外层（`App.tsx` 内）。`hydrate()` 异步触发 IPC，`onChange` 注册 listener。`useEffect` cleanup 调用返回的 unsubscribe 函数。

## ActivationDialog 注册模式

```tsx
// src/components/license/ActivationDialog.tsx
export function ActivationDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    useLicenseStore.getState().registerPromptActivation(() => setOpen(true));
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* ... activation form ... */}
    </Dialog>
  );
}
```

`registerPromptActivation` 在挂载时一次性注册，注册后 store 内任何写入路径的 `editable-guard` 都能拉起本 dialog。

## Banner 倒计时

```tsx
function Banner() {
  const status = useLicenseStore(selectStatus);
  const days = useLicenseStore((s) => s.state.daysRemaining);
  if (status === 'trial' && days !== null && days <= 3) {
    return <div>Trial ends in {days} day(s) — activate to continue editing.</div>;
  }
  if (status === 'expired_trial') {
    return (
      <div>
        Trial expired.{' '}
        <button onClick={() => useLicenseStore.getState().promptActivation()}>Activate</button>
      </div>
    );
  }
  // ...
}
```

`daysRemaining` 由主进程的 60s 定时器更新；React 通过 `setState` 自动 re-render。

## 安全注记

- **state 字段不可信**——攻击者可以从 React DevTools 改 state，但 mutator 仍走 `editable-guard.assertEditable()` 直接读 zustand。
- **真正的 enforcement 在 mutator 调用栈** —— store 状态只是"展示"，不是"权限"。
- **生产构建** 中 React DevTools 被禁用（除非用户手动注入），但本机用户始终能改自己的 state——这是设计内能接受的范围（License 防 casual piracy，不防 reverse engineering）。

## 参见

- [`license-bridge`](../lib/license-bridge.md) — IPC 包装
- [`editable-guard`](../lib/editable-guard.md) — store mutator 守卫
- [`electron/license-manager`](../electron/license-manager.md) — 主进程状态机
- [`preload.cts`](../electron/preload.md) — `apolloMapStudioLicense` 暴露
- `src/components/license/LicenseProvider.tsx` — 集成点
- `src/components/license/ActivationDialog.tsx` — 弹窗
