---
title: Development Setup
description: pnpm install, pnpm dev, pnpm electron:dev, Node version, OS notes, and recommended VS Code extensions.
---

# Development Setup

This page covers the shortest path from clone to first `pnpm dev`, plus
Electron debugging and platform-specific notes.

::: tip TL;DR

```bash
git clone <repo>
cd apollo-map-studio
pnpm install
pnpm dev   # localhost:5173
```

Get the web editor running before touching Electron.
:::

## Required

- **Node.js 22.22.1+** — `node -v` must report `v22.22.1` or higher.
- **pnpm 11.5.2** — `pnpm -v` must report `11.5.2`.
- **Git 2.40+** — Husky 9 needs a modern git.
- **OS** — Linux / macOS / Windows. WSL2 is recommended on Windows.

::: warning Don't use npm or yarn
`pnpm-lock.yaml` is the only lockfile. `npm install` generates a
different lockfile and resolves a different dep graph, breaking CI vs
local consistency.
:::

## Installing Node + pnpm

### Recommended: fnm + corepack

```bash
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 22.22.1
fnm use 22.22.1
corepack enable
corepack prepare pnpm@11.5.2 --activate
```

### Or: volta

```bash
curl https://get.volta.sh | bash
volta install node@22.22.1
volta install pnpm
```

::: tip Why not nvm?
nvm works, but is slow on shell start and doesn't auto-toggle corepack.
fnm is the Rust-based modern alternative; this repo recommends it.
:::

## First-time setup

```bash
git clone <repo-url>
cd apollo-map-studio
pnpm install         # deps + Husky hook install
pnpm typecheck       # surface env issues early
pnpm test            # ~6s
pnpm dev             # vite, default 5173
```

Open localhost:5173. You should see the editor (empty map is
expected).

### Verify Husky

```bash
ls -la .husky/_/
# pre-commit / commit-msg / etc. should exist
```

If missing, the `prepare` script (`husky`) should have run during
`pnpm install`. If skipped:

```bash
pnpm exec husky install
```

## Electron development

```bash
pnpm electron:dev
```

That command starts two processes via `concurrently`:

1. **vite dev server** at `127.0.0.1:5173`.
2. **Electron** loading that URL.

Hot reload: renderer changes (React/CSS) hot-swap. **Main-process**
changes (`electron/main.ts`) require Ctrl+C and re-run.

::: tip Linux sandbox
Some distros (Ubuntu 22+) need `--no-sandbox` for Electron in dev. The
script handles it. If you see a `chrome-sandbox` error, you've modified
the `electron:dev` script.
:::

## Recommended VS Code extensions

| Extension                 | Purpose                    |
| ------------------------- | -------------------------- |
| ESLint (dbaeumer)         | flat config preconfigured  |
| Prettier (esbenp)         | format on save             |
| Tailwind CSS IntelliSense | utility class autocomplete |
| Stylelint                 | tokens.css guard           |
| GitLens                   | blame and history          |
| Vitest                    | test runner panel          |
| Mermaid Markdown          | mermaid preview in docs    |

