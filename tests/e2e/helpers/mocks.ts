import type { Page } from '@playwright/test';
import { AMS_STORAGE_PREFIX, AMS_WEB_LICENSE_KEY } from './storage';

export interface MockFileSpec {
  name: string;
  mimeType?: string;
  text?: string;
  bytes?: number[];
}

export interface PickerRequest {
  accept: string;
  multiple: boolean;
  names: string[];
}

export interface DownloadRecord {
  filename: string;
  href: string;
  type: string;
  size: number;
}

export interface MockState {
  bridgeCalls: string[];
  pickerRequests: PickerRequest[];
  downloads: DownloadRecord[];
  nextFiles?: MockFileSpec[];
  licenseHandlers?: Array<(state: unknown) => void>;
  currentLicenseState?: unknown;
  windowStateHandlers?: Array<(state: unknown) => void>;
  nativeMenuHandlers?: Array<(actionId: string) => void>;
}

export const DEFAULT_LICENSE_STATE = {
  status: 'activated',
  canEdit: true,
  machineCode: 'E2E-MOCK',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: null,
  hoursRemaining: null,
  license: {
    id: 'e2e',
    name: 'E2E Mock License',
    issued: 0,
    expires: 0,
  },
  checkedAt: 0,
  reason: 'E2E mock license',
};

