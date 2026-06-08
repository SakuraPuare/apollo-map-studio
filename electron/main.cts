import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  shell,
} from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

import { checkAccessGuardAccess } from './access-guard-runtime.cjs';
import { LicenseManager } from './license/manager.cjs';

const APP_PROTOCOL = 'apollo-map-studio';
const APP_ICON_FILENAME = 'icon.png';
const APP_IPC = {
  GET_INFO: 'app:get-info',
  OPEN_HELP: 'app:open-help',
  GET_WINDOW_STATE: 'app:get-window-state',
  WINDOW_MINIMIZE: 'app:window-minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'app:window-toggle-maximize',
  WINDOW_CLOSE: 'app:window-close',
  NATIVE_MENU_ACTION: 'app:native-menu-action',
} as const;

type NativeRendererActionId =
  | 'importApollo'
  | 'exportApolloBin'
  | 'exportApolloText'
  | 'settings'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'toggleGrid'
  | 'toggleSnap'
  | 'resetLayout'
  | `view:${string}`
  | 'commandPalette'
  | 'about'
  | 'defaultMode'
  | 'connectLanes'
  | 'boundaryBrush';

interface NativeMenuActionItem {
  label: string;
  actionId: NativeRendererActionId;
  accelerator?: string;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

let licenseManager: LicenseManager | null = null;
let mainWindow: BrowserWindow | null = null;
let helpWindow: BrowserWindow | null = null;

function getFirstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function getAppIconPath() {
  return getFirstExistingPath([
    path.join(process.resourcesPath, APP_ICON_FILENAME),
    path.join(__dirname, '..', 'build', APP_ICON_FILENAME),
    path.join(app.getAppPath(), 'build', APP_ICON_FILENAME),
    path.join(process.cwd(), 'build', APP_ICON_FILENAME),
  ]);
}

function getWindowIconOptions() {
  const icon = getAppIconPath();
  return icon ? { icon } : {};
}

function installDockIcon() {
  if (process.platform !== 'darwin') return;
  const iconPath = getAppIconPath();
  if (!iconPath) return;

  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    app.dock?.setIcon(icon);
  }
}

function getWindowState(window: BrowserWindow) {
  return {
    platform: process.platform,
    isMaximized: window.isMaximized(),
    isFullscreen: window.isFullScreen(),
    isFocused: window.isFocused(),
  };
}

function broadcastWindowState(window: BrowserWindow) {
  if (window.isDestroyed()) return;
  window.webContents.send('app:window-state', getWindowState(window));
}

