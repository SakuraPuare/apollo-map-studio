---
title: license-bridge — 渲染端许可证 IPC 包装
description: 包装 window.apolloMapStudioLicense（preload 暴露），统一处理浏览器 fallback；类型化 LicenseState / ActivationResult。
---

# `license-bridge` — 渲染端许可证 IPC 包装

> 源码：`src/lib/license-bridge.ts` · 106 行

## 用途

`license-bridge` 包装 `window.apolloMapStudioLicense`（由 `electron/preload.cts` 通过 `contextBridge.exposeInMainWorld` 暴露），让渲染端的其他代码不必处理 `undefined` 检查、不必关心是否在 Electron 内运行。

纯网页构建（无 Electron）下所有调用退化为永恒 trial 状态（`canEdit=true`）——dev / Storybook / 浏览器预览不会因为缺少许可证基础设施而瘫痪。

## 公共 API

| 符号               | 类型      | 签名              | 摘要                   |
| ------------------ | --------- | ----------------- | ---------------------- |
| `LicenseStatus`    | union     | 8 个状态字符串    | 渲染端许可证状态       |
| `LicenseState`     | interface | 见下              | 完整状态快照           |
| `ActivationResult` | interface | 见下              | 激活结果               |
| `licenseBridge`    | const     | `LicenseApi` 实例 | 默认导出对象，5 个方法 |
| `isDesktopBuild()` | fn        | `() => boolean`   | 是否在 Electron 内     |

### `type LicenseStatus`

```ts
export type LicenseStatus =
  | 'trial'
  | 'activated'
  | 'expired_trial'
  | 'expired_license'
  | 'tampered'
  | 'machine_mismatch'
  | 'invalid'
  | 'not_started';
```

| 状态               | canEdit | 触发条件                              |
| ------------------ | ------- | ------------------------------------- |
| `trial`            | true    | 首次启动起 7 天内                     |
| `activated`        | true    | 已激活、有效期内                      |
| `expired_trial`    | false   | 7 天试用过期                          |
| `expired_license`  | false   | 许可证过期                            |
| `tampered`         | false   | 时钟回退 / HMAC 不匹配 / 机器指纹漂移 |
| `machine_mismatch` | false   | 许可证绑定的机器码 != 当前            |
| `invalid`          | false   | 许可证签名验证失败                    |
| `not_started`      | false   | 系统时间 < trialStart（防止时钟超前） |

### `interface LicenseState`

```ts
export interface LicenseState {
  status: LicenseStatus;
  canEdit: boolean;
  machineCode: string; // 当前机器的 16 字符码
  trialStart: number; // 试用起始（epoch ms）
  trialEnd: number; // 试用结束（epoch ms）
  daysRemaining: number | null; // 试用 / 许可剩余天数（null = 永久）
  hoursRemaining: number | null; // 同上，小时
  license: { id: string; name: string; issued: number; expires: number } | null;
  checkedAt: number; // 主进程上次校验时间
  reason: string; // 人类可读的状态说明
}
```

### `interface ActivationResult`

```ts
export interface ActivationResult {
  ok: boolean;
  state: LicenseState; // 激活后的状态（无论成功失败）
  errorCode?:
    | 'invalid_format'
    | 'invalid_signature'
    | 'machine_mismatch'
    | 'expired'
    | 'replay'
    | 'storage_error'
    | 'unknown';
  errorMessage?: string;
}
```

`replay` —— 重放保护：同 `lic` id 已存在且新 token 的 expires 更早。

### `interface LicenseApi`（内部）

```ts
interface LicenseApi {
  getState(): Promise<LicenseState>;
  getMachineCode(): Promise<string>;
  activate(code: string): Promise<ActivationResult>;
  deactivate(): Promise<LicenseState>;
  onChange(handler: (s: LicenseState) => void): () => void;
}
```

## 详细条目

### `licenseBridge.getState()`

```ts
async getState() {
  return window.apolloMapStudioLicense?.getState() ?? Promise.resolve(fallbackState());
}
```

主进程返回的 `LicenseState`。浏览器构建走 `fallbackState()`：

```ts
{
  status: 'trial',
  canEdit: true,
  machineCode: 'WEB-NO-LICENSE',
  trialEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
  // ...
  reason: 'Browser preview — licensing disabled.',
}
```

### `licenseBridge.getMachineCode()`

主进程的 16 字符机器码，浏览器构建返回 `'WEB-NO-LICENSE'`。

### `licenseBridge.activate(code)`

```ts
async activate(code: string) {
  if (!window.apolloMapStudioLicense) {
    return {
      ok: false,
      state: fallbackState(),
      errorCode: 'unknown',
      errorMessage: 'Activation is only available in the desktop build.',
    };
  }
  return window.apolloMapStudioLicense.activate(code);
}
```

唯一 **不应静默成功** 的 fallback——浏览器里激活毫无意义，必须明确告知用户"不在桌面构建"。

### `licenseBridge.deactivate()`

清除已存许可证；浏览器构建仍返回 `fallbackState()`。

### `licenseBridge.onChange(handler)`

```ts
onChange(handler) {
  return window.apolloMapStudioLicense?.onChange(handler) ?? (() => undefined);
}
```

订阅主进程的 `license:state` IPC 广播。返回的 unsubscribe 函数在 fallback 下是 no-op。组件应在 `useEffect` 卸载时调用：

```tsx
useEffect(() => {
  const off = licenseBridge.onChange((s) => useLicenseStore.getState().setState(s));
  return off;
}, []);
```

