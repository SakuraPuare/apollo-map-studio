---
title: CI Pipeline
description: Per-job, per-step reference for .github/workflows/ci.yml and docs-preview.yml — triggers, runners, env, and artifacts.
---

# CI Pipeline

This page is the per-job reference for the two GitHub Actions workflows under
`.github/workflows/`. CI owns every quality gate, build artefact, desktop
bundle, documentation deploy, and GitHub Release. The page mirrors the YAML
1:1.

::: tip Reading conventions

- **Trigger**: when a workflow / job runs.
- **Runner**: the executing OS image (ubuntu-latest, macos-latest, windows-latest).
- **Secrets**: injected through GitHub Actions `secrets.*` expressions. Only `GITHUB_TOKEN` is in use today.
  :::

## Workflow files

| File                                 | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `.github/workflows/ci.yml`           | Main pipeline: gates + Web build + desktop packaging + Release |
| `.github/workflows/docs-preview.yml` | VitePress documentation deploy to GitHub Pages                 |

---

## `ci.yml`

### Workflow header

```yaml
name: CI
on:
  push:
    branches: [main, v1]
    tags: ['v*']
  pull_request:
    branches: [main, v1]
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

| Item                | Value                                              |
| ------------------- | -------------------------------------------------- |
| Triggering branches | push / PR on `main`, `v1`                          |
| Triggering tags     | `v*` such as `v1.0.0`                              |
| Concurrency         | new pushes on the same ref cancel the previous run |

### Job 1: `check` — gates and web build

```yaml
check:
  name: Typecheck & Test
  runs-on: ubuntu-latest
  timeout-minutes: 10
```

#### Environment

| Item    | Value           |
| ------- | --------------- |
| Runner  | `ubuntu-latest` |
| Timeout | 10 minutes      |
| Node.js | 20              |
| pnpm    | 10              |

#### Steps

| #   | Name                 | Action                       | Command / Purpose                                                        |
| --- | -------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 1   | Checkout repository  | `actions/checkout@v6`        | Clone source                                                             |
| 2   | Install pnpm         | `pnpm/action-setup@v4`       | `version: 10`                                                            |
| 3   | Setup Node.js        | `actions/setup-node@v6`      | `node-version: 20`, `cache: pnpm`                                        |
| 4   | Install dependencies | —                            | `pnpm install --frozen-lockfile`                                         |
| 5   | TypeScript typecheck | —                            | `pnpm typecheck`                                                         |
| 6   | ESLint               | —                            | `pnpm lint`                                                              |
| 7   | Prettier formatting  | —                            | `pnpm format:check`                                                      |
| 8   | Web production build | —                            | `pnpm build:web`                                                         |
| 9   | Documentation build  | —                            | `pnpm docs:build`                                                        |
| 10  | Unit tests           | —                            | `pnpm test`                                                              |
| 11  | Benchmarks           | —                            | `pnpm bench --outputJson bench-results.json`                             |
| 12  | Perf budget guard    | —                            | `node scripts/check-bench-budget.mjs bench-results.json`                 |
| 13  | Upload web artifact  | `actions/upload-artifact@v7` | `name: apollo-map-studio-web`, `path: dist/`, `if-no-files-found: error` |

::: tip Step 9 vs docs-preview
`pnpm docs:build` here just verifies docs compile. The actual GitHub Pages
deploy lives in `docs-preview.yml`. The two workflows are independent.
:::

### Job 2: `desktop-package` — three-platform Electron build

```yaml
desktop-package:
  name: Desktop package (${{ matrix.os }})
  runs-on: ${{ matrix.os }}
  timeout-minutes: 30
  needs: check
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: ubuntu-latest
          package-script: package:linux
          artifact-name: apollo-map-studio-linux
        - os: macos-latest
          package-script: package:mac
          artifact-name: apollo-map-studio-macos
        - os: windows-latest
          package-script: package:win
          artifact-name: apollo-map-studio-windows
