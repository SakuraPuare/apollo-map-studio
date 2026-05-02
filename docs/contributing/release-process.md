# Release Process

This project currently uses package scripts rather than a separate release
automation document.

## Build Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm docs:build
pnpm build:desktop
```

## Packaging

```bash
pnpm package
pnpm package:linux
pnpm package:mac
pnpm package:win
```

Desktop packages require the embedded public license key to match the private
key used by `tools/license-gen`.
