import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  encryptedPrefix,
  hardenElectronBuild,
  protectedModuleRelPaths,
} from '../harden-electron-build.mjs';
import { verifyElectronHardening } from '../verify-electron-hardening.mjs';

const require = createRequire(import.meta.url);
const tempRoots = new Set();

let consoleLogSpy;

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy?.mockRestore();
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.clear();
});

async function makeTempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'apms-electron-hardening-'));
  tempRoots.add(root);
  return root;
}

function writeFixtureFile(root, relPath, source) {
  const absPath = path.join(root, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, source, 'utf8');
}

function readFixtureFile(root, relPath) {
  return readFileSync(path.join(root, relPath), 'utf8');
}

function defaultMainSource() {
  return [
    "'use strict';",
    "require('./access-guard-runtime.cjs');",
    "require('./license/manager.cjs');",
    "console.log('fixture main');",
    '',
  ].join('\n');
}

function defaultProtectedSource(relPath) {
  return [
    "'use strict';",
    `module.exports = ${JSON.stringify({ relPath, loaded: true })};`,
    '',
  ].join('\n');
}

async function createBuildFixture(options = {}) {
  const root = await makeTempRoot();

  writeFixtureFile(root, 'dist-electron/main.cjs', options.mainSource ?? defaultMainSource());

  for (const relPath of protectedModuleRelPaths) {
    if (options.omitProtected?.includes(relPath)) continue;
    writeFixtureFile(
      root,
      `dist-electron/${relPath}`,
      options.protectedSources?.[relPath] ?? defaultProtectedSource(relPath),
    );
  }

  writeFixtureFile(root, 'dist/index.html', '<!doctype html><div id="root"></div>\n');
  writeFixtureFile(root, 'dist/assets/app.js', "console.log('renderer');\n");

  for (const [relPath, source] of Object.entries(options.extraFiles ?? {})) {
    writeFixtureFile(root, relPath, source);
  }

  return root;
}

function hardenFixture(root) {
  return hardenElectronBuild({ repoRoot: root });
}

function verifyFixture(root) {
  return verifyElectronHardening({ repoRoot: root });
}

function loadIntegrity(root) {
  const integrityPath = path.join(root, 'dist-electron/ams-integrity.cjs');
  delete require.cache[require.resolve(integrityPath)];
  return require(integrityPath);
}

