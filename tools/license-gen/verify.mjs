#!/usr/bin/env node
/**
 * Offline verifier — sanity-check a generated activation code against
 * the bundled public key without launching the desktop app.
 *
 *   node tools/license-gen/verify.mjs \
 *       --code "$(cat code.txt)" [--key tools/license-gen/keys/public.pem]
 *
 * If --key is omitted the script will read the embedded public key from
 * electron/license/public-key.cts so it tests the *exact* trust anchor
 * the shipped app will use.
 */

import { createPublicKey, verify as edVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PREFIX = 'APMS1';
const EMBEDDED_PATH = path.resolve(__dirname, '..', '..', 'electron', 'license', 'public-key.cts');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

function fromB64url(str) {
  const pad = (4 - (str.length % 4)) % 4;
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64');
}

const args = parseArgs(process.argv.slice(2));
const code = (args.code ?? args.c ?? '').toString().trim();
if (!code) {
  console.error('usage: verify.mjs --code <APMS1.…>');
  process.exit(1);
}
const parts = code.split('.');
if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
  console.error('invalid token format');
  process.exit(2);
}

let publicPem;
if (args.key) {
  publicPem = readFileSync(path.resolve(args.key), 'utf8');
} else {
  const src = readFileSync(EMBEDDED_PATH, 'utf8');
  const m = src.match(/LICENSE_PUBLIC_KEY_PEM = `([\s\S]*?)`/);
  if (!m) {
    console.error('cannot extract embedded key');
    process.exit(3);
  }
  publicPem = m[1];
}
const publicKey = createPublicKey({ key: publicPem, format: 'pem' });

let ok = false;
try {
  ok = edVerify(null, Buffer.from(parts[1], 'utf8'), publicKey, fromB64url(parts[2]));
} catch {
  ok = false;
}

let payload = null;
try {
  payload = JSON.parse(fromB64url(parts[1]).toString('utf8'));
} catch {
  payload = null;
}
console.log(JSON.stringify({ valid: ok, payload }, null, 2));
process.exit(ok ? 0 : 4);
