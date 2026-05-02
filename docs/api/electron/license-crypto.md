# License crypto

> Source: `electron/license/crypto.cts`

## Overview

`crypto.cts` collects every cryptographic primitive used by the
licensing layer:

- **Ed25519** detached-signature verification (activation tokens) and
  signing (used only by the offline license-gen CLI, never bundled
  into the desktop app).
- **AES-256-GCM** authenticated encryption (license blob, time-state,
  shadow files at rest).
- **HMAC-SHA256** for tamper detection on plaintext-format state files.
- **HKDF-SHA256** to derive per-purpose subkeys from the machine code +
  app pepper.
- **Constant-time** string compare and base64url helpers.

All primitives use Node's built-in `crypto` — no native dependencies.

## Exports

```ts
// Encoding
export function b64url(buf: Buffer): string;
export function fromB64url(str: string): Buffer;

// Token format
export function signToken(payload: LicensePayload, privateKeyPem: string): string;
export function parseToken(token: string): ParsedToken | null;
export function verifyToken(parsed: ParsedToken): boolean;

// Key derivation
export function getEncKey(machineCode: string): Buffer;
export function getMacKey(machineCode: string): Buffer;
export function getFileKey(machineCode: string, label: string): Buffer;

// Symmetric encryption
export function aesEncrypt(key: Buffer, plaintext: Buffer, aad?: Buffer): Buffer;
export function aesDecrypt(key: Buffer, blob: Buffer, aad?: Buffer): Buffer | null;

// Authentication
export function hmacHex(key: Buffer, ...parts: (string | Buffer)[]): string;
export function safeEqual(a: string, b: string): boolean;

// Misc
export function sha256Hex(...parts: (string | Buffer)[]): string;
export function randomNonce(bytes?: number): string;

export interface ParsedToken {
  payload: LicensePayload;
  bodyB64: string;
  sigB64: string;
}
```

## Behavior

### Public key

The Ed25519 public key is embedded at build time in
`electron/license/public-key.cts`:

```ts
import { LICENSE_PUBLIC_KEY_PEM, APP_PEPPER, TOKEN_PREFIX } from './public-key.cjs';
```

The matching **private** key lives only in the offline issuer
toolchain (`tools/license-gen/`). The desktop app cannot mint new
tokens — only verify existing ones.

```ts
let cachedPublicKey: KeyObject | null = null;
function getPublicKey(): KeyObject {
  if (!cachedPublicKey) {
    cachedPublicKey = createPublicKey({ key: LICENSE_PUBLIC_KEY_PEM, format: 'pem' });
  }
  return cachedPublicKey;
}
```

The key is parsed once and cached for subsequent verifications.

### Token format

```
APMS1.<base64url(payload)>.<base64url(ed25519-signature)>
```

Three dot-separated segments:

1. Prefix `APMS1` — bumped on schema changes.
2. JSON payload encoded as base64url.
3. 64-byte Ed25519 signature, base64url.

`parseToken(token)`:

```ts
const trimmed = token.trim().replace(/\s+/g, '');
const parts = trimmed.split('.');
if (parts.length !== 3) return null;
const [prefix, bodyB64, sigB64] = parts;
if (prefix !== TOKEN_PREFIX) return null;
// JSON.parse + shape validation
if (!payload || payload.v !== 1) return null;
```

Whitespace-tolerant — copy-pasted multi-line tokens work.

`verifyToken(parsed)`:

```ts
const sig = fromB64url(parsed.sigB64);
if (sig.length !== 64) return false;
return edVerify(null, Buffer.from(parsed.bodyB64, 'utf8'), getPublicKey(), sig);
```

::: warning Critical: signature is over the encoded body, not the raw JSON
The signature commits to `Buffer.from(bodyB64, 'utf8')` — the
base64url string itself, not the decoded JSON. This avoids
JSON-canonicalization issues (key order, whitespace) where two
"equivalent" payloads would produce different signatures.
:::

### Key derivation: HKDF

```ts
const HKDF_INFO_ENC = Buffer.from('apms.license.enc.v1', 'utf8');
const HKDF_INFO_MAC = Buffer.from('apms.license.mac.v1', 'utf8');
const HKDF_INFO_FILE = Buffer.from('apms.file.key.v1', 'utf8');

function deriveKey(machineCode: string, info: Buffer, length = 32): Buffer {
  const ikm = Buffer.concat([
    Buffer.from(machineCode, 'utf8'),
    Buffer.from('|', 'utf8'),
    Buffer.from(APP_PEPPER, 'utf8'),
  ]);
  const salt = createHash('sha256').update(APP_PEPPER).digest();
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, length));
}
```

| Helper                    | Info string                | Use                                   |
| ------------------------- | -------------------------- | ------------------------------------- |
| `getEncKey(machineCode)`  | `apms.license.enc.v1`      | License blob AES-256-GCM key          |
| `getMacKey(machineCode)`  | `apms.license.mac.v1`      | HMAC for state files                  |
| `getFileKey(code, label)` | `apms.file.key.v1:<label>` | Per-file key (clock, shadow, primary) |

The salt is `SHA256(APP_PEPPER)` — domain-separated from the IKM so
HKDF is well-defined for each consumer.

### AES-256-GCM

```ts
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;

export function aesEncrypt(key, plaintext, aad?): Buffer {
  const iv = randomBytes(GCM_IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]); // iv | tag | ciphertext
}
```

The serialized layout is `iv (12) | tag (16) | ciphertext (n)` —
deterministic offsets that callers can rely on. AAD lets each
consumer add a domain string (e.g. `apms.primary.v1`) so the same
key can never be replayed across roles.

`aesDecrypt(...)` returns `null` (never throws) on:

- Truncated input (< 28 bytes).
- Wrong key.
- Tampered tag.
- AAD mismatch.

This is the contract `LicenseStorage` and `TimeGuard` rely on for
safe error handling.

### HMAC and constant-time compare

```ts
export function hmacHex(key: Buffer, ...parts: (string | Buffer)[]): string;
export function safeEqual(a: string, b: string): boolean;
```

`safeEqual` rejects type mismatches and length mismatches early, then
falls through to `timingSafeEqual` on equal-length buffers.
`timingSafeEqual` would throw on unequal lengths; the early return
keeps the API ergonomic.

### Misc helpers

```ts
export function sha256Hex(...parts): string; // hex digest
export function randomNonce(bytes = 16): string; // hex random
```

Used for token-hash records, state-file nonces, and identity
randomness.

## Examples

### Verifying an activation token

```ts
import { parseToken, verifyToken, safeEqual } from './crypto.cjs';

const parsed = parseToken(rawToken);
if (!parsed || !verifyToken(parsed)) {
  return { ok: false, reason: 'invalid signature' };
}
if (!safeEqual(parsed.payload.machine, currentMachineCode)) {
  return { ok: false, reason: 'machine mismatch' };
}
```

### Encrypting a per-file payload

```ts
const key = getFileKey(machineCode, 'primary');
const aad = Buffer.from('apms.primary.v1', 'utf8');
const blob = aesEncrypt(key, Buffer.from(JSON.stringify(record), 'utf8'), aad);
fs.writeFileSync(path, blob);
```

### Issuing a token (offline only)

```ts
// In tools/license-gen — never bundled into desktop app
const token = signToken(payload, fs.readFileSync('private.pem', 'utf8'));
```

## Related

- [License manager](/api/electron/license-manager) — primary consumer
- [License storage](/api/electron/license-storage) — uses `aesEncrypt` / `hmacHex` / `getFileKey`
- [License time-guard](/api/electron/license-time-guard) — same primitives
- [Architecture: license system](/architecture/license-system)
