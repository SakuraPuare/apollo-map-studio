import { contextBridge, ipcRenderer } from 'electron';

import type { ActivationResult, LicenseState } from './license/types.cjs';

const STATUS_BROADCAST_CHANNEL = 'license:state';
const LICENSE_IPC = {
  GET_STATE: 'license:get-state',
  GET_MACHINE_CODE: 'license:get-machine-code',
  ACTIVATE: 'license:activate',
  DEACTIVATE: 'license:deactivate',
} as const;
const APP_IPC = {
  GET_INFO: 'app:get-info',
  OPEN_HELP: 'app:open-help',
  GET_ACCESS_GUARD_IDENTITY: 'app:get-access-guard-identity',
  GET_WINDOW_STATE: 'app:get-window-state',
  WINDOW_MINIMIZE: 'app:window-minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'app:window-toggle-maximize',
  WINDOW_CLOSE: 'app:window-close',
} as const;

interface DesktopWindowState {
  platform: NodeJS.Platform;
  isMaximized: boolean;
  isFullscreen: boolean;
  isFocused: boolean;
}

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
    return ipcRenderer.invoke(APP_IPC.GET_WINDOW_STATE) as Promise<DesktopWindowState | null>;
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
  onWindowStateChange(handler: (state: DesktopWindowState) => void): () => void {
    const listener = (_evt: Electron.IpcRendererEvent, state: DesktopWindowState) => handler(state);
    ipcRenderer.on('app:window-state', listener);
    return () => ipcRenderer.off('app:window-state', listener);
  },
});
contextBridge.exposeInMainWorld('accessGuardIdentity', ipcRenderer.sendSync(APP_IPC.GET_ACCESS_GUARD_IDENTITY));

const licenseApi = {
  /** Snapshot of the current license state. */
  getState(): Promise<LicenseState> {
    return ipcRenderer.invoke(LICENSE_IPC.GET_STATE) as Promise<LicenseState>;
  },
  /** The 16-character machine code for this device. */
  getMachineCode(): Promise<string> {
    return ipcRenderer.invoke(LICENSE_IPC.GET_MACHINE_CODE) as Promise<string>;
  },
  /** Try to activate with a given code. Result includes updated state. */
  activate(code: string): Promise<ActivationResult> {
    return ipcRenderer.invoke(LICENSE_IPC.ACTIVATE, code) as Promise<ActivationResult>;
  },
  /** Remove the stored license (returns the post-clear state). */
  deactivate(): Promise<LicenseState> {
    return ipcRenderer.invoke(LICENSE_IPC.DEACTIVATE) as Promise<LicenseState>;
  },
  /** Subscribe to push updates. Returns an unsubscribe fn. */
  onChange(handler: (s: LicenseState) => void): () => void {
    const listener = (_evt: Electron.IpcRendererEvent, state: LicenseState) => handler(state);
    ipcRenderer.on(STATUS_BROADCAST_CHANNEL, listener);
    return () => ipcRenderer.off(STATUS_BROADCAST_CHANNEL, listener);
  },
};

contextBridge.exposeInMainWorld('apolloMapStudioLicense', licenseApi);