export async function installDefaultE2EInit(page: Page): Promise<void> {
  await page.addInitScript(
    ({ licenseKey, licenseState, storagePrefix }) => {
      try {
        void localStorage.length;
      } catch {
        return;
      }

      const keysToRemove: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(storagePrefix) || key === licenseKey) keysToRemove.push(key);
      }
      for (const key of keysToRemove) localStorage.removeItem(key);
      sessionStorage.clear();

      const now = Date.now();
      localStorage.setItem(
        licenseKey,
        JSON.stringify({
          trialStart: now,
          activation: {
            license: { id: 'e2e', name: 'E2E Mock License', issued: now, expires: 0 },
            expires: 0,
            activatedAt: now,
          },
        }),
      );

      const state = window.__amsE2E?.state ?? {
        bridgeCalls: [] as string[],
        pickerRequests: [] as PickerRequest[],
        downloads: [] as DownloadRecord[],
        nextFiles: [] as MockFileSpec[],
        licenseHandlers: [] as Array<(state: unknown) => void>,
      };
      state.bridgeCalls.splice(0);
      state.pickerRequests.splice(0);
      state.downloads.splice(0);
      state.nextFiles ??= [];
      state.nextFiles.splice(0);
      state.licenseHandlers ??= [];
      state.currentLicenseState = { ...licenseState, checkedAt: Date.now() };

      Object.defineProperty(window, '__amsE2E', {
        configurable: true,
        value: {
          ...window.__amsE2E,
          state,
          setNextPickerFiles(files: MockFileSpec[]) {
            state.nextFiles = files;
          },
          emitLicenseState(nextState: unknown) {
            state.currentLicenseState = nextState;
            for (const handler of state.licenseHandlers ?? []) handler(nextState);
          },
        },
      });

      Object.defineProperty(window, 'apolloMapStudioLicense', {
        configurable: true,
        value: {
          async getState() {
            state.bridgeCalls.push('license.getState');
            return licenseSnapshot();
          },
          async getMachineCode() {
            state.bridgeCalls.push('license.getMachineCode');
            return 'E2E-MOCK';
          },
          async activate() {
            state.bridgeCalls.push('license.activate');
            state.currentLicenseState = { ...licenseState, checkedAt: Date.now() };
            return { ok: true, state: state.currentLicenseState };
          },
          async deactivate() {
            state.bridgeCalls.push('license.deactivate');
            state.currentLicenseState = {
              ...licenseState,
              status: 'trial',
              canEdit: true,
              checkedAt: Date.now(),
            };
            return state.currentLicenseState;
          },
          onChange(handler: (value: unknown) => void) {
            state.licenseHandlers?.push(handler);
            return () => {
              state.licenseHandlers = state.licenseHandlers?.filter((item) => item !== handler);
            };
          },
        },
      });

      type CreateElement = (
        this: Document,
        tagName: string,
        options?: ElementCreationOptions,
      ) => Element;
      const documentPrototype = Document.prototype as {
        createElement: CreateElement;
        __amsE2ECreateElementPatched?: boolean;
      };
      const originalCreateElement = documentPrototype.createElement;
      if (!documentPrototype.__amsE2ECreateElementPatched) {
        documentPrototype.createElement = function createElement(
          this: Document,
          tagName: string,
          options?: ElementCreationOptions,
        ) {
          const element = originalCreateElement.call(this, tagName, options);

          if (element instanceof HTMLInputElement) {
            patchFileInput(element);
          }
          if (element instanceof HTMLAnchorElement) {
            patchDownloadAnchor(element);
          }

          return element;
        } as typeof Document.prototype.createElement;
        documentPrototype.__amsE2ECreateElementPatched = true;
      }

      let blobByUrl = window.__amsE2E.blobByUrl;
      if (!window.__amsE2E.createObjectURLPatched) {
        blobByUrl = new Map<string, Blob>();
        const originalCreateObjectURL = URL.createObjectURL.bind(URL);
        const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = (blob: Blob) => {
          const url = originalCreateObjectURL(blob);
          blobByUrl?.set(url, blob);
          return url;
        };
        URL.revokeObjectURL = (url: string) => {
          blobByUrl?.delete(url);
          originalRevokeObjectURL(url);
        };
        window.__amsE2E.createObjectURLPatched = true;
        window.__amsE2E.blobByUrl = blobByUrl;
      }
      if (!blobByUrl) throw new Error('E2E blob URL registry was not installed');

      function makeFile(spec: MockFileSpec): File {
        if (spec.bytes) {
          return new File([new Uint8Array(spec.bytes)], spec.name, {
            type: spec.mimeType ?? 'application/octet-stream',
          });
        }
        return new File([spec.text ?? ''], spec.name, { type: spec.mimeType ?? 'text/plain' });
      }

      function licenseSnapshot() {
        const current = state.currentLicenseState;
        const source =
          typeof current === 'object' && current !== null ? current : (licenseState as object);
        return { ...source, checkedAt: Date.now() };
      }

      function makeFileList(files: File[]): FileList {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        return transfer.files;
      }

      function patchFileInput(input: HTMLInputElement) {
        const originalClick = input.click.bind(input);
        input.click = () => {
          if (input.type !== 'file') {
            originalClick();
            return;
          }

          const currentState = window.__amsE2E.state;
          currentState.nextFiles ??= [];
          const files = currentState.nextFiles.splice(0).map(makeFile);
          const selectedFiles = input.multiple ? files : files.slice(0, 1);
          currentState.pickerRequests.push({
            accept: input.accept,
            multiple: input.multiple,
            names: selectedFiles.map((file) => file.name),
          });

          if (selectedFiles.length > 0) {
            Object.defineProperty(input, 'files', {
              configurable: true,
              value: makeFileList(selectedFiles),
            });
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }

          input.dispatchEvent(new Event('cancel', { bubbles: true }));
        };
      }

      function patchDownloadAnchor(anchor: HTMLAnchorElement) {
        const originalClick = anchor.click.bind(anchor);
        anchor.click = () => {
          if (!anchor.download) {
            originalClick();
            return;
          }

          const blob = window.__amsE2E.blobByUrl?.get(anchor.href);
          window.__amsE2E.state.downloads.push({
            filename: anchor.download,
            href: anchor.href,
            type: blob?.type ?? '',
            size: blob?.size ?? 0,
          });
        };
      }
    },
    {
      licenseKey: AMS_WEB_LICENSE_KEY,
      licenseState: DEFAULT_LICENSE_STATE,
      storagePrefix: AMS_STORAGE_PREFIX,
    },
  );
}

