import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';

import { computeMachineCode, readPersistedHint, readPersistedMachineHint } from '../machine-id.cjs';

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: NodeJS.Module | null, isMain: boolean): unknown;
};

const loadCjs = createRequire(__filename);
const machineIdPath = loadCjs.resolve(path.resolve(__dirname, '..', 'machine-id.cjs'));
const moduleWithLoad = Module as ModuleWithLoad;

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'apms-machine-id-'));
});

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('computeMachineCode returns stable code and digest on cached calls', () => {
  const first = computeMachineCode(dir);
  const second = computeMachineCode(dir);

  assert.match(first.code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  assert.equal(first.code, second.code);
  assert.match(first.digestHex, /^[a-f0-9]{64}$/);
  assert.equal(first.digestHex, second.digestHex);
  assert.deepEqual(first.signals, second.signals);
});

test('computeMachineCode writes a tamper-evident persisted hint', () => {
  const first = computeMachineCode(dir);
  const raw = readFileSync(path.join(dir, '.lic-machine.dat'), 'utf8').trim();
  const lines = raw.split(/\r?\n/);

  assert.equal(lines.length, 2);
  assert.equal(lines[0], first.code);
  assert.match(lines[1] ?? '', /^[a-f0-9]{64}$/);
  assert.deepEqual(readPersistedMachineHint(dir), { code: first.code, tampered: false });
});

test('readPersistedMachineHint accepts legacy plaintext hints for migration', () => {
  writeFileSync(path.join(dir, '.lic-machine.dat'), 'A6N0-SMBW-ENSG-SDGT\n');

  assert.deepEqual(readPersistedMachineHint(dir), {
    code: 'A6N0-SMBW-ENSG-SDGT',
    tampered: false,
  });
  assert.equal(readPersistedHint(dir), 'A6N0-SMBW-ENSG-SDGT');
});

test('readPersistedMachineHint reports malformed and HMAC-mismatched hints as tampered', () => {
  writeFileSync(path.join(dir, '.lic-machine.dat'), 'A6N0-SMBW-ENSG-SDGT\n' + '0'.repeat(64));

  const mismatched = readPersistedMachineHint(dir);
  assert.equal(mismatched.code, null);
  assert.equal(mismatched.tampered, true);
  assert.match(mismatched.tamperedReason ?? '', /HMAC/);
  assert.equal(readPersistedHint(dir), null);

  writeFileSync(path.join(dir, '.lic-machine.dat'), 'not-a-machine-code\n');
  const malformed = readPersistedMachineHint(dir);
  assert.equal(malformed.code, null);
  assert.equal(malformed.tampered, true);
  assert.match(malformed.tamperedReason ?? '', /malformed/);
});

test('readPersistedMachineHint distinguishes missing, empty, and malformed envelope variants', () => {
  assert.deepEqual(readPersistedMachineHint(dir), { code: null, tampered: false });
  assert.equal(readPersistedHint(dir), null);

  const cases = [
    { raw: '', reason: /empty/ },
    { raw: 'A6N0-SMBW-ENSG-SDG!\n' + '0'.repeat(64), reason: /code malformed/ },
    { raw: 'A6N0-SMBW-ENSG-SDGT\nnot-a-mac', reason: /MAC malformed/ },
    { raw: `A6N0-SMBW-ENSG-SDGT\n${'0'.repeat(64)}\nextra`, reason: /malformed/ },
  ];

  for (const { raw, reason } of cases) {
    writeFileSync(path.join(dir, '.lic-machine.dat'), raw);

    const hint = readPersistedMachineHint(dir);

    assert.equal(hint.code, null, `raw=${JSON.stringify(raw)}`);
    assert.equal(hint.tampered, true, `raw=${JSON.stringify(raw)}`);
    assert.match(hint.tamperedReason ?? '', reason);
    assert.equal(readPersistedHint(dir), null);
  }
});

test('computeMachineCode falls back when MAC and disk signals are unavailable', () => {
  const originalLoad = moduleWithLoad._load;
  const isolatedDir = mkdtempSync(path.join(tmpdir(), 'apms-machine-id-fallback-'));

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: NodeJS.Module | null,
    isMain: boolean,
  ) {
    if (request === 'node:os') {
      return {
        arch() {
          return 'x64';
        },
        cpus() {
          return [];
        },
        hostname() {
          return 'fallback-host';
        },
        networkInterfaces() {
          throw new Error('interfaces unavailable');
        },
        platform() {
          return 'linux';
        },
        release() {
          return '6.8.0-test';
        },
        totalmem() {
          return 1024 ** 3;
        },
      };
    }
    if (request === 'node:child_process') {
      return {
        execFileSync() {
          throw new Error('disk unavailable');
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete loadCjs.cache[machineIdPath];
    const isolated = loadCjs(machineIdPath) as typeof import('../machine-id.cjs');

    const result = isolated.computeMachineCode(isolatedDir);

    assert.match(result.code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    assert.match(result.digestHex, /^[a-f0-9]{64}$/);
    assert.deepEqual(result.signals, [
      'platform',
      'arch',
      'release-major',
      'hostname',
      'ram-gib',
      'mac',
      'disk',
    ]);
    assert.equal(isolated.readPersistedHint(isolatedDir), result.code);
  } finally {
    moduleWithLoad._load = originalLoad;
    delete loadCjs.cache[machineIdPath];
    rmSync(isolatedDir, { recursive: true, force: true });
  }
});
