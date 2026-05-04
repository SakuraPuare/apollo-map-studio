#!/usr/bin/env node
/**
 * Generate a fresh Ed25519 keypair for the licensing system.
 *
 *   node tools/license-gen/gen-keys.mjs            # bootstrap (refuse if keys exist)
 *   node tools/license-gen/gen-keys.mjs --rotate   # force-rotate
 *
 * Side effects:
 *   - Writes the private key to root .env as APMS_LICENSE_PRIVATE_KEY_BASE64
 *   - Atomically rewrites electron/license/public-key.cts with the new public key
 *
 * Rotating keys invalidates every existing activation code in the wild. Use
 * sparingly and ship the new public key with the next release.
 */

import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import {
  EMBEDDED_PUBLIC_KEY_PATH,
  KEYS_DIR,
  LEGACY_PRIVATE_KEY_PATH,
  PRIVATE_KEY_BASE64_ENV,
  PUBLIC_KEY_PATH,
  ROOT_ENV_PATH,
  parseDotenv,
  replaceEmbeddedPublicKeySource,
} from './env.mjs';

const args = new Set(process.argv.slice(2));
const rotate = args.has('--rotate') || args.has('-r');

mkdirSync(KEYS_DIR, { recursive: true });

const existingEnv = existsSync(ROOT_ENV_PATH) ? readFileSync(ROOT_ENV_PATH, 'utf8') : '';
const existingEnvValues = parseDotenv(existingEnv);

if ((existingEnvValues[PRIVATE_KEY_BASE64_ENV] || existsSync(LEGACY_PRIVATE_KEY_PATH)) && !rotate) {
  console.error(`refusing to overwrite existing license private key`);
  console.error(
    `found ${PRIVATE_KEY_BASE64_ENV} in ${ROOT_ENV_PATH} or ${LEGACY_PRIVATE_KEY_PATH}`,
  );
  console.error('pass --rotate to confirm key rotation (this invalidates all in-the-wild codes)');
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privateKeyBase64 = Buffer.from(privPem, 'utf8').toString('base64');

const envLine = `${PRIVATE_KEY_BASE64_ENV}=${privateKeyBase64}`;
const nextEnv = existingEnvValues[PRIVATE_KEY_BASE64_ENV]
  ? existingEnv.replace(new RegExp(`^(?:export\\s+)?${PRIVATE_KEY_BASE64_ENV}=.*$`, 'm'), envLine)
  : `${existingEnv.trimEnd()}${existingEnv.trimEnd() ? '\n' : ''}${envLine}\n`;
writeFileSync(ROOT_ENV_PATH, nextEnv, { mode: 0o600 });
writeFileSync(PUBLIC_KEY_PATH, pubPem, { mode: 0o644 });

// Patch the embedded public key in the source tree.
let src;
try {
  src = readFileSync(EMBEDDED_PUBLIC_KEY_PATH, 'utf8');
} catch {
  console.error(`embedded key file not found at ${EMBEDDED_PUBLIC_KEY_PATH}`);
  process.exit(2);
}
try {
  src = replaceEmbeddedPublicKeySource(src, pubPem);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(3);
}
const tmp = `${EMBEDDED_PUBLIC_KEY_PATH}.tmp-${process.pid}`;
writeFileSync(tmp, src);
renameSync(tmp, EMBEDDED_PUBLIC_KEY_PATH);

console.log('wrote', ROOT_ENV_PATH, `(0600, ${PRIVATE_KEY_BASE64_ENV})`);
console.log('wrote', PUBLIC_KEY_PATH);
console.log('patched', EMBEDDED_PUBLIC_KEY_PATH);
console.log();
console.log('Next steps:');
console.log('  1. Commit electron/license/public-key.cts');
console.log(`  2. Add ${PRIVATE_KEY_BASE64_ENV} from .env to GitHub Actions secrets`);
console.log('  3. Build a fresh installer — old installers will reject codes from the new key');
