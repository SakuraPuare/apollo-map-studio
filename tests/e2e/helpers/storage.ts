import type { Page } from '@playwright/test';

export const AMS_STORAGE_PREFIX = 'apollo-map-studio:';
export const AMS_WEB_LICENSE_KEY = 'ams.webLicense.v1';

const pagesWithStorageResetInit = new WeakSet<Page>();

type StorageResetWindow = Window & {
  __amsStorageResetInstalled?: boolean;
};

export function resetStorageInBrowser(
  prefix = 'apollo-map-studio:',
  licenseKey = 'ams.webLicense.v1',
): boolean {
  let local: Storage;
  let session: Storage;
  try {
    local = localStorage;
    session = sessionStorage;
    void local.length;
  } catch {
    return false;
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < local.length; index += 1) {
    const key = local.key(index);
    if (key?.startsWith(prefix) || key === licenseKey) {
      keysToRemove.push(key);
    }
  }

  try {
    for (const key of keysToRemove) local.removeItem(key);
    session.clear();
  } catch {
    return false;
  }

  return true;
}

export async function installStorageReset(page: Page): Promise<void> {
  if (pagesWithStorageResetInit.has(page)) return;
  pagesWithStorageResetInit.add(page);

  await page.addInitScript(
    ({ prefix, licenseKey }) => {
      const storageWindow = window as StorageResetWindow;
      if (storageWindow.__amsStorageResetInstalled) return;
      storageWindow.__amsStorageResetInstalled = true;

      let local: Storage;
      let session: Storage;
      try {
        local = localStorage;
        session = sessionStorage;
        void local.length;
      } catch {
        return;
      }

      const keysToRemove: string[] = [];
      for (let index = 0; index < local.length; index += 1) {
        const key = local.key(index);
        if (key?.startsWith(prefix) || key === licenseKey) keysToRemove.push(key);
      }

      try {
        for (const key of keysToRemove) local.removeItem(key);
        session.clear();
      } catch {
        return;
      }
    },
    { prefix: AMS_STORAGE_PREFIX, licenseKey: AMS_WEB_LICENSE_KEY },
  );
}

export async function resetStorage(page: Page, options: { reload?: boolean } = {}): Promise<void> {
  if (page.url() === 'about:blank') {
    await installStorageReset(page);
    return;
  }

  const reset = await page
    .evaluate(
      ({ prefix, licenseKey }) => {
        let local: Storage;
        let session: Storage;
        try {
          local = localStorage;
          session = sessionStorage;
          void local.length;
        } catch {
          return false;
        }

        const keysToRemove: string[] = [];
        for (let index = 0; index < local.length; index += 1) {
          const key = local.key(index);
          if (key?.startsWith(prefix) || key === licenseKey) keysToRemove.push(key);
        }

        try {
          for (const key of keysToRemove) local.removeItem(key);
          session.clear();
        } catch {
          return false;
        }
        return true;
      },
      { prefix: AMS_STORAGE_PREFIX, licenseKey: AMS_WEB_LICENSE_KEY },
    )
    .catch(() => false);

  if (!reset) {
    await installStorageReset(page);
    if (options.reload && page.url() !== 'about:blank') await page.reload();
    return;
  }
  if (options.reload && page.url() !== 'about:blank') await page.reload();
}

export async function seedPerpetualWebLicense(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      void localStorage.length;
    } catch {
      return;
    }
    const now = Date.now();
    localStorage.setItem(
      key,
      JSON.stringify({
        trialStart: now,
        activation: {
          license: { id: 'e2e', name: 'E2E Mock License', issued: now, expires: 0 },
          expires: 0,
          activatedAt: now,
        },
      }),
    );
  }, AMS_WEB_LICENSE_KEY);
}
