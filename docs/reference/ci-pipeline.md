# CI Pipeline

GitHub Actions handles every quality gate, build artefact, and release
deliverable. Two workflows live under `.github/workflows/`:

- `ci.yml` — typecheck, tests, perf budget, and cross-platform desktop
  packaging on push to `main`/`v1`, on PR, and on `v*` tag.
- `docs-preview.yml` — VitePress build + GitHub Pages deploy on push to
  `main`/`v1` when docs / changelog / lockfile change.

A `.github/dependabot.yml` config is also present (not part of the run
matrix; tracked here for completeness).

## `ci.yml` — main quality gate

```yaml
name: CI
on:
  push:
    branches: [main, v1]
    tags: ['v*']
  pull_request:
    branches: [main, v1]
concurrency:
  group: $&#123;&#123; github.workflow &#125;&#125;-$&#123;&#123; github.ref &#125;&#125;
  cancel-in-progress: true
```

Three jobs in sequence: `check` → `desktop-package` (matrix) →
`github-release` (tag-only).

### `check` — typecheck & test

| Property     | Value           |
| ------------ | --------------- |
| Runs on      | `ubuntu-latest` |
| Timeout      | 10 min          |
| Triggers     | All triggers    |
| Node version | 20              |
| pnpm version | 10              |
| Cache        | `cache: pnpm`   |

Steps:

1. `actions/checkout@v6`
2. `pnpm/action-setup@v4` (pnpm 10)
3. `actions/setup-node@v6` (Node 20, pnpm cache)
4. `pnpm install --frozen-lockfile`
5. `pnpm typecheck` — `tsc --noEmit`
6. `pnpm lint` — ESLint 9 flat config
7. `pnpm format:check` — Prettier check
8. `pnpm build:web` — Vite production build
9. `pnpm docs:build` — VitePress production build
10. `pnpm test` — Vitest unit suite
11. `pnpm bench --outputJson bench-results.json`
12. `node scripts/check-bench-budget.mjs bench-results.json`
13. `actions/upload-artifact@v7` — uploads `dist/` as
    `apollo-map-studio-web` (fails the job if missing)

The bench-budget gate in step 12 is documented in
[Benchmark Budgets](/reference/benchmark-budgets).

### `desktop-package` — cross-platform Electron builds

| Property   | Value                   |
| ---------- | ----------------------- |
| Depends on | `check`                 |
| Timeout    | 30 min per matrix entry |
| Strategy   | `fail-fast: false`      |

Matrix:

| `os`             | `package-script` | `artifact-name`             |
| ---------------- | ---------------- | --------------------------- |
| `ubuntu-latest`  | `package:linux`  | `apollo-map-studio-linux`   |
| `macos-latest`   | `package:mac`    | `apollo-map-studio-macos`   |
| `windows-latest` | `package:win`    | `apollo-map-studio-windows` |

Steps (per matrix entry):

1. `actions/checkout@v6`
2. `pnpm/action-setup@v4` (pnpm 10)
3. `actions/setup-node@v6` (Node 20)
4. `pnpm install --frozen-lockfile`
5. `pnpm <package-script>`
   - `CSC_IDENTITY_AUTO_DISCOVERY=false` — disables electron-builder's
     macOS code-signing auto-discovery; CI-built artefacts are unsigned.
   - `GH_TOKEN: $&#123;&#123; secrets.GITHUB_TOKEN &#125;&#125;` — passed for
     electron-builder publishing flows.
6. `actions/upload-artifact@v7` — uploads matching `release/*`:
   - `release/*.AppImage`, `release/*.deb` (Linux)
   - `release/*.dmg`, `release/*.zip` (macOS)
   - `release/*.exe` (Windows)
   - excludes `builder-debug.yml` and `builder-effective-config.yaml`
   - fails the job if no files match.

### `github-release` — tag publishing

| Property    | Value                                       |
| ----------- | ------------------------------------------- |
| Runs on     | `ubuntu-latest`                             |
| Timeout     | 10 min                                      |
| Depends on  | `[check, desktop-package]`                  |
| Conditional | `if: startsWith(github.ref, 'refs/tags/v')` |
| Permissions | `contents: write`                           |

Steps:

1. `actions/download-artifact@v5` — pulls every artefact from prior
   jobs into `artifacts/`.
