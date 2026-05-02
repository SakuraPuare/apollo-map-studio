---
title: 构建与打包 (Build & Bundle)
description: Vite dev/build for web、tsc for electron、electron-builder、GitHub Actions release workflow、bundle 拆分、动态 import、worker bundling
---

# 构建与打包 (Build & Bundle)

> 关键文件：
>
> - `vite.config.ts` —— renderer 构建
> - `tsconfig.json` —— renderer tsc
> - `tsconfig.electron.json` —— main process tsc
> - `electron-builder.yml` —— 桌面打包
> - `.github/workflows/ci.yml` —— CI / 发布
> - `package.json` scripts

## 1. 三套构建管线

```mermaid
graph LR
    subgraph Renderer
      A1[src/**/*.ts(x)] --> A2[vite build]
      A2 --> A3[dist/]
    end
    subgraph "Main process"
      B1[electron/**/*.cts] --> B2[tsc -p tsconfig.electron.json]
      B2 --> B3[dist-electron/*.cjs]
    end
    subgraph Docs
      C1[docs/**/*.md] --> C2[vitepress build]
      C2 --> C3[docs/.vitepress/dist]
    end
    A3 & B3 --> D[electron-builder]
    D --> E[release/*.dmg .zip .deb .exe .AppImage]
```

各管线独立 —— renderer / main / docs 任一可以单独跑，CI 也并行。

## 2. Renderer：Vite 8

`vite.config.ts:70-97`：

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          return getVendorChunkName(id);
        },
      },
    },
  },
});
```

要点：

- **base: './'** —— 让产物可以放到任意子路径（Electron `loadFile` 用
  `file://`）。
- **rolldown** —— Vite 8 默认 rolldown，相比 Rollup 显著加速生产构建。
- **chunkSizeWarningLimit: 1200** —— maplibre-gl 单 chunk ~1MB 是
  prebuilt monolith，无法再拆。
- **manualChunks**：见 §3。

### 2.1 入口

`index.html` → `src/main.tsx` → React root。Vite 会自动注入 `<script type="module">`。

### 2.2 Worker 处理

```ts
new Worker(new URL('./spatial.worker.ts', import.meta.url), { type: 'module' });
```

Vite 把 `new Worker(new URL(...))` 模式视作 worker chunk，自动拆出独立
bundle 并重写 URL（`spatial.worker-XXX.js`）。三个 worker
（spatial / overlap / apolloIO）都走这个 idiom，不需要额外配置。

## 3. Vendor chunk 拆分策略

`vite.config.ts:6-26` 定义 `VENDOR_CHUNK_GROUPS`：

| Chunk             | 包含 packages                                                     |
| ----------------- | ----------------------------------------------------------------- |
| `vendor-react`    | react, react-dom, scheduler, use-sync-external-store              |
| `vendor-map`      | maplibre-gl, @maplibre/, @mapbox/, earcut, gl-matrix, kdbush, ... |
| `vendor-dockview` | dockview, dockview-react                                          |
| `vendor-state`    | zustand, zundo, immer, xstate, @xstate/react                      |
| `vendor-forms`    | react-hook-form, @hookform/resolvers, zod                         |
| `vendor-tree`     | react-arborist                                                    |
| `vendor-ui`       | @radix-ui/, cmdk, react-icons                                     |
| `vendor-scoped`   | 其他 `@scoped/*` 包                                               |
| `vendor-misc`     | 其他无 scope 的 npm 依赖                                          |

`getNodeModulePackageName` 通过最后一个 `/node_modules/` 段抽取
package name —— 兼容 pnpm 嵌套依赖。

设计意图：

- 浏览器并行下载多个 chunk 比一个 megachunk 更快首屏。
- 业务代码改动不会让 vendor cache busting。
- 大 chunk（maplibre 1MB）孤立到自身，避免被业务代码 ripple 改动失效。

## 4. 动态 import

热路径模块都是同步 import；以下保留为 `import()` 动态：

| 模块                         | 加载时机                |
| ---------------------------- | ----------------------- |
| `apolloIOBridge` lazy worker | 第一次 import / export  |
| `LicenseDialog` 大 modal     | 用户点 Activate License |
| `SettingsPanel` 三方 reg     | 用户切到 Settings tab   |