### `isDesktopBuild()`

```ts
export function isDesktopBuild(): boolean {
  return typeof window !== 'undefined' && Boolean(window.apolloMapStudioLicense);
}
```

给组件渲染分支用——浏览器构建里隐藏"激活"按钮、显示"Desktop only"提示。

## 全局类型扩展

```ts
declare global {
  interface Window {
    apolloMapStudioLicense?: LicenseApi;
  }
}
```

让 TypeScript 在所有 `.ts` 文件里直接看到 `window.apolloMapStudioLicense` 类型——不需要每个调用方都重新声明。

## 副作用

- 写 `window` 全局类型扩展（编译期）
- 调用方法时通过 `ipcRenderer.invoke` 触达主进程
- `onChange` 在 listener 注册时占用一个 IPC channel

## 测试覆盖

无独立测试。被 `licenseStore` 间接覆盖。可以用 vitest 的 `vi.stubGlobal('window.apolloMapStudioLicense', { ... })` 提供 mock。

## 调用方

- `src/store/licenseStore.ts` — `hydrate()` / `setState` / `onChange`
- `src/components/license/ActivationDialog.tsx` — `activate(code)`
- `src/components/license/LicenseBanner.tsx` — `getMachineCode` 用于复制按钮

## 源码索引

| 行      | 内容                 |
| ------- | -------------------- |
| 11–19   | `LicenseStatus`      |
| 21–32   | `LicenseState`       |
| 34–46   | `ActivationResult`   |
| 48–54   | `LicenseApi`         |
| 56–60   | `Window` 类型扩展    |
| 62–75   | `fallbackState()`    |
| 77–101  | `licenseBridge` 实例 |
| 103–105 | `isDesktopBuild()`   |

## fallbackState() 完整字段

```ts
function fallbackState(): LicenseState {
  return {
    status: 'trial',
    canEdit: true,
    machineCode: 'WEB-NO-LICENSE',
    trialStart: Date.now(),
    trialEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
    daysRemaining: 7,
    hoursRemaining: 7 * 24,
    license: null,
    checkedAt: Date.now(),
    reason: 'Browser preview — licensing disabled.',
  };
}
```

每次调用都返回新对象（带 `Date.now()`）——不是 const，避免"hydrate 多次后 trial 时间不变"误导测试。

## 完整 `licenseBridge` 实现

```ts
export const licenseBridge: LicenseApi = {
  async getState() {
    return window.apolloMapStudioLicense?.getState() ?? Promise.resolve(fallbackState());
  },
  async getMachineCode() {
    return window.apolloMapStudioLicense?.getMachineCode() ?? Promise.resolve('WEB-NO-LICENSE');
  },
  async activate(code: string) {
    if (!window.apolloMapStudioLicense) {
      return {
        ok: false,
        state: fallbackState(),
        errorCode: 'unknown',
        errorMessage: 'Activation is only available in the desktop build.',
      };
    }
    return window.apolloMapStudioLicense.activate(code);
  },
  async deactivate() {
    return window.apolloMapStudioLicense?.deactivate() ?? Promise.resolve(fallbackState());
  },
  onChange(handler) {
    return window.apolloMapStudioLicense?.onChange(handler) ?? (() => undefined);
  },
};
```

`?.xxx() ?? Promise.resolve(...)` 的统一模式 —— 既兼容 Electron / 浏览器，又保持 Promise 接口。

## 单测 mock 模式

```ts
import { vi } from 'vitest';

beforeEach(() => {
  vi.stubGlobal(
    'window',
    Object.assign(globalThis, {
      apolloMapStudioLicense: {
        getState: vi.fn().mockResolvedValue({
          /* mock state */
        }),
        getMachineCode: vi.fn().mockResolvedValue('TEST-MACHINE'),
        activate: vi.fn().mockResolvedValue({
          ok: true,
          state: {
            /* ... */
          },
        }),
        deactivate: vi.fn().mockResolvedValue({
          /* ... */
        }),
        onChange: vi.fn().mockReturnValue(() => undefined),
      },
    }),
  );
});
```

vitest 的 `vi.stubGlobal` + jsdom 环境足以验证 `licenseStore.hydrate()` / `setState` / 等行为。

## 与 Electron 真实路径的差异

| 操作             | Electron                      | 浏览器 fallback                            |
| ---------------- | ----------------------------- | ------------------------------------------ |
| `getState`       | IPC roundtrip ~5ms            | 立即 Promise.resolve                       |
| `getMachineCode` | 主进程缓存值，~1ms            | `'WEB-NO-LICENSE'`                         |
| `activate`       | parseToken + verify + storage | 直接 `{ ok: false, errorCode: 'unknown' }` |
| `deactivate`     | 删 3 个文件                   | 立即 Promise.resolve                       |
| `onChange`       | 注册 IPC listener             | 返回 no-op unsubscribe                     |

唯一一个 fallback **不静默成功** 的接口是 `activate`——产品决定：浏览器里告诉用户"无法激活"，而不是假装成功。

## 参见

- [`licenseStore`](../store/license-store.md) —— React state 镜像
- [`editable-guard`](./editable-guard.md) —— store mutator 守卫
- [`preload.cts`](../electron/preload.md) —— 暴露 `apolloMapStudioLicense`
- [`license-manager`](../electron/license-manager.md) —— 主进程状态机
- `src/components/license/*` —— UI 消费方
