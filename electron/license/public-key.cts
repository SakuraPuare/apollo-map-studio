/**
 * Embedded Ed25519 public key — the *only* trust anchor for activation codes.
 *
 * The matching private key lives in local `.env` / GitHub Actions secrets as
 * `APMS_LICENSE_PRIVATE_KEY_BASE64` and MUST never be shipped with the app.
 * Re-generate the pair with:
 *
 *     node tools/license-gen/gen-keys.mjs --rotate
 *
 * which atomically rewrites this file and writes a fresh private key to `.env`.
 */

export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkZBezo6wosC3Di7KaCUQKZ19IaXnRxbgjz6OtICDJA8=
-----END PUBLIC KEY-----
` as const;

/**
 * App-wide HMAC pepper. Combined with the machine code to derive both the
 * AES-GCM data-encryption key and the HMAC tamper-detection key. Rotating
 * this invalidates every existing on-disk license, so do not change without
 * shipping a migration.
 *
 * Note: this is *not* a secret in the cryptographic sense (anyone with the
 * binary can dump it), but it does prevent trivial cross-app replay and
 * forces an attacker to do reverse engineering rather than copy a token
 * blob between machines.
 */
export const APP_PEPPER =
  'apms.v1.5b8f3e1c-9d04-4a31-b76a-e1d5e9f4cf02:do-not-rotate-without-migration';

/**
 * Token magic prefix. Bumping this implicitly invalidates older tokens
 * (because `parseToken` rejects unknown prefixes) — useful for emergency
 * key rotation.
 */
export const TOKEN_PREFIX = 'APMS1';