2. Zip the web artefact:
   ```bash
   cd artifacts/apollo-map-studio-web
   zip -r ../apollo-map-studio-web.zip .
   ```
3. `softprops/action-gh-release@v3` — publishes a GitHub Release with:
   - `apollo-map-studio-web.zip`
   - `artifacts/apollo-map-studio-linux/*`
   - `artifacts/apollo-map-studio-macos/*`
   - `artifacts/apollo-map-studio-windows/*`

Tag pushes matching `v*` are the only trigger. Push a properly-prefixed
annotated tag (e.g. `v1.0.0`) to publish a release.

## `docs-preview.yml` — VitePress to GitHub Pages

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

Single `deploy` job:

| Property          | Value                           |
| ----------------- | ------------------------------- |
| Runs on           | `ubuntu-latest`                 |
| Environment       | `github-pages`                  |
| Concurrency group | `pages` (no cancel-in-progress) |

Steps:

1. `actions/checkout@v6`
2. `pnpm/action-setup@v4`
3. `actions/setup-node@v6` (Node 20)
4. `pnpm install --frozen-lockfile`
5. `pnpm docs:build`
   - `VITEPRESS_BASE: /$&#123;&#123; github.event.repository.name &#125;&#125;/` ensures
     VitePress emits asset URLs scoped to the repo's GitHub Pages path.
6. `actions/configure-pages@v6`
7. `actions/upload-pages-artifact@v5` (`path: docs/.vitepress/dist`)
8. `actions/deploy-pages@v5` — deploys to the `github-pages`
   environment; `steps.deployment.outputs.page_url` is exposed.

The `concurrency.cancel-in-progress: false` setting means deploys
queue rather than aborting each other — matters when several
docs-touching commits land in quick succession.

## Triggers and matrix summary

| Event             | `check` | `desktop-package` | `github-release` | `docs-preview`     |
| ----------------- | ------- | ----------------- | ---------------- | ------------------ |
| Push to `main/v1` | yes     | yes               | no               | only if docs paths |
| Pull request      | yes     | yes               | no               | no                 |
| Tag `v*`          | yes     | yes               | yes              | no                 |
| Manual dispatch   | no      | no                | no               | yes                |

## Required secrets and permissions

| Secret / setting               | Used by           | Purpose                               |
| ------------------------------ | ----------------- | ------------------------------------- |
| `secrets.GITHUB_TOKEN`         | `desktop-package` | electron-builder publishing           |
| `permissions: contents: write` | `github-release`  | Create / update GitHub Releases       |
| `permissions: pages: write`    | `docs-preview`    | Deploy GitHub Pages                   |
| `permissions: id-token: write` | `docs-preview`    | OIDC token for `actions/deploy-pages` |

No third-party tokens are required. Macos signing is intentionally
disabled (`CSC_IDENTITY_AUTO_DISCOVERY=false`) — release artefacts are
unsigned and ship via the GitHub Release page.

## Releasing

```bash
# from a clean working tree on v1 (or main, when v1 lands)
git tag -a v1.0.1 -m "v1.0.1"
git push origin v1.0.1
```

This triggers `check` → matrix `desktop-package` → `github-release`,
which publishes the desktop binaries and the web zip to a new GitHub
Release. The `v` prefix is mandatory; tags without it bypass
`github-release`.

## Local equivalents

```bash
# pre-flight checks (same as `check` job)
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build:web
pnpm docs:build
pnpm test
pnpm bench --outputJson bench-results.json
node scripts/check-bench-budget.mjs bench-results.json

# desktop packaging (per platform; pick one)
pnpm package:linux
pnpm package:mac
pnpm package:win
```

The husky pre-commit hook also runs `lint-staged` (eslint --fix +
prettier --write on changed files).

## See also

- [Benchmark Budgets](/reference/benchmark-budgets) — perf gate detail
- [Architecture overview](/architecture/overview) — quality gate policy
- [`scripts/check-bench-budget.mjs`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/scripts/check-bench-budget.mjs)
- [`.github/workflows/ci.yml`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/.github/workflows/ci.yml)
- [`.github/workflows/docs-preview.yml`](https://github.com/SakuraPuare/apollo-map-studio/blob/v1/.github/workflows/docs-preview.yml)
