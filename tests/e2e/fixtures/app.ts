import { test as base } from '@playwright/test';
import { AmsE2EApp } from '../helpers/app';
import { installConsoleGuard, type ConsoleGuard } from '../helpers/consoleGuard';
import { installDefaultE2EInit } from '../helpers/mocks';

interface AmsFixtures {
  consoleGuard: ConsoleGuard;
  ams: AmsE2EApp;
}

export const test = base.extend<AmsFixtures>({
  consoleGuard: async ({ page }, use) => {
    const guard = installConsoleGuard(page);
    await use(guard);
    guard.assertClean();
  },

  ams: async ({ page, consoleGuard: _consoleGuard }, use, testInfo) => {
    await installDefaultE2EInit(page);
    await use(new AmsE2EApp(page, testInfo));
  },
});

export { expect } from '@playwright/test';
