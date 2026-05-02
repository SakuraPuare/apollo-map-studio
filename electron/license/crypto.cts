/**
 * Crypto primitives used by the licensing layer.
 *
 *   - Ed25519 detached-signature verification (activation tokens)
 *   - AES-256-GCM authenticated encryption (license blob at rest)
 *   - HMAC-SHA256 (state file tamper detection)
 *   - HKDF-SHA256 derivation of (encKey, macKey) from machine code + pepper
 *   - Constant-time string compare
 *
 * All routines use Node's built-in `crypto` — no native deps, no third party.
 */

import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign as edSign,
  timingSafeEqual,
  verify as edVerify,
  createCipheriv,
  createDecipheriv,
  type KeyObject,
} from 'node:crypto';

import { APP_PEPPER, LICENSE_PUBLIC_KEY_PEM, TOKEN_PREFIX } from './public-key.cjs';
import type { LicensePayload } from './types.cjs';

// ─── base64url helpers ──────────────────────────────────────────────────

export function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str: string): Buffer {
  const pad = (4 - (str.length % 4)) % 4;
  const normal = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return Buffer.from(normal, 'base64');
}

// ─── Public-key cache ───────────────────────────────────────────────────

let cachedPublicKey: KeyObject | null = null;
function getPublicKey(): KeyObject {
  if (!cachedPublicKey) {
    cachedPublicKey = createPublicKey({ key: LICENSE_PUBLIC_KEY_PEM, format: 'pem' });
  }
  return cachedPublicKey;
}

// ─── Token format ───────────────────────────────────────────────────────

/**
 * Sign a payload with a PEM-encoded Ed25519 private key — used by the CLI
 * generator only. The desktop app never has the private key.
 */
export function signToken(payload: LicensePayload, privateKeyPem: string): string {
  const key = createPrivateKey({ key: privateKeyPem, format: 'pem' });
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(edSign(null, Buffer.from(body, 'utf8'), key));
  return `${TOKEN_PREFIX}.${body}.${sig}`;
}

export interface ParsedToken {
  payload: LicensePayload;
  bodyB64: string;
  sigB64: string;
}

/** Strip whitespace, validate prefix, split into body/signature. */
export function parseToken(token: string): ParsedToken | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim().replace(/\s+/g, '');
  const parts = trimmed.split('.');
  if (parts.length !== 3) return null;
  const [prefix, bodyB64, sigB64] = parts;
  if (prefix !== TOKEN_PREFIX) return null;
  if (!bodyB64 || !sigB64) return null;
  let payload: LicensePayload;
  try {
    payload = JSON.parse(fromB64url(bodyB64).toString('utf8')) as LicensePayload;
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1) return null;
  if (
    typeof payload.lic !== 'string' ||
    typeof payload.machine !== 'string' ||
    typeof payload.issued !== 'number' ||
    typeof payload.expires !== 'number' ||
    typeof payload.nonce !== 'string'
  ) {
    return null;
  }
  return { payload, bodyB64, sigB64 };
}

/** Constant-time Ed25519 signature verification. */
export function verifyToken(parsed: ParsedToken): boolean {
  try {
    const sig = fromB64url(parsed.sigB64);
    if (sig.length !== 64) return false;
    return edVerify(null, Buffer.from(parsed.bodyB64, 'utf8'), getPublicKey(), sig);
  } catch {
    return false;
  }
}

// ─── KDF: machine code → (encKey, macKey) ───────────────────────────────

const HKDF_INFO_ENC = Buffer.from('apms.license.enc.v1', 'utf8');
const HKDF_INFO_MAC = Buffer.from('apms.license.mac.v1', 'utf8');
const HKDF_INFO_FILE = Buffer.from('apms.file.key.v1', 'utf8');

/**
 * Derive a 32-byte symmetric key from `machineCode + APP_PEPPER` via HKDF.
 * The salt is the SHA-256 of the pepper so we never feed the same input
 * twice and the output is unique per (machine, info) tuple.
 */
function deriveKey(machineCode: string, info: Buffer, length = 32): Buffer {
  const ikm = Buffer.concat([
    Buffer.from(machineCode, 'utf8'),
    Buffer.from('|', 'utf8'),
    Buffer.from(APP_PEPPER, 'utf8'),
  ]);
  const salt = createHash('sha256').update(APP_PEPPER).digest();
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, length));
}

export function getEncKey(machineCode: string): Buffer {
  return deriveKey(machineCode, HKDF_INFO_ENC, 32);
}

export function getMacKey(machineCode: string): Buffer {
  return deriveKey(machineCode, HKDF_INFO_MAC, 32);
}

/** Sub-key for arbitrary file encryption (used by mirror files, time guard). */
export function getFileKey(machineCode: string, label: string): Buffer {
  const info = Buffer.concat([HKDF_INFO_FILE, Buffer.from(`:${label}`, 'utf8')]);
  return deriveKey(machineCode, info, 32);
}

// ─── AES-256-GCM ────────────────────────────────────────────────────────

const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;

export function aesEncrypt(key: Buffer, plaintext: Buffer, aad?: Buffer): Buffer {
  const iv = randomBytes(GCM_IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: iv | tag | ciphertext
  return Buffer.concat([iv, tag, ct]);
}

export function aesDecrypt(key: Buffer, blob: Buffer, aad?: Buffer): Buffer | null {
  if (blob.length < GCM_IV_LEN + GCM_TAG_LEN) return null;
  try {
    const iv = blob.subarray(0, GCM_IV_LEN);
    const tag = blob.subarray(GCM_IV_LEN, GCM_IV_LEN + GCM_TAG_LEN);
    const ct = blob.subarray(GCM_IV_LEN + GCM_TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    return null;
  }
}

// ─── HMAC ───────────────────────────────────────────────────────────────

export function hmacHex(key: Buffer, ...parts: (string | Buffer)[]): string {
  const h = createHmac('sha256', key);
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// ─── Misc ───────────────────────────────────────────────────────────────

export function sha256Hex(...parts: (string | Buffer)[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

export function randomNonce(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}
