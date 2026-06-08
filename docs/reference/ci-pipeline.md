---
title: CI 流水线
description: .github/workflows/ci.yml 与 docs-preview.yml 的逐 job、step、env、trigger 参考。
---

# CI 流水线

本页是 `.github/workflows/` 下两份 workflow 文件的「逐 job 参考」。GitHub
Actions 全权管理质量门禁、构建产物、桌面打包、文档发布与 GitHub Release，
本页与源 YAML 保持 1:1 镜像。

::: tip 阅读约定

- **触发器**：决定 workflow / job 何时运行。
- **runner**：执行环境（ubuntu-latest、macos-latest、windows-latest）。
- **secrets**：通过 GitHub Actions 的 `secrets.*` 表达式注入；除 `GITHUB_TOKEN` 外当前无其他 secrets。
  :::

## 工作流文件

| 文件                                 | 用途                                               |
| ------------------------------------ | -------------------------------------------------- |
| `.github/workflows/ci.yml`           | 主流水线：质量门禁 + Web 构建 + 桌面打包 + Release |
| `.github/workflows/docs-preview.yml` | VitePress 文档发布到 GitHub Pages                  |

---

## `ci.yml`

### Workflow 头部

```yaml
name: CI
on:
  push:
    branches: [main, v1]
    tags: ['v*']
  pull_request:
    branches: [main, v1]
concurrency:
  group: <workflow>-<ref>
  cancel-in-progress: true
```

| 项目     | 值                          |
| -------- | --------------------------- |
| 触发分支 | `main`, `v1` 上的 push / PR |
| 触发 tag | `v*` 形如 `v1.0.0`          |
| 并发策略 | 同 ref 新提交会取消上一轮跑 |

### Job 1：`quality` — 质量门禁矩阵

```yaml
quality:
  name: Quality (<task>)
  runs-on: ubuntu-latest
  timeout-minutes: 10
  strategy:
    fail-fast: false
    matrix:
      include:
        - task: Typecheck
          command: pnpm typecheck
        - task: ESLint
          command: pnpm lint
        - task: Prettier
          command: pnpm format:check
        - task: Unit tests
          command: pnpm test
        - task: Electron tests
          command: pnpm test:electron
        - task: React Doctor
          command: CI=true pnpm run react-doctor
```

#### 环境

| 项      | 值              |
| ------- | --------------- |
| Runner  | `ubuntu-latest` |
| 超时    | 10 分钟         |
| Node.js | 22.22.1         |
| pnpm    | 11.5.2          |

#### Step 表

| #   | Step 名              | Action                  | 命令 / 用途                                       |
| --- | -------------------- | ----------------------- | ------------------------------------------------- |
| 1   | Checkout repository  | `actions/checkout@v6`   | 拉代码                                            |
| 2   | Install pnpm         | `pnpm/action-setup@v4`  | `version: 11.5.2`                                 |
| 3   | Setup Node.js        | `actions/setup-node@v6` | `node-version: 22.22.1`, cache pnpm               |
| 4   | Install dependencies | —                       | `pnpm install --frozen-lockfile --prefer-offline` |
| 5   | Run matrix task      | —                       | `matrix.command`                                  |

::: tip 质量门禁拆分
`quality` 只跑静态检查、单测、Electron node:test 与 React Doctor。Web 构建、
docs 构建和 bench 都是独立 job，失败时更容易定位。
:::

### Job 2：`benchmarks` — 性能预算

```yaml
benchmarks:
  name: Benchmarks
  runs-on: ubuntu-latest
  timeout-minutes: 10
```

| #   | Step 名                 | Action                       | 命令 / 用途                                              |
| --- | ----------------------- | ---------------------------- | -------------------------------------------------------- |
| 1-4 | Checkout / pnpm / Node  | `actions/*`                  | 与 `quality` 相同，Node `22.22.1` / pnpm `11.5.2`        |
| 5   | Run benchmarks          | —                            | `pnpm bench --outputJson bench-results.json`             |
| 6   | Perf budget guard       | —                            | `node scripts/check-bench-budget.mjs bench-results.json` |
| 7   | Upload benchmark report | `actions/upload-artifact@v7` | `name: bench-results`, `path: bench-results.json`        |

### Job 3：`web-build` — Web 构建产物

`web-build` 在 ubuntu 上运行 `pnpm build:web`，并把 `dist/` 上传为
`apollo-map-studio-web`。后续桌面构建和 tag release 都复用这个 artifact。

### Job 4：`docs-build` — 文档构建

`docs-build` 在 ubuntu 上运行 `pnpm docs:build`。真正发布 GitHub Pages 仍由
`docs-preview.yml` 处理，两条流水线互不依赖。

### Job 5：`desktop-build` — hardened Electron assets

```yaml
desktop-build:
  name: Desktop build
  runs-on: ubuntu-latest
  timeout-minutes: 15
  needs: web-build
  if: github.event_name != 'pull_request'
```

