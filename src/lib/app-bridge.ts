import { version } from '../../package.json';

export interface AppRuntimeInfo {
  name: string;
  productName: string;
  version: string;
  platform: string;
  runtime: 'desktop' | 'web';
  docsAvailable: boolean;
  versions: {
    chrome?: string;
    electron?: string;
    node?: string;
  };
}

export interface DesktopWindowState {
  platform: string;
  isMaximized: boolean;
  isFullscreen: boolean;
  isFocused: boolean;
}

interface ApolloMapStudioApi {
  platform: string;
  versions: AppRuntimeInfo['versions'];
  getAppInfo?: () => Promise<AppRuntimeInfo>;
  openHelp?: () => Promise<boolean>;
  getWindowState?: () => Promise<DesktopWindowState | null>;
  minimizeWindow?: () => Promise<void>;
  toggleMaximizeWindow?: () => Promise<void>;
  closeWindow?: () => Promise<void>;
  onWindowStateChange?: (handler: (state: DesktopWindowState) => void) => () => void;
  onNativeMenuAction?: (handler: (actionId: string) => void) => () => void;
}

declare global {
  interface Window {
    apolloMapStudio?: ApolloMapStudioApi;
  }
}

function getBrowserChromeVersion() {
  const match = navigator.userAgent.match(/(?:Chrome|Chromium|Edg)\/([0-9.]+)/);
  return match?.[1];
}

function fallbackInfo(): AppRuntimeInfo {
  return {
    name: 'Apollo Map Studio',
    productName: 'Apollo Map Studio',
    version,
    platform: navigator.platform || 'web',
    runtime: 'web',
    docsAvailable: true,
    versions: {
      chrome: getBrowserChromeVersion(),
    },
  };
}

function getStaticDocsUrl() {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}docs/index.html`;
}

export const appBridge = {
  async getAppInfo(): Promise<AppRuntimeInfo> {
    const api = window.apolloMapStudio;

    if (api?.getAppInfo) {
      return api.getAppInfo();
    }

    if (api) {
      return {
        ...fallbackInfo(),
        platform: api.platform,
        runtime: 'desktop',
        versions: api.versions,
      };
    }

    return fallbackInfo();
  },

  async openHelp(): Promise<boolean> {
    const api = window.apolloMapStudio;

    if (api?.openHelp) {
      return api.openHelp();
    }

    window.open(getStaticDocsUrl(), '_blank', 'noopener,noreferrer');
    return true;
  },

  async getWindowState(): Promise<DesktopWindowState | null> {
    return window.apolloMapStudio?.getWindowState?.() ?? null;
  },

  async minimizeWindow(): Promise<void> {
    await window.apolloMapStudio?.minimizeWindow?.();
  },

  async toggleMaximizeWindow(): Promise<void> {
    await window.apolloMapStudio?.toggleMaximizeWindow?.();
  },

  async closeWindow(): Promise<void> {
    await window.apolloMapStudio?.closeWindow?.();
  },

  onWindowStateChange(handler: (state: DesktopWindowState) => void): () => void {
    return window.apolloMapStudio?.onWindowStateChange?.(handler) ?? (() => undefined);
  },

  onNativeMenuAction(handler: (actionId: string) => void): () => void {
    return window.apolloMapStudio?.onNativeMenuAction?.(handler) ?? (() => undefined);
  },
};

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.apolloMapStudio);
}
