# License Hardening

Apollo Map Studio uses an offline activation model. This raises the cost of
common activation attacks, but no purely local desktop check can be made
uncrackable against an attacker who can patch the shipped binary or runtime.

## Covered Attacks

| Attack                          | Defense                                                                       | Regression                                    |
| ------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Forged activation code          | Ed25519 signature verification with only the public key shipped in the app    | `electron/license/__tests__/crypto.test.cts`  |
| Token for another machine       | Canonical machine-code binding in signed payload                              | `crypto.test.cts`                             |
| Expired or malformed token      | Strict payload validation for epoch windows, nonce, features, and field sizes | `crypto.test.cts`                             |
| Downgrade replay                | Manager refuses shorter expiry for the same license id                        | `electron/license/manager.cts`                |
| Local license file edits        | AES-GCM primary/shadow files plus HMAC-sealed state file                      | `electron/license/__tests__/storage.test.cts` |
| Deleted or partial mirror files | Three-file mirror cross-check marks install tampered                          | `storage.test.cts`                            |
| Copying blobs between machines  | Per-machine HKDF keys make copied encrypted blobs unreadable                  | `storage.test.cts`                            |
| Clock rollback                  | `TimeGuard` high-water timestamp, anchor mtime checks, and sticky tamper flag | `electron/license/time-guard.cts`             |

## Operational Requirements

- Keep `tools/license-gen/keys/private.pem` out of shipped builds and source
  control. The app must only contain `electron/license/public-key.cts`.
- Issue renewal tokens with the same `lic` id and a later `expires` value.
  Older tokens for the same id are intentionally rejected.
- Treat any `tampered`, `machine_mismatch`, `invalid`, `expired_trial`, or
  `expired_license` state as read-only in renderer code.
- For high-value deployments, combine offline activation with server-side
  entitlement checks or signed update channels. Local checks alone are
  bypassable by binary patching.

## Verification

Run the license hardening checks with:

```bash
rm -rf .tmp/electron-license-tests
pnpm exec tsc -p tsconfig.electron.test.json
node --test .tmp/electron-license-tests/electron/license/__tests__/*.test.cjs
```