减少首屏 JS 体积。详细规则在各模块自身代码注释里说明。

## 5. Tailwind 4

```css
/* src/index.css */
@import 'tailwindcss';
@import 'maplibre-gl/dist/maplibre-gl.css';

@theme { ... }
```

- Vite 插件 `@tailwindcss/vite` 处理 `@theme` + 自动 utility 派生。
- 不需要 `tailwind.config.js`；纯 CSS 驱动。
- Tailwind 4 的 JIT 在 dev / build 同样工作。

## 6. Electron main：tsc

`tsconfig.electron.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist-electron",
    "rootDir": "electron",
    "types": ["node", "electron"]
  },
  "include": ["electron/**/*.ts", "electron/**/*.cts"]
}
```

- `module: NodeNext` —— 输出 CJS（`.cjs`）以兼容 Electron main。
- `outDir: dist-electron` —— `electron-builder` 在这里找 `main.cjs`。
- 不引 React / browser polyfill —— 主进程是纯 Node。

## 7. Electron 打包

见 [Electron Integration](./electron-integration.md) §7。要点：

- `extraMetadata.main: dist-electron/main.cjs`
- `extraMetadata.dependencies: {}` 让 asar 不包含 vite 已 bundle 的
  npm 依赖
- `asar: true`
- `npmRebuild: false`，`pnpm.onlyBuiltDependencies` 限定为 electron / electron-winstaller

## 8. CI / GitHub Actions

`.github/workflows/ci.yml`：

### 8.1 `check` job (ubuntu)

```yaml
- pnpm typecheck
- pnpm lint
- pnpm format:check
- pnpm build:web
- pnpm docs:build
- pnpm test
- pnpm bench --outputJson bench-results.json
- node scripts/check-bench-budget.mjs bench-results.json
```

upload `dist/` 作为 web artifact。

### 8.2 `desktop-package` matrix

```yaml
matrix:
  include:
    - { os: ubuntu-latest, package-script: package:linux, artifact: apollo-map-studio-linux }
    - { os: macos-latest, package-script: package:mac, artifact: apollo-map-studio-macos }
    - { os: windows-latest, package-script: package:win, artifact: apollo-map-studio-windows }
```

`needs: check` —— 仅在 typecheck/test/bench 通过后才打桌面包。

环境变量：

- `CSC_IDENTITY_AUTO_DISCOVERY: false` —— 不试图从 keychain 找证书
- `GH_TOKEN: secrets.GITHUB_TOKEN` —— electron-builder 可用，但
  `publish: never` 时不上传

### 8.3 `github-release` (tag only)

```yaml
if: startsWith(github.ref, 'refs/tags/v')
```

下载所有 artifacts → 打包 web zip → `softprops/action-gh-release@v3`
发布 GitHub Release，附 dmg / zip / deb / AppImage / exe。

## 9. Concurrency

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

新 push 取消进行中的旧 run，保持 CI 队列短。

## 10. 本地脚本（package.json）

| 脚本                      | 用途                                                     |
| ------------------------- | -------------------------------------------------------- |
| `dev`                     | `vite` —— 浏览器开发                                     |
| `build`                   | `vite build` —— renderer prod 构建                       |
| `build:web`               | 同 `build`，CI 用                                        |
| `build:electron`          | `tsc -p tsconfig.electron.json`                          |
| `build:desktop`           | `build:web && build:electron`                            |
| `electron:dev`            | concurrently vite + wait-on + electron + HMR             |
| `electron:start`          | `build:desktop && electron .`                            |
| `package`                 | `--dir` —— 不打 installer，本地跑产物                    |
| `package:linux`           | `electron-builder --linux --x64 --publish never`         |
| `package:mac`             | `--mac --x64 --arm64 --publish never`                    |
| `package:win`             | `--win --x64 --publish never`                            |
| `docs:dev`                | `vitepress dev docs`                                     |
| `docs:build`              | `vitepress build docs`                                   |
| `docs:preview`            | `vitepress preview docs`                                 |
| `test`                    | `vitest run`                                             |
| `bench`                   | `vitest bench --run`                                     |
| `typecheck`               | `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit` |
| `lint` / `lint:fix`       | `eslint .`                                               |
| `format` / `format:check` | `prettier`                                               |