| #   | Step 名                        | Action                         | 命令 / 用途                            |
| --- | ------------------------------ | ------------------------------ | -------------------------------------- |
| 1-4 | Checkout / pnpm / Node / deps  | `actions/*`                    | Node `22.22.1` / pnpm `11.5.2`         |
| 5   | Download web build             | `actions/download-artifact@v5` | 下载 `apollo-map-studio-web` 到 `dist` |
| 6   | Build desktop docs             | —                              | `pnpm build:docs:desktop`              |
| 7   | Build hardened Electron assets | —                              | `pnpm build:electron:hardened`         |
| 8   | Verify Electron hardening      | —                              | `pnpm verify:electron-hardening`       |
| 9   | Upload desktop build           | `actions/upload-artifact@v7`   | 上传 `dist/` 和 `dist-electron/`       |

#### Step 7 secret

| 变量                              | 来源                                      | 用途                       |
| --------------------------------- | ----------------------------------------- | -------------------------- |
| `APMS_LICENSE_PRIVATE_KEY_BASE64` | `secrets.APMS_LICENSE_PRIVATE_KEY_BASE64` | 同步 Electron license 公钥 |

### Job 6：`desktop-package` — 三平台 Electron 打包

```yaml
desktop-package:
  name: Desktop package (<os>)
  runs-on: <matrix.os>
  timeout-minutes: 30
  needs: desktop-build
  if: github.event_name != 'pull_request'
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: ubuntu-latest
          builder-args: --linux --x64
          artifact-name: apollo-map-studio-linux
        - os: macos-latest
          builder-args: --mac --x64 --arm64
          artifact-name: apollo-map-studio-macos
        - os: windows-latest
          builder-args: --win --x64
          artifact-name: apollo-map-studio-windows
```

| 项          | 值                                                      |
| ----------- | ------------------------------------------------------- |
| 依赖        | `needs: desktop-build`（复用 hardened assets artifact） |
| 超时        | 30 分钟                                                 |
| 矩阵        | 3 个 runner × 对应 electron-builder args                |
| `fail-fast` | `false`（一个平台失败不会取消另两个）                   |

#### Step 表

| #   | Step 名                   | Action                         | 命令 / 用途                                                        |
| --- | ------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| 1-4 | Checkout / pnpm / Node    | `actions/*`                    | Node `22.22.1` / pnpm `11.5.2`                                     |
| 5   | Download desktop build    | `actions/download-artifact@v5` | 下载 `apollo-map-studio-desktop-build` 到仓库根                    |
| 6   | Package desktop artifacts | —                              | `pnpm exec electron-builder <matrix.builder-args> --publish never` |
| 7   | Upload desktop artifacts  | `actions/upload-artifact@v7`   | 见下表                                                             |

#### Step 6 环境变量

| 变量                          | 值                 | 用途                                                         |
| ----------------------------- | ------------------ | ------------------------------------------------------------ |
| `NODE_OPTIONS`                | `--no-deprecation` | 静默 Electron Builder 依赖里的弃用提示                       |
| `CSC_IDENTITY_AUTO_DISCOVERY` | `false`            | 关闭 electron-builder 的 codesign 自动发现，避免无证书时报错 |

#### Step 7 上传产物

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

| Artifact                    | 平台    | 文件类型            |
| --------------------------- | ------- | ------------------- |
| `apollo-map-studio-linux`   | Linux   | `.AppImage`, `.deb` |
| `apollo-map-studio-macos`   | macOS   | `.dmg`, `.zip`      |
| `apollo-map-studio-windows` | Windows | `.exe`, `.zip`      |

::: warning `if-no-files-found: error`
任何一个平台上传到的文件为空都会让该 job 失败，阻止后续 release。
:::

### Job 7：`github-release` — Tag 发布

```yaml
github-release:
  name: GitHub Release
  runs-on: ubuntu-latest
  timeout-minutes: 10
  needs: [quality, benchmarks, web-build, docs-build, desktop-package]
  if: startsWith(github.ref, 'refs/tags/v')
  permissions:
    contents: write
```

| 项       | 值                                                                           |
| -------- | ---------------------------------------------------------------------------- |
| 依赖     | `quality`、`benchmarks`、`web-build`、`docs-build`、`desktop-package` 全成功 |
| 触发条件 | `refs/tags/v*`                                                               |
| 权限     | `contents: write`（发布 release）                                            |

#### Step 表

| #   | Step 名                  | Action                           | 用途                                                                          |
| --- | ------------------------ | -------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Download build artifacts | `actions/download-artifact@v5`   | 拉前两个 job 上传的 4 个 artifact                                             |
| 2   | Archive web artifact     | bash 内联                        | `cd artifacts/apollo-map-studio-web && zip -r ../apollo-map-studio-web.zip .` |
| 3   | Publish release          | `softprops/action-gh-release@v3` | 见下面 files 列表                                                             |

#### `files` 列表