function senderWindow(event: Electron.IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

function wireWindowStateEvents(window: BrowserWindow) {
  const publish = () => broadcastWindowState(window);
  window.on('maximize', publish);
  window.on('unmaximize', publish);
  window.on('enter-full-screen', publish);
  window.on('leave-full-screen', publish);
  window.on('focus', publish);
  window.on('blur', publish);
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function getRendererIndexPath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function getDevelopmentRendererUrl() {
  if (app.isPackaged) return null;

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (!rendererUrl) return null;

  const parsedUrl = new URL(rendererUrl);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Unsupported ELECTRON_RENDERER_URL protocol: ${parsedUrl.protocol}`);
  }
  if (!isLoopbackHost(parsedUrl.hostname)) {
    throw new Error(`Unsupported ELECTRON_RENDERER_URL host: ${parsedUrl.hostname}`);
  }

  return parsedUrl.toString();
}

function getDevelopmentRendererOrigin() {
  const rendererUrl = getDevelopmentRendererUrl();
  return rendererUrl ? new URL(rendererUrl).origin : null;
}

function getDocsIndexPath() {
  const packagedDocsPath = path.join(__dirname, '..', 'dist', 'docs', 'index.html');
  const candidates = [
    packagedDocsPath,
    path.join(app.getAppPath(), 'dist', 'docs', 'index.html'),
    path.join(process.cwd(), 'dist', 'docs', 'index.html'),
    path.join(process.cwd(), 'docs', '.vitepress', 'dist', 'index.html'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? packagedDocsPath;
}

function getDocsRootPath() {
  return path.dirname(getDocsIndexPath());
}

function resolveContainedPath(rootPath: string, relativePath: string) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);

  if (resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return resolvedPath;
  }

  return null;
}

function getDocsProtocolFilePath(url: string) {
  const docsRootPath = getDocsRootPath();
  const requestUrl = new URL(url);
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/') {
    pathname = '/docs/index.html';
  } else if (pathname === '/docs') {
    pathname = '/docs/index.html';
  } else if (!pathname.startsWith('/docs/')) {
    pathname = `/docs${pathname}`;
  }
  if (pathname.endsWith('/')) {
    pathname = `${pathname}index.html`;
  }

  const relativePath = pathname.slice('/docs/'.length);
  const requestedPath = resolveContainedPath(docsRootPath, relativePath);

  if (!requestedPath) {
    return path.join(docsRootPath, '404.html');
  }

  if (existsSync(requestedPath)) {
    return requestedPath;
  }

  if (!path.extname(requestedPath) && existsSync(`${requestedPath}.html`)) {
    return `${requestedPath}.html`;
  }

  return path.join(docsRootPath, '404.html');
}

function registerAppProtocol() {
  protocol.handle(APP_PROTOCOL, (request) => {
    const filePath = getDocsProtocolFilePath(request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function getNativeMenuActionWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null;
}

function sendNativeMenuAction(actionId: NativeRendererActionId) {
  const targetWindow = getNativeMenuActionWindow();
  if (!targetWindow) return;

  targetWindow.webContents.send(APP_IPC.NATIVE_MENU_ACTION, actionId);
}

function rendererActionMenuItem(item: NativeMenuActionItem): MenuItemConstructorOptions {
  return {
    label: item.label,
    accelerator: item.accelerator,
    click: () => sendNativeMenuAction(item.actionId),
  };
}

function separator(): MenuItemConstructorOptions {
  return { type: 'separator' };
}

function buildFileMenu(): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    rendererActionMenuItem({
      label: 'Import Apollo Map...',
      actionId: 'importApollo',
      accelerator: 'CmdOrCtrl+O',
    }),
    rendererActionMenuItem({
      label: 'Export Apollo Map (.bin)',
      actionId: 'exportApolloBin',
      accelerator: 'CmdOrCtrl+S',
    }),
    rendererActionMenuItem({
      label: 'Export Apollo Map (.txt)',
      actionId: 'exportApolloText',
      accelerator: 'Shift+CmdOrCtrl+S',
    }),
  ];

  if (process.platform !== 'darwin') {
    submenu.push(separator(), rendererActionMenuItem({ label: 'Settings', actionId: 'settings' }));
  }

  submenu.push(separator(), { role: 'close' });

  return {
    label: 'File',
    submenu,
  };
}

function buildEditMenu(): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      rendererActionMenuItem({
        label: 'Undo',
        actionId: 'undo',
        accelerator: 'CmdOrCtrl+Z',
      }),
      rendererActionMenuItem({
        label: 'Redo',
        actionId: 'redo',
        accelerator: 'Shift+CmdOrCtrl+Z',
      }),
      separator(),
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      separator(),
      rendererActionMenuItem({ label: 'Delete Selection', actionId: 'delete' }),
      rendererActionMenuItem({ label: 'Default (Pan)', actionId: 'defaultMode' }),
      rendererActionMenuItem({ label: 'Connect Lanes', actionId: 'connectLanes' }),
      rendererActionMenuItem({ label: 'Boundary Brush', actionId: 'boundaryBrush' }),
    ],
  };
}

function buildViewMenu(): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    rendererActionMenuItem({ label: 'Reset Layout', actionId: 'resetLayout' }),
    rendererActionMenuItem({ label: 'Map Editor', actionId: 'view:mapEditor' }),
    rendererActionMenuItem({ label: 'Outline', actionId: 'view:outline' }),
    rendererActionMenuItem({ label: 'Layers', actionId: 'view:layers' }),
    rendererActionMenuItem({ label: 'Search', actionId: 'view:search' }),
    rendererActionMenuItem({ label: 'Inspector', actionId: 'view:inspector' }),
    rendererActionMenuItem({ label: 'Timeline', actionId: 'view:timeline' }),
    separator(),
    rendererActionMenuItem({
      label: 'Toggle Grid',
      actionId: 'toggleGrid',
      accelerator: 'CmdOrCtrl+G',
    }),
    rendererActionMenuItem({ label: 'Toggle Snap', actionId: 'toggleSnap' }),
    separator(),
    rendererActionMenuItem({
      label: 'Command Palette',
      actionId: 'commandPalette',
      accelerator: 'CmdOrCtrl+K',
    }),
  ];

  if (!app.isPackaged) {
    submenu.push(
      separator(),
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
    );
  }

  return {
    label: 'View',
    submenu,
  };
}

function buildWindowMenu(): MenuItemConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        separator(),
        { role: 'front' },
        separator(),
        { role: 'window' },
      ],
    };
  }

  return {
    label: 'Window',
    submenu: [{ role: 'minimize' }, { role: 'close' }],
  };
}

function buildHelpMenu(): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    {
      label: 'Help Documentation',
      click: () => {
        void safeOpenHelpWindow();
      },
    },
  ];

  if (process.platform !== 'darwin') {
    submenu.push(
      separator(),
      rendererActionMenuItem({ label: 'About Apollo Map Studio', actionId: 'about' }),
    );
  }

  return {
    label: 'Help',
    submenu,
  };
}

function installApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        rendererActionMenuItem({ label: 'About Apollo Map Studio', actionId: 'about' }),
        rendererActionMenuItem({
          label: 'Settings...',
          actionId: 'settings',
          accelerator: 'CmdOrCtrl+,',
        }),
        separator(),
        { role: 'services' },
        separator(),
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        separator(),
        { role: 'quit' },
      ],
    });
  }

  template.push(
    buildFileMenu(),
    buildEditMenu(),
    buildViewMenu(),
    buildWindowMenu(),
    buildHelpMenu(),
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function isHttpNavigationUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

function isContainedFileUrl(url: string, rootPath: string) {
  try {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedPath = path.resolve(fileURLToPath(url));
    return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
  } catch {
    return false;
  }
}

function isInternalNavigationUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === `${APP_PROTOCOL}:`) return true;
    if (parsedUrl.protocol === 'file:') {
      return isContainedFileUrl(url, path.dirname(getRendererIndexPath()));
    }
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.origin === getDevelopmentRendererOrigin();
    }
    return false;
  } catch {
    return false;
  }
}

function getExternalNavigationTarget(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') return null;
    if (parsedUrl.username || parsedUrl.password) return null;
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function configureExternalNavigation(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    const target = getExternalNavigationTarget(url);
    if (target) {
      void shell.openExternal(target);
    }

    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isInternalNavigationUrl(url)) return;

    event.preventDefault();
    if (isHttpNavigationUrl(url)) {
      const target = getExternalNavigationTarget(url);
      if (target) {
        void shell.openExternal(target);
      }
    }
  });

  window.webContents.on('will-redirect', (event, url) => {
    if (isInternalNavigationUrl(url)) return;

    event.preventDefault();
    if (isHttpNavigationUrl(url)) {
      const target = getExternalNavigationTarget(url);
      if (target) {
        void shell.openExternal(target);
      }
    }
  });
}

export const __mainTestInternals = {
  configureExternalNavigation,
  getDevelopmentRendererUrl,
  getExternalNavigationTarget,
  isInternalNavigationUrl,
  isLoopbackHost,
} as const;

function safeCreateMainWindow(): void {
  createMainWindow().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox('Apollo Map Studio failed to start', message);
    app.quit();
  });
}

function safeOpenDeniedWindow(denialHtml: string): void {
  openDeniedWindow(denialHtml).catch((error: unknown) => {
    console.error('[electron] failed to open access-denied window:', error);
    app.quit();
  });
}

function safeOpenHelpWindow(): Promise<boolean> {
  return openHelpWindow().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (helpWindow && !helpWindow.isDestroyed()) {
      helpWindow.destroy();
    }
    helpWindow = null;
    dialog.showErrorBox('Help documentation failed to open', message);
    return false;
  });
}

async function openHelpWindow() {
  const docsIndexPath = getDocsIndexPath();

  if (!existsSync(docsIndexPath)) {
    dialog.showErrorBox(
      'Help documentation is unavailable',
      'The packaged VitePress documentation was not found. Run `pnpm build` or `pnpm docs:build` before opening Help in the desktop shell.',
    );
    return false;
  }

  if (helpWindow && !helpWindow.isDestroyed()) {
    if (helpWindow.isMinimized()) {
      helpWindow.restore();
    }
    helpWindow.focus();
    return true;
  }

  helpWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: 'Apollo Map Studio Help',
    backgroundColor: '#ffffff',
    show: false,
    ...getWindowIconOptions(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configureExternalNavigation(helpWindow);

  helpWindow.once('ready-to-show', () => {
    helpWindow?.show();
  });
  helpWindow.on('closed', () => {
    helpWindow = null;
  });

  await helpWindow.loadURL(`${APP_PROTOCOL}://app/docs/index.html`);
  return true;
}

async function openDeniedWindow(denialHtml: string) {
  const deniedWindow = new BrowserWindow({
    width: 640,
    height: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Access Denied',
    backgroundColor: '#1e1e1e',
    show: false,
    ...getWindowIconOptions(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  deniedWindow.once('ready-to-show', () => {
    deniedWindow.show();
  });

  deniedWindow.on('closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  });

  configureExternalNavigation(deniedWindow);

  await deniedWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(denialHtml)}`);
}

function registerAppIpc() {
  ipcMain.handle(APP_IPC.GET_INFO, () => ({
    name: app.getName(),
    productName: 'Apollo Map Studio',
    version: app.getVersion(),
    platform: process.platform,
    runtime: 'desktop',
    docsAvailable: existsSync(getDocsIndexPath()),
    versions: {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    },
  }));

  ipcMain.handle(APP_IPC.OPEN_HELP, () => safeOpenHelpWindow());
  ipcMain.handle(APP_IPC.GET_WINDOW_STATE, (event) => {
    const window = senderWindow(event);
    return window ? getWindowState(window) : null;
  });
  ipcMain.handle(APP_IPC.WINDOW_MINIMIZE, (event) => {
    senderWindow(event)?.minimize();
  });
  ipcMain.handle(APP_IPC.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const window = senderWindow(event);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle(APP_IPC.WINDOW_CLOSE, (event) => {
    senderWindow(event)?.close();
  });
}

async function createMainWindow() {
  const customChromeOptions =
    process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {
          frame: false,
          autoHideMenuBar: true,
        };

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: 'Apollo Map Studio',
    backgroundColor: '#101318',
    show: false,
    ...getWindowIconOptions(),
    ...customChromeOptions,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.once('ready-to-show', () => {
    window.show();
    broadcastWindowState(window);
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  wireWindowStateEvents(window);
  configureExternalNavigation(window);

  const developmentRendererUrl = getDevelopmentRendererUrl();
  if (developmentRendererUrl) {
    await window.loadURL(developmentRendererUrl);
    if (process.env.APOLLO_MAP_STUDIO_E2E !== '1') {
      window.webContents.openDevTools({ mode: 'detach' });
    }
    return;
  }

  await window.loadFile(getRendererIndexPath());
}

app.setName('Apollo Map Studio');

if (!app.isPackaged && process.env.APOLLO_MAP_STUDIO_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.APOLLO_MAP_STUDIO_USER_DATA_DIR));
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.apollo-map-studio.app');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const targetWindow = getNativeMenuActionWindow();

    if (!targetWindow) {
      return;
    }

    if (targetWindow.isMinimized()) {
      targetWindow.restore();
    }

    targetWindow.focus();
  });

  app.whenReady().then(() => {
    installDockIcon();
    registerAppProtocol();
    installApplicationMenu();

    const access = checkAccessGuardAccess();

    if (!access.allowed) {
      safeOpenDeniedWindow(access.denialHtml ?? '');
      return;
    }

    // Wire the license manager *before* creating any window so the renderer
    // can request state from a fully-initialised IPC surface.
    licenseManager = new LicenseManager();
    licenseManager.start();
    registerAppIpc();

    safeCreateMainWindow();

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        safeCreateMainWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  licenseManager?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
