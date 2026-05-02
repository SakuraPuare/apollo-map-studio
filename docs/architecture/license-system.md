# License System

The license system is desktop-only. Web builds use the renderer fallback state
from `src/lib/license-bridge.ts` and remain editable.

## Components

| Layer           | Files                               | Responsibility                                           |
| --------------- | ----------------------------------- | -------------------------------------------------------- |
| Main process    | `electron/license/*.cts`            | token verification, machine binding, storage, time guard |
| Preload         | `electron/preload.cts`              | expose typed IPC methods                                 |
| Renderer bridge | `src/lib/license-bridge.ts`         | safe wrapper and web fallback                            |
| Renderer store  | `src/store/licenseStore.ts`         | mirror state and activation prompt callback              |
| UI              | `ActivationDialog`, `LicenseBanner` | activation and read-only messaging                       |
| CLI             | `tools/license-gen/*.mjs`           | key generation, issue, verify                            |

## Token Format

Tokens use the configured prefix from `electron/license/public-key.cts`
(`TOKEN_PREFIX`, currently `APMS1`) plus signed payload data. The payload
contains license id, customer name, machine code, issue/expiry times, feature
flags and nonce.

Cryptography is implemented in `electron/license/crypto.cts`:

- Ed25519 signatures;
- AES-256-GCM for encrypted storage at rest;
- HKDF-derived keys bound to machine code;
- HMAC helpers for tamper checks.

## Machine Binding

`machine-id.cts` derives a stable machine code from platform signals and
normalizes it for activation. Issued licenses are bound to that machine code;
activation on a different machine fails.

## Storage And Time Guard

`storage.cts` writes encrypted license mirrors under Electron `userData`.
Multiple files are used so simple deletion or rollback is detectable.

`time-guard.cts` tracks monotonic time evidence. If the wall clock moves
backward suspiciously, the state can become read-only/tampered.

## Renderer Editing Gate

All edit-like user actions should flow through `useActionDispatcher`, which
calls `assertEditable()` before executing edit/tool/selection operations.
Store mutators such as `addEntity`, `updateEntity`, `removeEntity` and
`reparentEntity` also call `assertEditable()` directly.

When `canEdit` is false, `assertEditable()` opens the activation dialog through
`licenseStore.promptActivation`, rate-limited to avoid repeated modal spam.

## CLI Operations

See `tools/license-gen/README.md` for full commands. The short version:

```bash
node tools/license-gen/gen-keys.mjs
node tools/license-gen/issue.mjs --machine XXXX-XXXX-XXXX-XXXX --name "Customer"
node tools/license-gen/verify.mjs --code "$CODE"
```

The private key must not ship with the application. Only
`electron/license/public-key.cts` is embedded in builds.
