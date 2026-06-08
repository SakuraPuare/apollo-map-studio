import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { b64url, parseToken, safeEqual, verifyToken } from '../crypto.cjs';

const VALID_MACHINE = 'A6N0-SMBW-ENSG-SDGT';
const ISSUED = Date.parse('2026-05-05T00:00:00.000Z');

function tokenFor(payload: Record<string, unknown>, sig = randomBytes(64)): string {
  const fullPayload = {
    v: 1,
    lic: 'LIC-SECURITY-001',
    machine: VALID_MACHINE,
    issued: ISSUED,
    expires: ISSUED + 365 * 24 * 60 * 60 * 1000,
    nonce: '0123456789abcdef0123456789abcdef',
    ...payload,
  };
  return `APMS1.${b64url(Buffer.from(JSON.stringify(fullPayload), 'utf8'))}.${b64url(sig)}`;
}

test('license token parser accepts well-formed payloads but verifyToken rejects unsigned tokens', () => {
  const parsed = parseToken(tokenFor({}));

  assert.equal(parsed?.payload.lic, 'LIC-SECURITY-001');
  assert.equal(parsed ? verifyToken(parsed) : true, false);
});

test('license token parser rejects non-canonical machine codes', () => {
  assert.equal(parseToken(tokenFor({ machine: 'WEB-BROWSER' })), null);
  assert.equal(parseToken(tokenFor({ machine: 'A6N0-SMBW-ENSG-SDG!' })), null);
});

test('license token parser rejects invalid expiry windows', () => {
  assert.equal(parseToken(tokenFor({ expires: -1 })), null);
  assert.equal(parseToken(tokenFor({ expires: Number.NaN })), null);
  assert.equal(parseToken(tokenFor({ expires: ISSUED })), null);
  assert.equal(parseToken(tokenFor({ expires: ISSUED - 1 })), null);
  assert.notEqual(parseToken(tokenFor({ expires: 0 })), null);
});

test('license token parser rejects oversized or unsafe optional fields', () => {
  assert.equal(parseToken(tokenFor({ lic: '' })), null);
  assert.equal(parseToken(tokenFor({ nonce: '../not-a-nonce' })), null);
  assert.equal(parseToken(tokenFor({ name: 'x'.repeat(257) })), null);
  assert.equal(parseToken(tokenFor({ name: null })), null);
  assert.equal(parseToken(tokenFor({ name: 123 })), null);
  assert.equal(parseToken(tokenFor({ name: {} })), null);
  assert.notEqual(parseToken(tokenFor({ features: ['draw', 'export'] })), null);
  assert.equal(parseToken(tokenFor({ features: ['draw', '../../escape'] })), null);
  assert.equal(
    parseToken(tokenFor({ features: Array.from({ length: 65 }, (_, i) => `f${i}`) })),
    null,
  );
});

test('verifyToken rejects malformed framing and signatures with the wrong length', () => {
  assert.equal(parseToken('APMS1.not-json.signature'), null);
  assert.equal(parseToken(`APMS1.${b64url(Buffer.from('{}'))}.sig!nature`), null);
  assert.equal(parseToken(`APMS1.${b64url(Buffer.from('{}'))}.sig=nature`), null);

  const parsed = parseToken(tokenFor({}, randomBytes(63)));
  assert.notEqual(parsed, null);
  assert.equal(parsed ? verifyToken(parsed) : true, false);
});

test('parseToken rejects future token prefixes until the signing input is migrated', () => {
  const token = tokenFor({});
  const futurePrefixToken = token.replace(/^APMS1\./, 'APMS2.');

  assert.notEqual(parseToken(token), null);
  assert.equal(parseToken(futurePrefixToken), null);
});

test('safeEqual returns false instead of throwing for different UTF-8 byte lengths', () => {
  assert.equal(safeEqual('a', 'é'), false);
  assert.equal(safeEqual('é', 'é'), true);
});
