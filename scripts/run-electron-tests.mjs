import { readdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const outDir = '.tmp/electron-license-tests';

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function collectTests(dir) {
  const tests = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      tests.push(...collectTests(path));
    } else if (path.endsWith('.test.cjs')) {
      tests.push(path);
    }
  }
  return tests;
}

rmSync(outDir, { recursive: true, force: true });
run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.electron.test.json']);
const tests = collectTests(`${outDir}/electron`);
if (tests.length === 0) {
  console.error('No compiled Electron tests found.');
  process.exit(1);
}
run('node', ['--test', ...tests]);
