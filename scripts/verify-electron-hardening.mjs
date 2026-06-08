#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const encryptedPrefix = '/* APMS_ENC_V1 */\n';
const integrityModuleName = 'ams-integrity.cjs';

const protectedModuleRelPaths = [
  'access-guard-runtime.cjs',
  'license/crypto.cjs',
  'license/machine-id.cjs',
  'license/manager.cjs',
  'license/public-key.cjs',
  'license/replay-policy.cjs',
  'license/storage.cjs',
  'license/time-guard.cjs',
  'license/types.cjs',
];

const plaintextMarkers = [
  'ACCESS_GUARD_BLOCKLIST',
  'LICENSE_PUBLIC_KEY_PEM',
  'function parseToken',
  'function verifyToken',
  'checkAccessGuardAccess',
  'class LicenseManager',
  'class LicenseStorage',
  'class TimeGuard',
  'isLicenseExpiryDowngrade',
  'collectSignals',
  'deriveMachineCode',
];

function createVerifyContext(options = {}) {
  const repoRoot = options.repoRoot
    ? path.resolve(options.repoRoot)
    : path.resolve(__dirname, '..');
  const distElectronDir = options.distElectronDir
    ? path.resolve(options.distElectronDir)
    : path.join(repoRoot, 'dist-electron');
  const distDir = options.distDir ? path.resolve(options.distDir) : path.join(repoRoot, 'dist');
  const mainPath = path.join(distElectronDir, 'main.cjs');
  const integrityPath = path.join(distElectronDir, integrityModuleName);

  return { repoRoot, distElectronDir, distDir, mainPath, integrityPath };
}

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

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoTestArtifacts(context, files) {
  const testArtifacts = files.filter((file) => {
    const relPath = path.relative(context.repoRoot, file).split(path.sep).join('/');
    return (
      relPath.startsWith('dist-electron/') &&
      (relPath.includes('/__tests__/') ||
        relPath.endsWith('.test.cjs') ||
        relPath.endsWith('.spec.cjs'))
    );
  });

  assert(
    testArtifacts.length === 0,
    `hardened build contains Electron test artifacts:\n${testArtifacts.join('\n')}`,
  );
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

function assertEncryptedModules(context) {
  for (const relPath of protectedModuleRelPaths) {
    const absPath = path.join(context.distElectronDir, relPath);
    assert(existsSync(absPath), `protected Electron module is missing: ${relPath}`);

    const source = readFileSync(absPath, 'utf8');
    assert(
      source.startsWith(encryptedPrefix),
      `protected Electron module is not sealed: ${relPath}. Run pnpm build:desktop to regenerate hardened artifacts.`,
    );

    const leakedMarkers = plaintextMarkers.filter((marker) => source.includes(marker));
    assert(
      leakedMarkers.length === 0,
      `protected Electron module still contains plaintext markers (${leakedMarkers.join(', ')}): ${relPath}`,
    );
  }
}

function assertMainBootstrap(context) {
  assert(existsSync(context.mainPath), 'dist-electron/main.cjs is missing');
  const source = readFileSync(context.mainPath, 'utf8');
  const loaderIndex = source.indexOf('APMS_ENC_V1');
  const accessGuardIndex = requireIndex(source, 'access-guard-runtime.cjs');
  const licenseIndex = requireIndex(source, 'license/manager.cjs');

  assert(
    source.includes('APMS_ENC_V1'),
    'dist-electron/main.cjs is missing the encrypted module loader',
  );
  assert(
    source.includes('ams-integrity.cjs'),
    'dist-electron/main.cjs is missing the integrity verifier',
  );
  assert(
    source.includes("Module._extensions['.cjs'] || Module._extensions['.js']"),
    'encrypted module loader must fall back to the .js CommonJS loader when .cjs has no native loader',
  );
  assert(
    source.includes('No CommonJS loader available for Electron hardened modules'),
    'encrypted module loader must fail clearly when no CommonJS loader is available',
  );
  const missingProtectedModules = protectedModuleRelPaths.filter(
    (relPath) => !source.includes(JSON.stringify(relPath)),
  );
  assert(
    missingProtectedModules.length === 0,
    `encrypted module loader is missing protected module entries:\n${missingProtectedModules.join('\n')}`,
  );
  assert(
    accessGuardIndex >= 0,
    'dist-electron/main.cjs is missing the access guard runtime import',
  );
  assert(licenseIndex >= 0, 'dist-electron/main.cjs is missing the license manager import');
  assert(
    loaderIndex < accessGuardIndex,
    'encrypted module loader must run before access guard runtime is required',
  );
  assert(
    loaderIndex < licenseIndex,
    'encrypted module loader must run before license modules are required',
  );
}

function requireIndex(source, relPath) {
  const singleQuoteIndex = source.indexOf(`require('./${relPath}')`);
  const doubleQuoteIndex = source.indexOf(`require("./${relPath}")`);
  return singleQuoteIndex >= 0 ? singleQuoteIndex : doubleQuoteIndex;
}

function manifestEligibleFiles(context, files) {
  return files
    .map((file) => toPosix(path.relative(context.repoRoot, file)))
    .filter(
      (relPath) => relPath !== `dist-electron/${integrityModuleName}` && !relPath.endsWith('.map'),
    )
    .sort();
}

function assertManifestMatchesFiles(context, files, manifest) {
  const expected = new Set(Object.keys(manifest));
  const actual = new Set(manifestEligibleFiles(context, files));
  const missing = [...actual].filter((relPath) => !expected.has(relPath));
  assert(
    missing.length === 0,
    `Integrity manifest is missing packaged files:\n${missing.join('\n')}`,
  );
  const stale = [...expected].filter((relPath) => !actual.has(relPath));
  assert(
    stale.length === 0,
    `Integrity manifest references missing packaged files:\n${stale.join('\n')}`,
  );
}

function assertIntegrity(context, files) {
  assert(existsSync(context.integrityPath), 'dist-electron/ams-integrity.cjs is missing');
  delete require.cache[require.resolve(context.integrityPath)];
  const integrity = require(context.integrityPath);
  assert(typeof integrity.verify === 'function', 'integrity module does not export verify()');
  assert(
    integrity.MANIFEST && typeof integrity.MANIFEST === 'object',
    'integrity manifest is missing',
  );
  assertManifestMatchesFiles(context, files, integrity.MANIFEST);
  integrity.verify(context.repoRoot);
}

export function verifyElectronHardening(options = {}) {
  const context = createVerifyContext(options);

  assert(
    existsSync(context.distElectronDir),
    'dist-electron is missing. Run `pnpm build:desktop` first.',
  );

  const files = [...walkFiles(context.distElectronDir), ...walkFiles(context.distDir)].filter(
    (file) => statSync(file).isFile(),
  );

  assertNoSourceMaps(files);
  assertNoTestArtifacts(context, files);
  assertEncryptedModules(context);
  assertMainBootstrap(context);
  assertIntegrity(context, files);

  console.log(
    `[electron hardening] verified ${protectedModuleRelPaths.length} sealed modules and integrity manifest`,
  );

  return {
    fileCount: files.length,
    protectedModuleCount: protectedModuleRelPaths.length,
  };
}

function main() {
  verifyElectronHardening();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  assertEncryptedModules,
  assertIntegrity,
  assertMainBootstrap,
  assertManifestMatchesFiles,
  assertNoSourceMaps,
  assertNoTestArtifacts,
  createVerifyContext,
  encryptedPrefix,
  integrityModuleName,
  plaintextMarkers,
  protectedModuleRelPaths,
  requireIndex,
};