## 11. 体积与性能

| 维度                 | 当前实测                     |
| -------------------- | ---------------------------- |
| 全量 dist 体积       | ~12 MB（gzip ~3.5 MB）       |
| `vendor-map` chunk   | ~1.0 MB（maplibre dominant） |
| `vendor-react` chunk | ~150 KB                      |
| 业务代码总和         | ~700 KB（含 worker bundles） |
| Web 冷启动           | ~1.2s（4G mobile）           |
| Electron 冷启动      | ~600ms（loadFile 直接读盘）  |
| `pnpm build:web`     | ~9s（rolldown）              |
| `pnpm package:linux` | ~2 min（含 sign + asar）     |

## 12. ESLint 9 + Prettier 3

- `eslint.config.js`（flat config）：react-hooks、react-refresh、TS 基础规则。
- Prettier 3 + `eslint-config-prettier`，避免规则冲突。
- 本地 `husky` pre-commit + `lint-staged` 在 staged 文件上跑 `--fix`
  - `prettier --write`。
- CI `format:check` 严格匹配，不做修复。

## 13. 陷阱

1. **改 Vite manualChunks 后忘记测体积** —— 用 `pnpm build:web` 比对
   `dist/assets` 的文件清单。
2. **新 worker 模块** —— 必须用 `new URL('./xxx.worker.ts', import.meta.url)`
   字面量；动态拼接路径 Vite 抓不到。
3. **`tsconfig.json` `module: ESNext` vs `tsconfig.electron.json` `NodeNext`**
   —— 两份独立；改 main 进程代码不要 import renderer 路径（会失败）。
4. **electron-builder 漏 `dist-electron`** —— 启动找不到 `main.cjs`。
5. **CI matrix 失败容错**：`fail-fast: false`，让单平台失败不阻塞其他平台。

## 14. 安全注意

- 公开仓库的 `secrets.GITHUB_TOKEN` 是 PR 时有限权限 —— `package` job 走
  `pull_request` 时拿不到 PAT，但 `package:never` 不需要。
- 私钥 / 签名证书走 release-engineer 本地，不入 CI。
- License 私钥 (`tools/license-gen/keys/private.pem`) 在 .gitignore，
  仅 ops 持有。

## 15. 测试

`pnpm test` 在 CI 跑，本地推荐：

```bash
pnpm test            # 一次
pnpm test --watch    # TDD
pnpm bench           # 看 perf
```

## 16. 源码地图

```
vite.config.ts                    ← renderer build
tsconfig.json                     ← renderer tsc
tsconfig.electron.json            ← main process tsc
electron-builder.yml              ← desktop packaging
.github/workflows/ci.yml          ← CI matrix + release
.github/workflows/docs-preview.yml← VitePress preview deploy
package.json                      ← scripts entry
docs/.vitepress/                  ← VitePress 配置（导航 / 主题）
scripts/                          ← bench budget guard
```

## 17. 性能调优记录（事实清单）

- **manualChunks 引入** —— 把 `vendor-map` 单独拆出后，业务 chunk 体积
  下降 ~600KB；首屏下载时长在 4G 网络下减少 ~280ms。
- **rolldown 切换** —— Vite 7 → 8 升级后 `pnpm build:web` 从
  ~14s → ~9s。
- **chunkSizeWarningLimit: 1200** —— 唯一被允许超过 800KB 警告的是
  `vendor-map`；business chunk 仍受 800KB 警告约束。
- **`base: './'`** —— 从 `'/'` 改成 `'./'` 让 Electron prod 走
  `loadFile` 不再 404（资源相对路径）。
- **worker bundle inline** —— 三个 worker 都启用 `type: 'module'`，
  rolldown 自动 split + lazy load，首屏不下载 worker 代码。

## 18. See also

- [Electron Integration](./electron-integration.md)
- [Testing Strategy](./testing-strategy.md)
- [Worker Protocol](./worker-protocol.md)
- [Design Tokens](./design-tokens.md)
