import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';

import { LicenseStorage } from '../storage.cjs';
import type { LicensePayload } from '../types.cjs';

const MACHINE = 'A6N0-SMBW-ENSG-SDGT';
const OTHER_MACHINE = 'B6N0-SMBW-ENSG-SDGT';
const ISSUED = Date.parse('2026-05-05T00:00:00.000Z');

let dir = '';

const payload: LicensePayload = {
  v: 1,
  lic: 'LIC-STORAGE-001',
  machine: MACHINE,
  issued: ISSUED,
  expires: ISSUED + 90 * 24 * 60 * 60 * 1000,
  nonce: '0123456789abcdef0123456789abcdef',
};

function storage(machine = MACHINE) {
  return new LicenseStorage(dir, machine);
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function tokenFor(p: LicensePayload): string {
  return `APMS1.${b64url(Buffer.from(JSON.stringify(p), 'utf8'))}.${b64url(Buffer.alloc(64))}`;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'apms-license-storage-'));
});

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('LicenseStorage round-trips an intact three-mirror license record', () => {
  const token = tokenFor(payload);
  storage().save(token, payload);

  const loaded = storage().load();

  assert.equal(loaded?.tampered, false);
  assert.equal(loaded?.token, token);
  assert.equal(loaded?.payload.lic, payload.lic);
});

test('LicenseStorage marks the install tampered when a mirror file is deleted', () => {
  storage().save(tokenFor(payload), payload);
  unlinkSync(path.join(dir, '.lic-shadow.dat'));

  const loaded = storage().load();

  assert.equal(loaded?.tampered, true);
  assert.match(loaded?.tamperedReason ?? '', /missing\/corrupt/);
});

test('LicenseStorage marks plaintext state edits tampered even when JSON remains valid', () => {
  storage().save(tokenFor(payload), payload);
  const statePath = path.join(dir, '.lic-state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
    tokenHash: string;
  };
  state.tokenHash = '0'.repeat(64);
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });

  const loaded = storage().load();

  assert.equal(loaded?.tampered, true);
  assert.match(loaded?.tamperedReason ?? '', /token hash|HMAC/);
});

test('LicenseStorage marks copied license blobs tampered on a different machine key', () => {
  storage().save(tokenFor(payload), payload);

  const loaded = storage(OTHER_MACHINE).load();

  assert.equal(loaded?.tampered, true);
  assert.match(loaded?.tamperedReason ?? '', /missing\/corrupt/);
});