```

| Item        | Value                                                     |
| ----------- | --------------------------------------------------------- |
| Dependency  | `needs: check` (gates must pass)                          |
| Timeout     | 30 minutes                                                |
| Matrix      | 3 runners × 1 config                                      |
| `fail-fast` | `false` (one platform failing does not cancel the others) |

#### Steps

| #   | Name                     | Action                       | Command / Purpose                |
| --- | ------------------------ | ---------------------------- | -------------------------------- |
| 1   | Checkout repository      | `actions/checkout@v6`        | —                                |
| 2   | Install pnpm             | `pnpm/action-setup@v4`       | `version: 10`                    |
| 3   | Setup Node.js            | `actions/setup-node@v6`      | `node-version: 20`               |
| 4   | Install dependencies     | —                            | `pnpm install --frozen-lockfile` |
| 5   | Build desktop artifacts  | —                            | `pnpm` + matrix `package-script` |
| 6   | Upload desktop artifacts | `actions/upload-artifact@v7` | See path table below             |

#### Step 5 environment variables

| Variable                      | Value                                 | Purpose                                                                            |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `CSC_IDENTITY_AUTO_DISCOVERY` | `false`                               | Disables electron-builder code-sign auto-discovery so unsigned builds do not error |
| `GH_TOKEN`                    | GitHub Actions `secrets.GITHUB_TOKEN` | Required by electron-builder publish                                               |

#### Step 6 artifact paths

```yaml
path: |
  release/*.AppImage
  release/*.deb
  release/*.dmg
  release/*.zip
  release/*.exe
  !release/**/builder-debug.yml
  !release/**/builder-effective-config.yaml
if-no-files-found: error
```

| Artifact                    | Platform | Files               |
| --------------------------- | -------- | ------------------- |
| `apollo-map-studio-linux`   | Linux    | `.AppImage`, `.deb` |
| `apollo-map-studio-macos`   | macOS    | `.dmg`, `.zip`      |
| `apollo-map-studio-windows` | Windows  | `.exe`, `.zip`      |

::: warning `if-no-files-found: error`
An empty upload fails the job and blocks the downstream release.
:::

### Job 3: `github-release` — tag-driven release

```yaml
github-release:
  name: GitHub Release
  runs-on: ubuntu-latest
  timeout-minutes: 10
  needs: [check, desktop-package]
  if: startsWith(github.ref, 'refs/tags/v')
  permissions:
    contents: write
