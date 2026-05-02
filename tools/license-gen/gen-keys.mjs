#!/usr/bin/env node
/**
 * Generate a fresh Ed25519 keypair for the licensing system.
 *
 *   node tools/license-gen/gen-keys.mjs            # bootstrap (refuse if keys exist)
 *   node tools/license-gen/gen-keys.mjs --rotate   # force-rotate
 *
 * Side effects:
 *   - Writes the private key to tools/license-gen/keys/private.pem (chmod 600)
 *   - Atomically rewrites electron/license/public-key.cts with the new public key
 *
 * Rotating keys invalidates every existing activation code in the wild. Use
 * sparingly and ship the new public key with the next release.
 */

import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_PATH = path.join(KEYS_DIR, 'public.pem');
const EMBEDDED_PATH = path.resolve(__dirname, '..', '..', 'electron', 'license', 'public-key.cts');

const args = new Set(process.argv.slice(2));
const rotate = args.has('--rotate') || args.has('-r');

mkdirSync(KEYS_DIR, { recursive: true });

if (existsSync(PRIVATE_PATH) && !rotate) {
  console.error(`refusing to overwrite existing private key at ${PRIVATE_PATH}`);
  console.error('pass --rotate to confirm key rotation (this invalidates all in-the-wild codes)');
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

writeFileSync(PRIVATE_PATH, privPem, { mode: 0o600 });
chmodSync(PRIVATE_PATH, 0o600);
writeFileSync(PUBLIC_PATH, pubPem, { mode: 0o644 });

// Patch the embedded public key in the source tree.
let src;
try {
  src = readFileSync(EMBEDDED_PATH, 'utf8');
} catch {
  console.error(`embedded key file not found at ${EMBEDDED_PATH}`);
  process.exit(2);
}
const before = src;
src = src.replace(
  /export const LICENSE_PUBLIC_KEY_PEM = `[\s\S]*?` as const;/,
  `export const LICENSE_PUBLIC_KEY_PEM = \`${pubPem.trimEnd()}\n\` as const;`,
);
if (src === before) {
  console.error(`failed to patch ${EMBEDDED_PATH}: marker not found`);
  process.exit(3);
}
const tmp = `${EMBEDDED_PATH}.tmp-${process.pid}`;
writeFileSync(tmp, src);
renameSync(tmp, EMBEDDED_PATH);

console.log('wrote', PRIVATE_PATH, '(0600)');
console.log('wrote', PUBLIC_PATH);
console.log('patched', EMBEDDED_PATH);
console.log();
console.log('Next steps:');
console.log('  1. Commit electron/license/public-key.cts');
console.log('  2. Keep tools/license-gen/keys/private.pem OFF the device that ships builds');
console.log('  3. Build a fresh installer — old installers will reject codes from the new key');
