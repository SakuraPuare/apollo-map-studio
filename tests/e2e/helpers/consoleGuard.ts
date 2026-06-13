import { expect, type ConsoleMessage, type Page } from '@playwright/test';

export interface ConsoleGuard {
  errors: string[];
  warnings: string[];
  assertClean(): void;
}

const ignoredWarningPatterns = [
  /\[vite\]\s+(connected|connecting)/i,
  /^Automatic fallback to software WebGL has been deprecated/i,
  /^WebGL performance caveat/i,
  /SwiftShader.*(automatic fallback to software WebGL|WebGL|ANGLE|software|deprecated)/i,
  /^.*GPU stall due to ReadPixels.*$/i,
  /^SwiftShader device/i,
  /^Passthrough is not supported, GL is swiftshader/i,
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
