import { expect, type ConsoleMessage, type Page } from '@playwright/test';

export interface ConsoleGuard {
  errors: string[];
  warnings: string[];
  assertClean(): void;
}

const ignoredWarningPatterns = [
  /^Automatic fallback to software WebGL has been deprecated/i,
  /^.*SwiftShader.*automatic fallback to software WebGL.*$/i,
  /^.*GPU stall due to ReadPixels.*$/i,
  /^WebGL performance caveat/i,
];

function formatConsoleMessage(message: ConsoleMessage): string {
  const location = message.location();
  const suffix = location.url ? ` (${location.url}:${location.lineNumber})` : '';
  return `${message.type()}: ${message.text()}${suffix}`;
}

export function installConsoleGuard(
  page: Page,
  options: { failOnWarnings?: boolean } = {},
): ConsoleGuard {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(formatConsoleMessage(message));
      return;
    }

    if (
      message.type() === 'warning' &&
      !ignoredWarningPatterns.some((pattern) => pattern.test(message.text()))
    ) {
      warnings.push(formatConsoleMessage(message));
    }
  });

  return {
    errors,
    warnings,
    assertClean() {
      expect(errors, errors.join('\n')).toEqual([]);
      if (options.failOnWarnings) expect(warnings, warnings.join('\n')).toEqual([]);
    },
  };
}
