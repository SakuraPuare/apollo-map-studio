# Apollo Map Studio — License Generator

Self-contained offline issuance for activation codes. The desktop app holds
only the Ed25519 **public** key; this folder owns the matching private key
and never has to ship.

## Files

```
gen-keys.mjs   — bootstrap or rotate the Ed25519 keypair
issue.mjs      — sign an activation code for a customer's machine
verify.mjs     — sanity-check a code against the embedded public key
keys/          — generated private/public PEM (gitignored, chmod 600)
```

> The repository ships with a checked-in **public** key in
> `electron/license/public-key.cts`. Running `gen-keys.mjs` will overwrite it
> with a fresh pair — make sure you commit the patched source file together
> with the next release if you rotate.

## Bootstrap (run once)

```sh
node tools/license-gen/gen-keys.mjs
```

This:

- writes `tools/license-gen/keys/private.pem` (mode 0600)
- writes `tools/license-gen/keys/public.pem`
- atomically replaces `LICENSE_PUBLIC_KEY_PEM` in `electron/license/public-key.cts`

To rotate keys (invalidates every code already in customer hands):

```sh
node tools/license-gen/gen-keys.mjs --rotate
```

## Issue an activation code

The customer first launches Apollo Map Studio → **Help → License…** to read
their **machine code** (16 chars, format `ABCD-EFGH-JKLM-NPQR`). Then:

```sh
node tools/license-gen/issue.mjs \
    --machine ABCD-EFGH-JKLM-NPQR \
    --days 365 \
    --name "Customer Inc."
```

Other flags:

| Flag         | Default                                | Description                                     |
| ------------ | -------------------------------------- | ----------------------------------------------- |
| `--days`     | `365`                                  | Days from now until expiry.                     |
| `--expires`  | derived from `--days`                  | ISO-8601 absolute expiry; overrides `--days`.   |
| `--name`     | (empty)                                | Customer/display name shown in the dialog.      |
| `--lic`      | auto-generated `LIC-YYYY-MM-DD-XXXXXX` | Stable license id (used for replay protection). |
| `--features` | (none)                                 | Comma list of feature flags (reserved).         |
| `--key`      | `keys/private.pem`                     | Path to the signing private key.                |
| `--quiet`    | (off)                                  | Suppress the preamble; print only the code.     |

The activation code is printed to **stdout**; the preamble (license id,
expiry, etc.) goes to **stderr** so you can pipe directly:

```sh
node tools/license-gen/issue.mjs --machine … --days 365 --quiet > code.txt
```

## Verify a code locally

```sh
node tools/license-gen/verify.mjs --code "$(cat code.txt)"
```

Returns the parsed payload + a `valid` boolean. Exit code `0` on success.

## What this protects against

- **Network attacks** — every check is offline. There is no licensing server.
- **Code injection** — the activation code is Ed25519-signed; the renderer
  cannot forge a valid one without the private key.
- **Reverse engineering** — full prevention is impossible in JavaScript, but
  the layout uses multiple verification points (signature, machine binding,
  HMAC on storage, encrypted clock state, mirror cross-check) so patching out
  a single check does not unlock editing.
- **System-clock rollback** — the time guard tracks a monotonic high-water
  timestamp encrypted with a per-machine key plus session counter and
  Date.now()/performance.now() drift detection.
- **License sharing across machines** — the code is bound to a 16-char
  fingerprint derived from MAC + CPU + platform + disk identifiers.

## What this does _not_ protect against

- An attacker who fully controls the user's machine, decompiles the app,
  patches the verification code paths, and rebuilds. (Treat this as the
  unavoidable cost of an offline, JS-based licensing scheme.)
- Customers running multiple machines and sharing a single physical disk
  image. The fingerprint will collide and let the second machine activate.

## Operational tips

- Keep `keys/private.pem` on an air-gapped or restricted-access machine.
- Issue per-customer license ids so you can revoke (by re-issuing a shorter
  expiry) — the manager prevents downgrades but accepts upgrades.
- Treat lost private keys as a full rotation event: regenerate, ship a new
  build, re-issue every customer's code.