```

| Item         | Value                                      |
| ------------ | ------------------------------------------ |
| Dependencies | `check` and `desktop-package` must succeed |
| Trigger      | `refs/tags/v*`                             |
| Permissions  | `contents: write` to publish a release     |

#### Steps

| #   | Name                     | Action                           | Purpose                                                                       |
| --- | ------------------------ | -------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Download build artifacts | `actions/download-artifact@v5`   | Pull all four artefacts produced earlier                                      |
| 2   | Archive web artifact     | inline bash                      | `cd artifacts/apollo-map-studio-web && zip -r ../apollo-map-studio-web.zip .` |
| 3   | Publish release          | `softprops/action-gh-release@v3` | See file list below                                                           |

#### Release `files`

```yaml
files: |
  artifacts/apollo-map-studio-web.zip
  artifacts/apollo-map-studio-linux/*
  artifacts/apollo-map-studio-macos/*
  artifacts/apollo-map-studio-windows/*
```

::: tip Full release matrix
After tagging `v1.2.3`, the GitHub Release page lists one web zip plus the
Linux, macOS, and Windows desktop installers.
:::

---

## `docs-preview.yml`

### Workflow header

```yaml
name: Docs Preview
on:
  push:
    branches: [main, v1]
    paths:
      - 'docs/**'
      - 'CHANGELOG.md'
      - 'package.json'
      - 'pnpm-lock.yaml'
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
```

| Item                | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Triggering branches | `main`, `v1`                                                                 |
| Triggering paths    | `docs/**`, `CHANGELOG.md`, `package.json`, `pnpm-lock.yaml`                  |
| Manual trigger      | `workflow_dispatch`                                                          |
| Concurrency         | `pages` group; **does not** cancel in progress, to keep Pages state coherent |

### Job: `deploy`

```yaml
deploy:
  name: Deploy Docs
  runs-on: ubuntu-latest
  environment:
    name: github-pages
    url: ${{ steps.deployment.outputs.page_url }}
```

#### Steps

| #   | Name                  | Action                             | Command / Config                                                          |
| --- | --------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| 1   | Checkout repository   | `actions/checkout@v6`              | —                                                                         |
| 2   | Install pnpm          | `pnpm/action-setup@v4`             | `version: 10`                                                             |
| 3   | Setup Node.js         | `actions/setup-node@v6`            | `node-version: 20`, `cache: pnpm`                                         |
| 4   | Install dependencies  | —                                  | `pnpm install --frozen-lockfile`                                          |
| 5   | Build docs            | —                                  | `pnpm docs:build`, with `VITEPRESS_BASE` derived from the repository name |
| 6   | Configure Pages       | `actions/configure-pages@v6`       | —                                                                         |
| 7   | Upload Pages artifact | `actions/upload-pages-artifact@v5` | `path: docs/.vitepress/dist`                                              |
| 8   | Deploy Pages          | `actions/deploy-pages@v5`          | `id: deployment`                                                          |

::: tip Why `VITEPRESS_BASE`?
GitHub Pages serves at `https://<owner>.github.io/<repo>/`. VitePress needs
the base path to resolve assets correctly. `docs-preview.yml` injects the
repo name as `/<repo-name>/`. See `docs/.vitepress/config.ts:6`.
:::

---

## Failure-localisation manual

### "typecheck failed"

- Local repro: `pnpm typecheck`
- Common cause: missing exports, `apollo.ts` field drift
- Related: [Apollo Types](/en/reference/apollo-types)

### "lint failed"

- Local repro: `pnpm lint`
- Common cause: import order, unused vars, react-hooks rules
- Fix: `pnpm lint --fix`

### "format:check failed"

- Local repro: `pnpm format:check`
- Fix: `pnpm format`

### "bench budget exceeded"

- Local repro: `pnpm bench --outputJson bench-results.json && node scripts/check-bench-budget.mjs bench-results.json`
- Process: see [Benchmark Budgets](/en/reference/benchmark-budgets)

### "desktop-package failed for one platform"

- `fail-fast: false` keeps the other two running, but no release will land
- Local repro: `pnpm package:linux | package:mac | package:win`
- Common causes: electron-builder platform tooling missing (macOS dmg-license, Windows wine)

### "Pages deploy failed"

- Visit GitHub Settings → Pages and check the environment status
- Verify `pnpm docs:build` passes locally
- Confirm Pages is configured to deploy from GitHub Actions

## Trigger matrix

| Event                     | `ci.yml::check` | `ci.yml::desktop-package` | `ci.yml::github-release` | `docs-preview.yml::deploy` |
| ------------------------- | --------------- | ------------------------- | ------------------------ | -------------------------- |
| push main / v1            | ✅              | ✅                        | ❌                       | only if path matches       |
| pull_request to main / v1 | ✅              | ✅                        | ❌                       | ❌                         |
| tag `v*`                  | ✅              | ✅                        | ✅                       | ❌                         |
| `workflow_dispatch`       | ❌              | ❌                        | ❌                       | ✅                         |

## Related pages

- [Benchmark Budgets](/en/reference/benchmark-budgets)
- [Changelog](/en/changelog)
- [Electron integration](/en/architecture/electron-integration)
- [Testing strategy](/en/architecture/testing-strategy)
- [Build and bundle](/en/architecture/build-and-bundle)
- [Architecture overview](/en/architecture/overview)
