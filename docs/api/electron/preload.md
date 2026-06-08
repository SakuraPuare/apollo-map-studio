---
title: electron/preload.cts — contextBridge IPC 桥
description: 通过 contextBridge.exposeInMainWorld 暴露 apolloMapStudio / apolloMapStudioLicense；封装 app、窗口、native menu 与 license IPC。
---

# `electron/preload.cts` — contextBridge IPC 桥

> 源码：`electron/preload.cts` · 93 行 · CommonJS 模块（`.cts`）

## 用途

`preload.cts` 在 Chromium sandbox 内运行（`sandbox: true`），可访问 Electron 的安全子集（`ipcRenderer` 等）。它通过 `contextBridge.exposeInMainWorld` 把两个对象注入到渲染端的 `window`：

1. `window.apolloMapStudio` —— app 信息、Help、窗口控制、窗口状态订阅、native menu action 订阅
2. `window.apolloMapStudioLicense` —— 许可证 IPC 客户端

渲染端通过 `src/lib/app-bridge.ts` 与 `src/lib/license-bridge.ts` 包装这些 window 对象，把"可能不存在"（浏览器构建）的边界处理掉。

## contextBridge 暴露 #1: `apolloMapStudio`

```ts
contextBridge.exposeInMainWorld('apolloMapStudio', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getAppInfo() {
    return ipcRenderer.invoke(APP_IPC.GET_INFO);
  },
  openHelp() {
    return ipcRenderer.invoke(APP_IPC.OPEN_HELP);
  },
  getWindowState() {
    return ipcRenderer.invoke(APP_IPC.GET_WINDOW_STATE);
  },
  minimizeWindow() {
    return ipcRenderer.invoke(APP_IPC.WINDOW_MINIMIZE);
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke(APP_IPC.WINDOW_TOGGLE_MAXIMIZE);
  },
  closeWindow() {
    return ipcRenderer.invoke(APP_IPC.WINDOW_CLOSE);
  },
  onWindowStateChange(handler) {
    // register app:window-state listener, return unsubscribe
  },
  onNativeMenuAction(handler) {
    // register app:native-menu-action listener, return unsubscribe
  },
});
```

app/runtime、Help、窗口控制与 native menu action 的最小桥接面，给 `appBridge` 使用：

```ts
window.apolloMapStudio?.platform; // 'darwin' | 'linux' | 'win32'
window.apolloMapStudio?.versions; // { chrome: '120.0...', electron: '41.0.0', node: '20...' }
await window.apolloMapStudio?.getAppInfo?.();
await window.apolloMapStudio?.openHelp?.();
```

注意：渲染端通过 `?.` 安全访问—— 浏览器构建里 `window.apolloMapStudio` 不存在。

## contextBridge 暴露 #2: `apolloMapStudioLicense`

### IPC 通道常量

```ts
const STATUS_BROADCAST_CHANNEL = 'license:state';
const LICENSE_IPC = {
  GET_STATE: 'license:get-state',
  GET_MACHINE_CODE: 'license:get-machine-code',
  ACTIVATE: 'license:activate',
  DEACTIVATE: 'license:deactivate',
} as const;
```

每个值与 `electron/license/manager.cts` 的同名常量必须保持一致——两份独立常量是因为 `manager.cts` 跑在主进程、`preload.cts` 跑在 sandbox，不能共享 import（preload 受限的 module 解析）。

### `licenseApi` 实例

```ts
const licenseApi = {
  /** 当前许可证状态快照 */
  getState(): Promise<LicenseState> {
    return ipcRenderer.invoke(LICENSE_IPC.GET_STATE) as Promise<LicenseState>;
  },
  /** 16 字符机器码 */
  getMachineCode(): Promise<string> {
    return ipcRenderer.invoke(LICENSE_IPC.GET_MACHINE_CODE) as Promise<string>;
  },
  /** 用激活码激活；返回结果包含更新后的状态 */
  activate(code: string): Promise<ActivationResult> {
    return ipcRenderer.invoke(LICENSE_IPC.ACTIVATE, code) as Promise<ActivationResult>;
  },
  /** 删除已存许可证（返回清除后的状态） */
  deactivate(): Promise<LicenseState> {
    return ipcRenderer.invoke(LICENSE_IPC.DEACTIVATE) as Promise<LicenseState>;
  },
  /** 订阅 push 更新；返回 unsubscribe fn */
  onChange(handler: (s: LicenseState) => void): () => void {
    const listener = (_evt: Electron.IpcRendererEvent, state: LicenseState) => handler(state);
    ipcRenderer.on(STATUS_BROADCAST_CHANNEL, listener);
    return () => ipcRenderer.off(STATUS_BROADCAST_CHANNEL, listener);
  },
};

contextBridge.exposeInMainWorld('apolloMapStudioLicense', licenseApi);
```

