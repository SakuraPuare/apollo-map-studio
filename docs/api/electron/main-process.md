---
title: electron/main.cts — 主进程入口
description: BrowserWindow 创建、应用生命周期管理（single instance / activate / before-quit）、LicenseManager 启停。
---

# `electron/main.cts` — 主进程入口

> 源码：`electron/main.cts` · 106 行 · CommonJS 模块（`.cts`）

## 用途

`main.cts` 是 Electron 主进程入口。它做四件事：

1. 创建 `BrowserWindow`（启用所有 Electron 14+ 安全基线选项）
2. 管理应用生命周期：单实例锁、`activate`、`window-all-closed`、`before-quit`
3. 启动 `LicenseManager`，让 IPC 在创建窗口前就绪
4. 绑定外部链接拦截（`setWindowOpenHandler`）

## 关键代码

### Window 创建

```ts
const mainWindow = new BrowserWindow({
  width: 1440,
  height: 960,
  minWidth: 1024,
  minHeight: 700,
  title: 'Apollo Map Studio',
  backgroundColor: '#101318',
  show: false,
  webPreferences: {
    preload: getPreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

- `show: false` + `ready-to-show` 监听器消除"白屏一闪"
- `backgroundColor: '#101318'` 与设计系统的 `--ams-bg-deep` 对齐，避免 mode 切换时颜色抖动
- 三项安全选项见 [Electron overview](../electron.md#安全配置mainckts)

### Preload 路径解析

```ts
function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function getRendererIndexPath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}
```

注意：编译产物用 `.cjs` 后缀，而源码是 `.cts`——`tsconfig.electron.json` 的 `module: "commonjs"` 编译时改后缀，让 ESM `import` 在打包后仍能解析。

### Dev / Prod 渲染端加载

```ts
const rendererUrl = process.env.ELECTRON_RENDERER_URL;

// ...

if (rendererUrl) {
  await mainWindow.loadURL(rendererUrl);
  mainWindow.webContents.openDevTools({ mode: 'detach' });
  return;
}

await mainWindow.loadFile(getRendererIndexPath());
```

- Dev：从 Vite dev server 拉资源（`vite.config.ts` 中 electron-vite 注入 `ELECTRON_RENDERER_URL`），自动打开 detach 模式 DevTools
- Prod：加载打包后的 `dist/index.html`

### 外部链接拦截

```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    void shell.openExternal(url);
  }
  return { action: 'deny' };
});
```

任何 `target="_blank"` / `window.open` 调用都被拒绝创建新窗口；http/https URL 改走系统默认浏览器。**关键安全特性** —— 没有这条，恶意/被劫持的链接可以在 Electron 进程内打开任意页面。

### Single-instance lock

```ts
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [mainWindow] = BrowserWindow.getAllWindows();
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    licenseManager = new LicenseManager();
    licenseManager.start(); // ← 在创建 window 之前启动！
    void createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  });
}
```

- 第二次启动 `requestSingleInstanceLock` 返回 `false` → 退出
- `second-instance` 事件：把现有窗口置顶（更友好的用户体验）
- LicenseManager **必须** 在 `createMainWindow` 之前 start——否则 renderer 启动时 IPC handler 还没注册，第一次 `getState` 会拒绝

### Quit 路径

```ts
app.on('before-quit', () => {
  licenseManager?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- `before-quit` —— 调用 `licenseManager.stop()` 持久化 TimeGuard 状态、清理 setInterval
- `window-all-closed` —— 非 macOS 退出（macOS 关闭窗口不退出，按 dock icon 重开）

### Windows AppUserModelId

```ts
if (process.platform === 'win32') {
  app.setAppUserModelId('com.apollo-map-studio.app');
}
```

让通知 / 任务栏分组使用稳定 ID（Windows 规范要求）。

## 公共 API

### 内部函数

| 符号                     | 类型     | 摘要                                  |
| ------------------------ | -------- | ------------------------------------- |
| `getPreloadPath()`       | fn       | 返回 `__dirname/preload.cjs` 绝对路径 |
| `getRendererIndexPath()` | fn       | 返回 `dist/index.html` 绝对路径       |
| `createMainWindow()`     | async fn | 创建 BrowserWindow + 加载渲染端       |

### 模块级 state

```ts
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
let licenseManager: LicenseManager | null = null;
```

`licenseManager` 用 `let` 是为了在 `before-quit` 中调用 `stop()` 前不会被 GC。

## 副作用

- 注册 `app.on(...)` 事件 listener
- 创建 `BrowserWindow`（GPU / OS 资源）
- 启动 `LicenseManager`（持久化 + 计时器）
- 启动 `setWindowOpenHandler`

## 测试覆盖

主进程逻辑通常用 Spectron / Playwright Electron 做端到端测试，本 repo 暂无（或在 CI 中走 `pnpm package` smoke test）。

## 相关 IPC

主进程注册的 IPC channel 由 `LicenseManager.start()` 注册，参见 [License Manager](./license-manager.md):

- `license:get-state`
- `license:get-machine-code`
- `license:activate`
- `license:deactivate`

广播 channel：`license:state`（向所有 BrowserWindow 推）。

## 安全注记

| 项                 | 配置                                                            |
| ------------------ | --------------------------------------------------------------- |
| `contextIsolation` | ✓ true                                                          |
| `nodeIntegration`  | ✗ false                                                         |
| `sandbox`          | ✓ true                                                          |
| External links     | 默认拒绝，HTTP(S) 走 `shell.openExternal`                       |
| File dialogs       | **未启用** —— 当前桌面构建无文件 IPC，IO 走 worker / 浏览器路径 |
| Auto-updater       | **未启用**                                                      |

## 源码索引

| 行      | 内容                                      |
| ------- | ----------------------------------------- |
| 1–2     | imports                                   |
| 4       | `LicenseManager` import                   |
| 6       | `rendererUrl` from env                    |
| 8       | `licenseManager` 模块状态                 |
| 10–16   | `getPreloadPath` / `getRendererIndexPath` |
| 18–54   | `createMainWindow`                        |
| 56–57   | `app.setName`                             |
| 58–60   | Win32 AppUserModelId                      |
| 62–95   | Single-instance lock + `whenReady`        |
| 97–99   | `before-quit`                             |
| 101–105 | `window-all-closed`                       |

## 参见

- [Electron overview](../electron.md)
- [Preload](./preload.md)
- [License Manager](./license-manager.md)
- `tsconfig.electron.json` —— 编译配置（输出 `.cjs`）
- `vite.config.ts` —— `ELECTRON_RENDERER_URL` 注入
