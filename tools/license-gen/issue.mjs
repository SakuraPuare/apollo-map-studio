#!/usr/bin/env node
/**
 * Issue a signed activation code bound to a specific machine code.
 *
 *   node tools/license-gen/issue.mjs \
 *       --machine ABCD-EFGH-JKLM-NPQR \
 *       --days 365 \
 *       --name "Customer Inc."
 *
 * Optional:
 *   --expires "2026-12-31T23:59:59Z"   # absolute, overrides --days
 *   --features draw,export             # comma list, reserved for future
 *   --lic LIC-2026-0001                # license id; auto-generated if omitted
 *   --key tools/license-gen/keys/private.pem      # optional override
 *   APMS_LICENSE_PRIVATE_KEY_BASE64 in .env/CI    # default private-key source
 *   --quiet                            # suppress preamble; only print code
 *
 * Output: prints the activation code to stdout. It is safe to email/print
 * — without the matching machine code an attacker cannot use it.
 */

import { createPrivateKey, randomBytes, sign as edSign } from 'node:crypto';

import { readLicensePrivateKeyPem } from './env.mjs';

const TOKEN_PREFIX = 'APMS1';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'quiet') {
      out.quiet = true;
      continue;
    }
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

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

const machine = (args.machine ?? args.m ?? '').trim().toUpperCase();
if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(machine)) {
  fail('--machine is required and must look like ABCD-EFGH-JKLM-NPQR');
}

const expires = (() => {
  if (!args.expires) {
    const days = Number(args.days ?? 365);
    if (!Number.isFinite(days) || days <= 0 || days > 36525) {
      fail('--days must be a positive number ≤ 36525');
    }
    return Date.now() + Math.round(days * 24 * 60 * 60 * 1000);
  }

  const ts = Date.parse(args.expires);
  if (Number.isNaN(ts)) fail(`--expires not a valid ISO-8601 timestamp: ${args.expires}`);
  return ts;
})();

const lic =
  args.lic ??
  `LIC-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex').toUpperCase()}`;
const name = typeof args.name === 'string' ? args.name : '';
const features =
  typeof args.features === 'string'
    ? args.features
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

let keySource;
try {
  keySource = readLicensePrivateKeyPem({ keyPath: args.key });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const privateKey = createPrivateKey({ key: keySource.pem, format: 'pem' });

const payload = {
  v: 1,
  lic,
  machine,
  issued: Date.now(),
  expires,
  features: features.length > 0 ? features : undefined,
  name: name || undefined,
  nonce: randomBytes(16).toString('hex'),
};

const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
const sig = b64url(edSign(null, Buffer.from(body, 'utf8'), privateKey));
const token = `${TOKEN_PREFIX}.${body}.${sig}`;

if (!args.quiet) {
  const expiresLabel = expires === 0 ? 'perpetual' : new Date(expires).toISOString();
  console.error('--- license issued ---');
  console.error(`  id      : ${lic}`);
  console.error(`  machine : ${machine}`);
  console.error(`  name    : ${name || '(none)'}`);
  console.error(`  issued  : ${new Date(payload.issued).toISOString()}`);
  console.error(`  expires : ${expiresLabel}`);
  console.error(`  features: ${features.join(',') || '(none)'}`);
  console.error(`  key     : ${keySource.source}`);
  console.error('---------------------');
  console.error('');
  console.error('activation code:');
}
console.log(token);
