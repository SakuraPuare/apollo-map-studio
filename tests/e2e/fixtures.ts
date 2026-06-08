import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test';

const ignoredConsolePatterns: RegExp[] = [
  /\[vite\]\s+connected/i,
  /\[vite\]\s+connecting/i,
  /^Automatic fallback to software WebGL has been deprecated/i,
  /^WebGL performance caveat/i,
  /^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/i,
  /^SwiftShader device/i,
  /^Passthrough is not supported, GL is swiftshader/i,
];

function consoleText(message: ConsoleMessage): string {
  const location = message.location();
  const where = location.url ? ` (${location.url}:${location.lineNumber})` : '';
  return `${message.type()}: ${message.text()}${where}`;
}

function shouldFailConsole(message: ConsoleMessage): boolean {
  if (!['error', 'warning'].includes(message.type())) return false;
  return !ignoredConsolePatterns.some((pattern) => pattern.test(message.text()));
}

async function installPageGuards(page: Page, failures: string[]): Promise<void> {
  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    if (shouldFailConsole(message)) failures.push(consoleText(message));
  });
}

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const failures: string[] = [];
    await installPageGuards(page, failures);
    await use(page);
    expect(failures, failures.join('\n')).toEqual([]);
  },
});

export { expect } from '@playwright/test';
