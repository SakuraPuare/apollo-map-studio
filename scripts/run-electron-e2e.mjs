import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

const forwardedArgs = process.argv.slice(2);
if (forwardedArgs[0] === '--') forwardedArgs.shift();

const playwrightArgs = ['playwright', 'test', '-c', 'playwright.electron.config.ts', ...forwardedArgs];
const doesNotLaunchElectron = forwardedArgs.some((arg) =>
  ['--help', '-h', '--list', '--version'].includes(arg),
);

function hasCommand(command) {
  const pathExts =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const pathDir of (process.env.PATH ?? '').split(delimiter)) {
    for (const ext of pathExts) {
      try {
        accessSync(join(pathDir, `${command}${ext}`), constants.X_OK);
        return true;
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return false;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
  }
  if (result.signal) {
    console.error(`${command} exited via signal ${result.signal}`);
  }
  return result.status ?? 1;
}

if (process.platform === 'linux' && !process.env.DISPLAY && !doesNotLaunchElectron) {
  if (!hasCommand('xvfb-run')) {
    console.error(
      'Electron E2E requires a display server on Linux. Install xvfb and rerun with `xvfb-run -a pnpm test:electron:e2e`, or run in an environment with DISPLAY set.',
    );
    process.exit(1);
  }

  process.exit(
    run('xvfb-run', [
      '-a',
      '--server-args=-screen 0 1920x1080x24',
      'pnpm',
      'exec',
      ...playwrightArgs,
    ]),
  );
}

process.exit(run('pnpm', ['exec', ...playwrightArgs]));