export async function installDesktopBridgeMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!window.__amsE2E) {
      const state = {
        bridgeCalls: [] as string[],
        pickerRequests: [] as PickerRequest[],
        downloads: [] as DownloadRecord[],
      };
      Object.defineProperty(window, '__amsE2E', {
        configurable: true,
        value: {
          state,
          setNextPickerFiles() {
            return undefined;
          },
          emitLicenseState() {
            return undefined;
          },
        },
      });
    }

    const state = window.__amsE2E.state as typeof window.__amsE2E.state & {
      windowStateHandlers?: Array<(state: unknown) => void>;
      nativeMenuHandlers?: Array<(actionId: string) => void>;
    };
    state.windowStateHandlers ??= [];
    state.nativeMenuHandlers ??= [];

    const windowState = {
      platform: 'linux',
      isMaximized: false,
      isFullscreen: false,
      isFocused: true,
    };

    window.__amsE2E.emitWindowState = (nextState: unknown) => {
      for (const handler of state.windowStateHandlers ?? []) handler(nextState);
    };
    window.__amsE2E.emitNativeMenuAction = (actionId: unknown) => {
      if (typeof actionId !== 'string') return;
      for (const handler of state.nativeMenuHandlers ?? []) handler(actionId);
    };

    Object.defineProperty(window, 'apolloMapStudio', {
      configurable: true,
      value: {
        platform: 'linux',
        versions: { chrome: 'e2e', electron: 'e2e', node: 'e2e' },
        async getAppInfo() {
          state.bridgeCalls.push('getAppInfo');
          return {
            name: 'Apollo Map Studio',
            productName: 'Apollo Map Studio',
            version: '0.0.0-e2e',
            platform: 'linux',
            runtime: 'desktop',
            docsAvailable: true,
            versions: { chrome: 'e2e', electron: 'e2e', node: 'e2e' },
          };
        },
        async openHelp() {
          state.bridgeCalls.push('openHelp');
          return true;
        },
        async getWindowState() {
          state.bridgeCalls.push('getWindowState');
          return windowState;
        },
        async minimizeWindow() {
          state.bridgeCalls.push('minimizeWindow');
        },
        async toggleMaximizeWindow() {
          state.bridgeCalls.push('toggleMaximizeWindow');
        },
        async closeWindow() {
          state.bridgeCalls.push('closeWindow');
        },
        onWindowStateChange(handler: (value: unknown) => void) {
          state.windowStateHandlers?.push(handler);
          return () => {
            state.windowStateHandlers = state.windowStateHandlers?.filter(
              (item) => item !== handler,
            );
          };
        },
        onNativeMenuAction(handler: (actionId: string) => void) {
          state.nativeMenuHandlers?.push(handler);
          return () => {
            state.nativeMenuHandlers = state.nativeMenuHandlers?.filter((item) => item !== handler);
          };
        },
      },
    });
  });
}

export async function setNextPickerFiles(page: Page, files: MockFileSpec[]): Promise<void> {
  await page.evaluate((nextFiles) => {
    window.__amsE2E.setNextPickerFiles(nextFiles);
  }, files);
}

export async function readMockState(page: Page): Promise<MockState> {
  return page.evaluate(() => ({
    bridgeCalls: [...window.__amsE2E.state.bridgeCalls],
    pickerRequests: [...window.__amsE2E.state.pickerRequests],
    downloads: [...window.__amsE2E.state.downloads],
  }));
}

declare global {
  interface Window {
    __amsE2E: {
      state: MockState;
      createObjectURLPatched?: boolean;
      blobByUrl?: Map<string, Blob>;
      setNextPickerFiles(files: MockFileSpec[]): void;
      emitWindowState?(state: unknown): void;
      emitNativeMenuAction?(actionId: unknown): void;
      emitLicenseState(state: unknown): void;
    };
  }
}