```yaml
files: |
  artifacts/apollo-map-studio-web.zip
  artifacts/apollo-map-studio-linux/*
  artifacts/apollo-map-studio-macos/*
  artifacts/apollo-map-studio-windows/*
```

::: tip 完整发布矩阵
打 tag `v1.2.3` 后，GitHub Release 页会出现一份 web zip 加 Linux / macOS /
Windows 三平台对应的桌面安装文件。
:::

---

## `docs-preview.yml`

### Workflow 头部

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
      - 'pnpm-workspace.yaml'
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
```

| 项       | 值                                                                                 |
| -------- | ---------------------------------------------------------------------------------- |
| 触发分支 | `main`, `v1`                                                                       |
| 触发路径 | `docs/**`, `CHANGELOG.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` |
| 手动触发 | `workflow_dispatch`                                                                |
| 并发策略 | `pages`（**不**取消上一轮，避免 Pages 状态污染）                                   |

### Job：`deploy`

```yaml
deploy:
  name: Deploy Docs
  runs-on: ubuntu-latest
  environment:
    name: github-pages
    url: <deployment page url>
```

#### Step 表

| #   | Step 名               | Action                             | 命令 / 配置                                                         |
| --- | --------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| 1   | Checkout repository   | `actions/checkout@v6`              | —                                                                   |
| 2   | Install pnpm          | `pnpm/action-setup@v4`             | `version: 11.5.2`                                                   |
| 3   | Setup Node.js         | `actions/setup-node@v6`            | `node-version: 22.22.1`, `cache: pnpm`                              |
| 4   | Install dependencies  | —                                  | `pnpm install --frozen-lockfile`                                    |
| 5   | Build docs            | —                                  | `pnpm docs:build`，`VITEPRESS_BASE` 使用 repository name 组成子路径 |
| 6   | Configure Pages       | `actions/configure-pages@v6`       | —                                                                   |
| 7   | Upload Pages artifact | `actions/upload-pages-artifact@v5` | `path: docs/.vitepress/dist`                                        |
| 8   | Deploy Pages          | `actions/deploy-pages@v5`          | `id: deployment`                                                    |

::: tip `VITEPRESS_BASE` 的作用
GitHub Pages 默认部署在 `https://<owner>.github.io/<repo>/` 子路径下，
VitePress 需要知道 base 才能正确解析资源路径。`docs-preview.yml` 把
仓库名注入为 `/<repo-name>/`。详见 `docs/.vitepress/config.ts:6`。
:::

---

## 失败定位手册

### 「typecheck 失败」

- 本地复现：`pnpm typecheck`
- 常见原因：新增类型未导出 / `apollo.ts` 字段不匹配
- 关联：[Apollo Types](/reference/apollo-types)

### 「lint 失败」

- 本地复现：`pnpm lint`
- 常见原因：未排序 import、unused vars、react-hooks 规则
- 修复：`pnpm lint --fix`

### 「format:check 失败」

- 本地复现：`pnpm format:check`
- 修复：`pnpm format`

### 「bench 预算被踩」

- 本地复现：`pnpm bench --outputJson bench-results.json && node scripts/check-bench-budget.mjs bench-results.json`
- 处理流程：详见 [Benchmark Budgets](/reference/benchmark-budgets)

### 「desktop-package 单平台失败」

- `fail-fast: false`，其他平台不会被取消，但 release 不会出
- 本地复现：先跑 `pnpm build:desktop`，再跑对应 `pnpm exec electron-builder --linux --x64 --publish never` / `--mac --x64 --arm64` / `--win --x64`
- 常见原因：electron-builder 平台依赖缺失（macOS dmg-license、Windows wine）

### 「Pages 部署失败」

- 进入 GitHub Settings → Pages，查看 Environment 状态
- 检查 `pnpm docs:build` 是否本地通过
- 检查仓库 Pages 已启用为 GitHub Actions 模式

## 触发器矩阵

| 事件                      | `ci.yml::quality` | `ci.yml::desktop-build` | `ci.yml::desktop-package` | `ci.yml::github-release` | `docs-preview.yml::deploy` |
| ------------------------- | ----------------- | ----------------------- | ------------------------- | ------------------------ | -------------------------- |
| push main / v1            | ✅                | ✅                      | ✅                        | ❌                       | 仅当路径命中               |
| pull_request to main / v1 | ✅                | ❌                      | ❌                        | ❌                       | ❌                         |
| tag `v*`                  | ✅                | ✅                      | ✅                        | ✅                       | ❌                         |
| `workflow_dispatch`       | ❌                | ❌                      | ❌                        | ❌                       | ✅                         |

## 相关文档

- [Benchmark Budgets](/reference/benchmark-budgets)
- [更新日志](/changelog)
- [Electron 集成](/architecture/electron-integration)
- [测试策略](/architecture/testing-strategy)
- [构建打包](/architecture/build-and-bundle)
- [架构总览](/architecture/overview)
