#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distElectronDir = path.join(repoRoot, 'dist-electron');
const distDir = path.join(repoRoot, 'dist');
const mainPath = path.join(distElectronDir, 'main.cjs');
const integrityPath = path.join(distElectronDir, 'ams-integrity.cjs');
const encryptedPrefix = '/* APMS_ENC_V1 */\n';

const protectedModuleRelPaths = [
  'license/crypto.cjs',
  'license/machine-id.cjs',
  'license/manager.cjs',
  'license/public-key.cjs',
  'license/storage.cjs',
  'license/time-guard.cjs',
  'license/types.cjs',
];

const plaintextMarkers = [
  'LICENSE_PUBLIC_KEY_PEM',
  'function parseToken',
  'function verifyToken',
  'class LicenseManager',
  'class LicenseStorage',
  'class TimeGuard',
  'collectSignals',
  'deriveMachineCode',
];

function walkFiles(rootDir) {
  if (!existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  return out.sort();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSourceMaps(files) {
  const mapFiles = files.filter((file) => file.endsWith('.map'));
  assert(mapFiles.length === 0, `hardened build contains sourcemaps:\n${mapFiles.join('\n')}`);

  const jsFiles = files.filter((file) => /\.(?:cjs|mjs|js|html|css)$/.test(file));
  const sourceMapReferences = jsFiles.filter((file) =>
    readFileSync(file, 'utf8').includes('sourceMappingURL='),
  );
  assert(
    sourceMapReferences.length === 0,
    `hardened build contains sourceMappingURL references:\n${sourceMapReferences.join('\n')}`,
  );
}

function assertEncryptedModules() {
  for (const relPath of protectedModuleRelPaths) {
    const absPath = path.join(distElectronDir, relPath);
    assert(existsSync(absPath), `protected Electron module is missing: ${relPath}`);

    const source = readFileSync(absPath, 'utf8');
    assert(
      source.startsWith(encryptedPrefix),
      `protected Electron module is not sealed: ${relPath}`,
    );

    const leakedMarkers = plaintextMarkers.filter((marker) => source.includes(marker));
    assert(
      leakedMarkers.length === 0,
      `protected Electron module still contains plaintext markers (${leakedMarkers.join(', ')}): ${relPath}`,
    );
  }
}

function assertMainBootstrap() {
  assert(existsSync(mainPath), 'dist-electron/main.cjs is missing');
  const source = readFileSync(mainPath, 'utf8');
  const loaderIndex = source.indexOf('APMS_ENC_V1');
  const singleQuoteLicenseIndex = source.indexOf("require('./license/manager.cjs')");
  const doubleQuoteLicenseIndex = source.indexOf('require("./license/manager.cjs")');
  const licenseIndex =
    singleQuoteLicenseIndex >= 0 ? singleQuoteLicenseIndex : doubleQuoteLicenseIndex;

  assert(
    source.includes('APMS_ENC_V1'),
    'dist-electron/main.cjs is missing the encrypted module loader',
  );
  assert(
    source.includes('ams-integrity.cjs'),
    'dist-electron/main.cjs is missing the integrity verifier',
  );
  assert(licenseIndex >= 0, 'dist-electron/main.cjs is missing the license manager import');
  assert(
    loaderIndex < licenseIndex,
    'encrypted module loader must run before license modules are required',
  );
}

function assertIntegrity() {
  assert(existsSync(integrityPath), 'dist-electron/ams-integrity.cjs is missing');
  const integrity = require(integrityPath);
  assert(typeof integrity.verify === 'function', 'integrity module does not export verify()');
  assert(
    integrity.MANIFEST && typeof integrity.MANIFEST === 'object',
    'integrity manifest is missing',
  );
  integrity.verify(repoRoot);
}

function main() {
  assert(existsSync(distElectronDir), 'dist-electron is missing. Run `pnpm build:desktop` first.');

  const files = [...walkFiles(distElectronDir), ...walkFiles(distDir)].filter((file) =>
    statSync(file).isFile(),
  );

  assertNoSourceMaps(files);
  assertEncryptedModules();
  assertMainBootstrap();
  assertIntegrity();

  console.log(
    `[electron hardening] verified ${protectedModuleRelPaths.length} sealed modules and integrity manifest`,
  );
}

main();