## 类型映射

| Window 对象                                    | 渲染端类型                                    | 主进程实现                                   |
| ---------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| `window.apolloMapStudio`                       | `src/lib/app-bridge.ts` inline 类型           | app/window/native menu IPC                   |
| `window.apolloMapStudioLicense.getState`       | `() => Promise<LicenseState>`                 | `LicenseManager.refresh()`                   |
| `window.apolloMapStudioLicense.getMachineCode` | `() => Promise<string>`                       | `MachineCodeResult.code`                     |
| `window.apolloMapStudioLicense.activate`       | `(code: string) => Promise<ActivationResult>` | `LicenseManager.activate(code)`              |
| `window.apolloMapStudioLicense.deactivate`     | `() => Promise<LicenseState>`                 | `LicenseManager.deactivate()`                |
| `window.apolloMapStudioLicense.onChange`       | `(h) => unsubscribe`                          | `BrowserWindow.send('license:state', state)` |

## 安全注记

### 为什么 contextBridge

直接暴露 `window.ipcRenderer = ipcRenderer` 是反模式 —— 渲染端能调用 `invoke('any:channel')`、`send('main:eval', ...)` 等，把 sandbox 越权。

`contextBridge.exposeInMainWorld(name, obj)` 把 `obj` 序列化（按值）+ 冻结后挂到 window；渲染端只能调用预定义的方法，不能反向访问 `ipcRenderer` 本身。

### 为什么 Promise 边界

`ipcRenderer.invoke` 是 Promise-based —— 主进程 handler 抛错会 reject。无 callback / 无 sync IPC（性能 + 死锁风险）。

### 为什么单独 onChange 不用 EventEmitter

Sandbox preload 不能暴露完整 `EventEmitter`（contextBridge 不序列化函数链）。改成"返回 unsubscribe 的注册式"——更适合 React `useEffect` 的清理范式。

## 副作用

- 把两个对象挂到渲染端 `window`
- 在第一次 `onChange` 注册时给 `STATUS_BROADCAST_CHANNEL` 加 listener
- listener 不会自动卸载，调用方必须执行返回的 unsubscribe（否则 BrowserWindow 关闭后还在挂着）

## 测试覆盖

`pnpm test:electron` 中的 preload 单测覆盖 contextBridge 暴露面、IPC 路由和订阅过滤；`pnpm test:electron:e2e` 进一步在真实桌面壳中验证 renderer 可见的 preload bridge。

## 调用方

主要调用方：

- `src/lib/app-bridge.ts` —— 封装 `window.apolloMapStudio` 的 app/runtime、Help、窗口和 native menu action API。
- [`license-bridge`](../lib/license-bridge.md) —— 把 `window.apolloMapStudioLicense?.xxx ?? fallback()` 的边界封装好。

UI 组件不应直接访问这些 `window` 对象，应通过 `appBridge` / `licenseBridge` 间接调用。

## 源码索引

| 行    | 内容                                   |
| ----- | -------------------------------------- |
| 1     | imports                                |
| 3     | type imports（仅类型，不进入 runtime） |
| 5     | `STATUS_BROADCAST_CHANNEL` 常量        |
| 6–11  | `LICENSE_IPC` 通道常量                 |
| 13–24 | `APP_IPC` / `LICENSE_IPC` 通道常量     |
| 29–59 | `apolloMapStudio` 暴露                 |
| 63–91 | `licenseApi` 对象                      |
| 93    | `apolloMapStudioLicense` 暴露          |

## 参见

- [Electron overview](../electron.md)
- [Main process](./main-process.md)
- [License Manager](./license-manager.md)
- [`license-bridge`](../lib/license-bridge.md) —— 渲染端包装
- [`licenseStore`](../store/license-store.md) —— React state 镜像
- Electron 文档：[contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