### Suggested `.vscode/settings.json`

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.useFlatConfig": true,
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.eol": "\n",
  "search.exclude": {
    "**/dist": true,
    "**/dist-electron": true,
    "**/release": true,
    "**/node_modules": true
  }
}
```

::: warning `files.eol` MUST be `\n`
`.prettierrc.json` enforces LF. Windows CRLF makes Prettier complain.
Alternatively set `core.autocrlf=input` in git.
:::

## OS notes

### macOS

- Native ARM Node 22 on Apple Silicon works as is.
- Native deps (keytar etc., not used here) need Rosetta; current deps
  are pure JS.
- Desktop packaging: see
  [Packaging Desktop Builds](../recipes/packaging-desktop-builds).

### Linux

- Tested on Ubuntu 22.04+, Debian 12+, Fedora 38+.
- AppImage requires `libfuse2`: `sudo apt install libfuse2`.
- Sandbox: see `--no-sandbox` note above.

### Windows

- **Strongly prefer WSL2** for daily dev (CI is ubuntu-latest).
- Native PowerShell works, but watch path separators, line endings, and
  permissions.
- Windows Defender real-time scan slows `pnpm install` 3–5×. Exclude the
  project folder.

## Script cheat-sheet

| Script                | Purpose                             |
| --------------------- | ----------------------------------- |
| `pnpm dev`            | Web dev server                      |
| `pnpm build`          | Web production build                |
| `pnpm electron:dev`   | Electron dev mode                   |
| `pnpm electron:start` | Electron prod (after build)         |
| `pnpm package`        | Package for current OS              |
| `pnpm package:linux`  | Linux artifacts                     |
| `pnpm package:mac`    | macOS artifacts                     |
| `pnpm package:win`    | Windows artifacts                   |
| `pnpm typecheck`      | tsc + tsc -p tsconfig.electron.json |
| `pnpm lint`           | ESLint                              |
| `pnpm lint:fix`       | ESLint --fix                        |
| `pnpm format`         | Prettier --write                    |
| `pnpm format:check`   | Prettier --check                    |
| `pnpm test`           | Vitest run                          |
| `pnpm bench`          | Vitest bench                        |
| `pnpm docs:dev`       | VitePress docs site                 |
| `pnpm docs:build`     | VitePress build                     |

## Troubleshooting

### `pnpm install` stalls

Switch registries:

```bash
pnpm config set registry https://registry.npmmirror.com
pnpm install --frozen-lockfile
```

::: warning Don't commit a registry to `.npmrc`
Mirrors are network-specific. Hard-coding one in the repo blocks
contributors elsewhere. Set it in a user-level `~/.npmrc`.
:::

### Port 5173 in use

```bash
pnpm dev --port 5174
```

Or `lsof -i :5173` and kill the squatter.

### Electron blank window

Likely:

- `dist/` not built — run `pnpm build:web`.
- preload error — check terminal stderr.
- Open DevTools (`Ctrl+Shift+I`) to see the renderer console.

### `Cannot find module '@/...'`

`tsconfig.json` `paths` and `vite.config.ts` `resolve.alias` must stay
in sync. Restart the TS server in VS Code after edits
(`Cmd+Shift+P → Restart TS Server`).

### Husky pre-commit not firing

```bash
ls -la .husky/_/
chmod +x .husky/pre-commit
```

## Source links

- [`package.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/package.json) — scripts section
- [`pnpm-lock.yaml`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/pnpm-lock.yaml)
- [`.husky/pre-commit`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/.husky/pre-commit)
- [`vite.config.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/vite.config.ts)
- [`tsconfig.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/tsconfig.json)

## Next steps

- After setup, read [Code Style](./code-style),
  [Commit Conventions](./commit-conventions), and
  [PR Checklist](./pr-checklist).
- Before touching core modules, read
  [Architecture Overview](../architecture/overview).
- To draw your first lane: [Getting started](../guide/getting-started).

## Docker / Codespaces

Not officially supported, but works:

```bash
# Any Node 22.22.1+ + pnpm 11.5.2 image runs
docker run -it --rm -v "$PWD":/app -w /app node:22 bash
corepack enable
pnpm install
pnpm test
```

GitHub Codespaces with `.devcontainer/devcontainer.json` (if enabled)
spins up a warm environment. Not yet committed; PRs welcome.

## Common Git workflow

```bash
git checkout -b feat/awesome-thing
# write code, commit
git push -u origin feat/awesome-thing
gh pr create --fill --base main
```

See [PR Checklist](./pr-checklist) and
[Commit Conventions](./commit-conventions).

::: tip One sentence
**Get it running first**, then read code. Setup issues are environment
issues — fix Node and pnpm versions before searching the source.
:::
