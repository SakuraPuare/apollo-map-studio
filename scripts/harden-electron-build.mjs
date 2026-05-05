#!/usr/bin/env node
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distElectronDir = path.join(repoRoot, 'dist-electron');
const distDir = path.join(repoRoot, 'dist');
const mainPath = path.join(distElectronDir, 'main.cjs');
const integrityModuleName = 'ams-integrity.cjs';
const integrityPath = path.join(distElectronDir, integrityModuleName);
const encryptedPrefix = '/* APMS_ENC_V1 */\n';

const protectedModuleRelPaths = [
  'access-guard-runtime.cjs',
  'license/crypto.cjs',
  'license/machine-id.cjs',
  'license/manager.cjs',
  'license/public-key.cjs',
  'license/storage.cjs',
  'license/time-guard.cjs',
  'license/types.cjs',
];

function assertBuildOutput() {
  if (!existsSync(mainPath)) {
    throw new Error(
      'dist-electron/main.cjs is missing. Run `tsc -p tsconfig.electron.json` first.',
    );
  }
}

function toPosix(p) {
  return p.split(path.sep).join('/');
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

function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

function assertNoSourceMaps() {
  const mapFiles = [...walkFiles(distElectronDir), ...walkFiles(distDir)].filter((file) =>
    file.endsWith('.map'),
  );
  if (mapFiles.length > 0) {
    throw new Error(`Release hardening refuses to ship sourcemaps:\n${mapFiles.join('\n')}`);
  }
}

function makeKeyParts(key) {
  const mask = randomBytes(key.length);
  const masked = Buffer.alloc(key.length);
  for (let i = 0; i < key.length; i += 1) masked[i] = key[i] ^ mask[i];
  return { mask: [...mask], masked: [...masked] };
}

function encryptModule(relPath, key) {
  const absPath = path.join(distElectronDir, relPath);
  if (!existsSync(absPath)) return null;

  const source = readFileSync(absPath, 'utf8');
  if (source.startsWith(encryptedPrefix)) {
    throw new Error(`${relPath} is already hardened. Re-run the Electron TypeScript build first.`);
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(relPath, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(source, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = Buffer.concat([iv, tag, ciphertext]).toString('base64');
  writeFileSync(absPath, `${encryptedPrefix}${sealed}\n`, 'utf8');
  return relPath;
}

function loaderBootstrap(protectedRelPaths, keyParts) {
  return `
;(() => {
  const fs = require('node:fs');
  const path = require('node:path');
  const Module = require('node:module');
  const crypto = require('node:crypto');
  const protectedModules = new Set(${JSON.stringify(protectedRelPaths)});
  const prefix = ${JSON.stringify(encryptedPrefix)};
  const mask = Buffer.from(${JSON.stringify(keyParts.mask)});
  const masked = Buffer.from(${JSON.stringify(keyParts.masked)});
  const key = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i += 1) key[i] = mask[i] ^ masked[i];
  const originalCjsLoader = Module._extensions['.cjs'] || Module._extensions['.js'];
  if (typeof originalCjsLoader !== 'function') {
    throw new Error('No CommonJS loader available for Electron hardened modules');
  }
  Module._extensions['.cjs'] = function hardenedCjsLoader(mod, filename) {
    const rel = path.relative(__dirname, filename).split(path.sep).join('/');
    if (!protectedModules.has(rel)) return originalCjsLoader(mod, filename);
    const raw = fs.readFileSync(filename, 'utf8');
    if (!raw.startsWith(prefix)) throw new Error('Protected Electron module is not sealed: ' + rel);
    const blob = Buffer.from(raw.slice(prefix.length).trim(), 'base64');
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(rel, 'utf8'));
    decipher.setAuthTag(tag);
    const source = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return mod._compile(source, filename);
  };
})();
require('./${integrityModuleName}').verify(require('node:path').join(__dirname, '..'));
`;
}

function injectMainBootstrap(encryptedRelPaths, keyParts) {
  const original = readFileSync(mainPath, 'utf8');
  if (original.includes(integrityModuleName)) {
    throw new Error('dist-electron/main.cjs is already hardened. Re-run tsc before hardening.');
  }
  const bootstrap = loaderBootstrap(encryptedRelPaths, keyParts);
  writeFileSync(mainPath, `${bootstrap}\n${original}`, 'utf8');
}

function manifestFiles() {
  const files = [...walkFiles(distElectronDir), ...walkFiles(distDir)].filter((absPath) => {
    if (absPath === integrityPath) return false;
    if (absPath.endsWith('.map')) return false;
    return statSync(absPath).isFile();
  });

  const manifest = {};
  for (const absPath of files) {
    manifest[toPosix(path.relative(repoRoot, absPath))] = sha256File(absPath);
  }
  return manifest;
}

function writeIntegrityModule(manifest) {
  const source = `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MANIFEST = Object.freeze(${JSON.stringify(manifest, null, 2)});

function sha256(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function verify(appRoot) {
  for (const [relPath, expected] of Object.entries(MANIFEST)) {
    const absPath = path.join(appRoot, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error('Packaged file is missing: ' + relPath);
    }
    const actual = sha256(absPath);
    if (actual !== expected) {
      throw new Error('Packaged file integrity mismatch: ' + relPath);
    }
  }
}

module.exports = { MANIFEST, verify };
`;
  writeFileSync(integrityPath, source, 'utf8');
}

function main() {
  assertBuildOutput();
  assertNoSourceMaps();

  const key = randomBytes(32);
  const encryptedRelPaths = protectedModuleRelPaths
    .map((relPath) => encryptModule(relPath, key))
    .filter(Boolean);
  const keyParts = makeKeyParts(key);

  injectMainBootstrap(encryptedRelPaths, keyParts);
  writeIntegrityModule(manifestFiles());

  console.log(
    `[electron hardening] encrypted ${encryptedRelPaths.length} modules and wrote ${path.relative(
      repoRoot,
      integrityPath,
    )}`,
  );
}

main();