describe('Electron hardening scripts', () => {
  it('hardens a fixture build and verifies sealed modules without adding integrity to its own manifest', async () => {
    const root = await createBuildFixture();

    const result = hardenFixture(root);
    const integrity = loadIntegrity(root);

    expect(result.encryptedRelPaths).toEqual(protectedModuleRelPaths);
    expect(integrity.MANIFEST['dist-electron/ams-integrity.cjs']).toBeUndefined();
    expect(integrity.MANIFEST['dist-electron/main.cjs']).toMatch(/^[a-f0-9]{64}$/);
    expect(integrity.MANIFEST['dist/assets/app.js']).toMatch(/^[a-f0-9]{64}$/);

    for (const relPath of protectedModuleRelPaths) {
      const sealed = readFixtureFile(root, `dist-electron/${relPath}`);
      expect(sealed.startsWith(encryptedPrefix)).toBe(true);
      expect(sealed).not.toContain('module.exports');
    }

    expect(() => verifyFixture(root)).not.toThrow();
  });

  it('rejects missing or already sealed protected modules during hardening', async () => {
    const missingRoot = await createBuildFixture({
      omitProtected: ['license/replay-policy.cjs'],
    });
    expect(() => hardenFixture(missingRoot)).toThrow(
      'Protected Electron module is missing: license/replay-policy.cjs',
    );

    const sealedRoot = await createBuildFixture({
      protectedSources: {
        'license/crypto.cjs': `${encryptedPrefix}already-sealed\n`,
      },
    });
    expect(() => hardenFixture(sealedRoot)).toThrow(
      'license/crypto.cjs is already hardened. Re-run the Electron TypeScript build first.',
    );
  });

  it('rejects sourcemaps and sourceMappingURL references before hardening', async () => {
    const mapRoot = await createBuildFixture({
      extraFiles: {
        'dist/assets/app.js.map': '{}\n',
      },
    });
    expect(() => hardenFixture(mapRoot)).toThrow('Release hardening refuses to ship sourcemaps');

    const referenceRoot = await createBuildFixture({
      extraFiles: {
        'dist/assets/chunk.js': "console.log('debug');\n//# sourceMappingURL=chunk.js.map\n",
      },
    });
    expect(() => hardenFixture(referenceRoot)).toThrow(
      'Release hardening refuses to ship sourceMappingURL references',
    );
  });

  it('rejects sourceMappingURL references and test artifacts during verification', async () => {
    const sourceMapRoot = await createBuildFixture();
    hardenFixture(sourceMapRoot);
    writeFixtureFile(
      sourceMapRoot,
      'dist/assets/debug.js',
      "console.log('debug');\n//# sourceMappingURL=debug.js.map\n",
    );
    expect(() => verifyFixture(sourceMapRoot)).toThrow(
      'hardened build contains sourceMappingURL references',
    );

    const testArtifactRoot = await createBuildFixture();
    hardenFixture(testArtifactRoot);
    writeFixtureFile(testArtifactRoot, 'dist-electron/__tests__/main.test.cjs', "'use strict';\n");
    expect(() => verifyFixture(testArtifactRoot)).toThrow(
      'hardened build contains Electron test artifacts',
    );
  });

  it('rejects sourcemap files during verification', async () => {
    const root = await createBuildFixture();
    hardenFixture(root);

    writeFixtureFile(root, 'dist/assets/debug.js.map', '{"version":3}\n');

    expect(() => verifyFixture(root)).toThrow('hardened build contains sourcemaps');
  });

  it('rejects missing protected modules and leaked plaintext markers during verification', async () => {
    const missingRoot = await createBuildFixture();
    hardenFixture(missingRoot);
    rmSync(path.join(missingRoot, 'dist-electron/license/storage.cjs'));
    expect(() => verifyFixture(missingRoot)).toThrow(
      'protected Electron module is missing: license/storage.cjs',
    );

    const markerRoot = await createBuildFixture();
    hardenFixture(markerRoot);
    writeFixtureFile(
      markerRoot,
      'dist-electron/access-guard-runtime.cjs',
      `${encryptedPrefix}ACCESS_GUARD_BLOCKLIST\n`,
    );
    expect(() => verifyFixture(markerRoot)).toThrow(
      'protected Electron module still contains plaintext markers (ACCESS_GUARD_BLOCKLIST): access-guard-runtime.cjs',
    );
  });

  it('rejects protected modules that are present but not sealed during verification', async () => {
    const root = await createBuildFixture();
    hardenFixture(root);

    writeFixtureFile(root, 'dist-electron/license/crypto.cjs', defaultProtectedSource('crypto'));

    expect(() => verifyFixture(root)).toThrow(
      'protected Electron module is not sealed: license/crypto.cjs',
    );
  });

  it('rejects invalid bootstrap order and missing protected module bootstrap entries', async () => {
    const orderRoot = await createBuildFixture();
    hardenFixture(orderRoot);
    writeFixtureFile(
      orderRoot,
      'dist-electron/main.cjs',
      `require('./access-guard-runtime.cjs');\n${readFixtureFile(orderRoot, 'dist-electron/main.cjs')}`,
    );
    expect(() => verifyFixture(orderRoot)).toThrow(
      'encrypted module loader must run before access guard runtime is required',
    );

    const entryRoot = await createBuildFixture();
    hardenFixture(entryRoot);
    writeFixtureFile(
      entryRoot,
      'dist-electron/main.cjs',
      readFixtureFile(entryRoot, 'dist-electron/main.cjs').replace(
        '"license/replay-policy.cjs"',
        '"license/replay-policy-missing.cjs"',
      ),
    );
    expect(() => verifyFixture(entryRoot)).toThrow(
      'encrypted module loader is missing protected module entries:\nlicense/replay-policy.cjs',
    );
  });

  it('rejects integrity manifest tampering and missing packaged files', async () => {
    const tamperedRoot = await createBuildFixture();
    hardenFixture(tamperedRoot);
    writeFixtureFile(tamperedRoot, 'dist/assets/app.js', "console.log('tampered');\n");
    expect(() => verifyFixture(tamperedRoot)).toThrow(
      'Packaged file integrity mismatch: dist/assets/app.js',
    );

    const missingRoot = await createBuildFixture();
    hardenFixture(missingRoot);
    rmSync(path.join(missingRoot, 'dist/assets/app.js'));
    expect(existsSync(path.join(missingRoot, 'dist/assets/app.js'))).toBe(false);
    expect(() => verifyFixture(missingRoot)).toThrow(
      'Integrity manifest references missing packaged files:\ndist/assets/app.js',
    );
  });

  it('rejects packaged files that are not covered by the integrity manifest', async () => {
    const root = await createBuildFixture();
    hardenFixture(root);

    writeFixtureFile(root, 'dist/assets/injected.js', "console.log('injected');\n");

    expect(() => verifyFixture(root)).toThrow(
      'Integrity manifest is missing packaged files:\ndist/assets/injected.js',
    );
  });
});
