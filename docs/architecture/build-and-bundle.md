# Build And Bundle

The project uses Vite for the renderer, TypeScript for Electron and VitePress
for documentation.

## Renderer

```bash
pnpm dev
pnpm build
pnpm preview
```

`vite.config.ts` configures React and path aliases. The same renderer bundle
runs in the browser and inside Electron.

## Electron

```bash
pnpm build:electron
pnpm build:desktop
pnpm electron:dev
pnpm electron:start
```

`build:desktop` builds renderer output and then compiles Electron files with
`tsconfig.electron.json`.

## Packages

```bash
pnpm package
pnpm package:linux
pnpm package:mac
pnpm package:win
```

Packaging is configured by `electron-builder.yml`.

## Docs

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

`VITEPRESS_BASE` can be set for sub-path deployment, for example GitHub Pages.
