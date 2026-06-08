import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PRIVATE_KEY_BASE64_ENV,
  derivePublicKeyPem,
  readLicensePrivateKeyPem,
} from '../../tools/license-gen/env.mjs';

const tempRoots = new Set();

afterEach(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots.clear();
});

function makeEnv(privateKeyPem) {
  const root = path.join(tmpdir(), `apms-license-env-${process.pid}-${tempRoots.size}`);
  mkdirSync(root, { recursive: true });
  tempRoots.add(root);
  const envPath = path.join(root, '.env');
  const encoded = Buffer.from(privateKeyPem, 'utf8').toString('base64');
  writeFileSync(envPath, `${PRIVATE_KEY_BASE64_ENV}=${encoded}\n`, 'utf8');
  return envPath;
}

function privateKeyPem(type) {
  const { privateKey } =
    type === 'rsa' ? generateKeyPairSync(type, { modulusLength: 2048 }) : generateKeyPairSync(type);
  return privateKey.export({ type: 'pkcs8', format: 'pem' });
}

describe('license private key env loader', () => {
  it('accepts Ed25519 private keys and derives a public key', () => {
    const pem = privateKeyPem('ed25519');
    const envPath = makeEnv(pem);

    const key = readLicensePrivateKeyPem({ envPath, allowLegacyFile: false });

    expect(key.source).toBe(PRIVATE_KEY_BASE64_ENV);
    expect(key.pem).toBe(pem);
    expect(derivePublicKeyPem(key.pem)).toContain('BEGIN PUBLIC KEY');
  });

  it('rejects non-Ed25519 private keys before syncing the embedded public key', () => {
    const pem = privateKeyPem('rsa');
    const envPath = makeEnv(pem);

    expect(() => readLicensePrivateKeyPem({ envPath, allowLegacyFile: false })).toThrow(
      `${PRIVATE_KEY_BASE64_ENV} must be an Ed25519 private key, got rsa`,
    );
    expect(() => derivePublicKeyPem(pem)).toThrow('license private key must be Ed25519, got rsa');
  });
});
