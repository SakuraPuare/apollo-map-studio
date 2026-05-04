import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';

import { checkAccessGuardAccess, getAccessGuardIdentity } from './access-guard-runtime.cjs';
import { LicenseManager } from './license/manager.cjs';

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const APP_PROTOCOL = 'apollo-map-studio';
const APP_IPC = {
  GET_INFO: 'app:get-info',
  OPEN_HELP: 'app:open-help',
  GET_ACCESS_GUARD_IDENTITY: 'app:get-access-guard-identity',
} as const;

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
let helpWindow: BrowserWindow | null = null;

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function getRendererIndexPath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
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

function isExternalUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://');
}

function configureExternalNavigation(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isExternalUrl(url)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
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
  ipcMain.on(APP_IPC.GET_ACCESS_GUARD_IDENTITY, (event) => {
    event.returnValue = getAccessGuardIdentity();
  });

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

  ipcMain.handle(APP_IPC.OPEN_HELP, () => openHelpWindow());
}

async function createMainWindow() {
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  configureExternalNavigation(mainWindow);

  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await mainWindow.loadFile(getRendererIndexPath());
}

app.setName('Apollo Map Studio');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.apollo-map-studio.app');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [mainWindow] = BrowserWindow.getAllWindows();

    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const access = checkAccessGuardAccess();

    if (!access.allowed) {
      void openDeniedWindow(access.denialHtml ?? '');
      return;
    }

    // Wire the license manager *before* creating any window so the renderer
    // can request state from a fully-initialised IPC surface.
    licenseManager = new LicenseManager();
    licenseManager.start();
    registerAppProtocol();
    registerAppIpc();

    void createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
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
