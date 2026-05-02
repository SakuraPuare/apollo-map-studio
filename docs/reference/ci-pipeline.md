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
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

| 项目     | 值                          |
| -------- | --------------------------- |
| 触发分支 | `main`, `v1` 上的 push / PR |
| 触发 tag | `v*` 形如 `v1.0.0`          |
| 并发策略 | 同 ref 新提交会取消上一轮跑 |

### Job 1：`check` — 质量门禁与 Web 构建

```yaml
check:
  name: Typecheck & Test
  runs-on: ubuntu-latest
  timeout-minutes: 10
```

#### 环境

| 项      | 值              |
| ------- | --------------- |
| Runner  | `ubuntu-latest` |
| 超时    | 10 分钟         |
| Node.js | 20              |
| pnpm    | 10              |

#### Step 表

| #   | Step 名              | Action                       | 命令 / 用途                                                              |
| --- | -------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 1   | Checkout repository  | `actions/checkout@v6`        | 拉代码                                                                   |
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

::: tip Step 9 与 docs-preview 的关系
`pnpm docs:build` 只是验证 docs 能编译；真正发布 GitHub Pages 由
`docs-preview.yml` 处理。两条流水线互不依赖。
:::

### Job 2：`desktop-package` — 三平台 Electron 打包

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

| 项          | 值                                    |
| ----------- | ------------------------------------- |
| 依赖        | `needs: check`（先跑过质量门禁）      |
| 超时        | 30 分钟                               |
| 矩阵        | 3 个 runner × 1 配置                  |
| `fail-fast` | `false`（一个平台失败不会取消另两个） |

#### Step 表

| #   | Step 名                  | Action                       | 命令 / 用途                      |
| --- | ------------------------ | ---------------------------- | -------------------------------- |
| 1   | Checkout repository      | `actions/checkout@v6`        | —                                |
| 2   | Install pnpm             | `pnpm/action-setup@v4`       | `version: 10`                    |
| 3   | Setup Node.js            | `actions/setup-node@v6`      | `node-version: 20`               |
| 4   | Install dependencies     | —                            | `pnpm install --frozen-lockfile` |
| 5   | Build desktop artifacts  | —                            | `pnpm` + matrix `package-script` |
| 6   | Upload desktop artifacts | `actions/upload-artifact@v7` | 见下表                           |

#### Step 5 环境变量

| 变量                          | 值                                    | 用途                                                         |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `CSC_IDENTITY_AUTO_DISCOVERY` | `false`                               | 关闭 electron-builder 的 codesign 自动发现，避免无证书时报错 |
| `GH_TOKEN`                    | GitHub Actions `secrets.GITHUB_TOKEN` | electron-builder publish 需要                                |

#### Step 6 上传产物

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

### Job 3：`github-release` — Tag 发布

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

| 项       | 值                                |
| -------- | --------------------------------- |
| 依赖     | `check`、`desktop-package` 全成功 |
| 触发条件 | `refs/tags/v*`                    |
| 权限     | `contents: write`（发布 release） |

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
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
```

| 项       | 值                                                          |
| -------- | ----------------------------------------------------------- |
| 触发分支 | `main`, `v1`                                                |
| 触发路径 | `docs/**`, `CHANGELOG.md`, `package.json`, `pnpm-lock.yaml` |
| 手动触发 | `workflow_dispatch`                                         |
| 并发策略 | `pages`（**不**取消上一轮，避免 Pages 状态污染）            |

### Job：`deploy`

```yaml
deploy:
  name: Deploy Docs
  runs-on: ubuntu-latest
  environment:
    name: github-pages
    url: ${{ steps.deployment.outputs.page_url }}
```

#### Step 表

| #   | Step 名               | Action                             | 命令 / 配置                                                         |
| --- | --------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| 1   | Checkout repository   | `actions/checkout@v6`              | —                                                                   |
| 2   | Install pnpm          | `pnpm/action-setup@v4`             | `version: 10`                                                       |
| 3   | Setup Node.js         | `actions/setup-node@v6`            | `node-version: 20`, `cache: pnpm`                                   |
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
- 本地复现：相应 `pnpm package:linux | package:mac | package:win`
- 常见原因：electron-builder 平台依赖缺失（macOS dmg-license、Windows wine）

### 「Pages 部署失败」

- 进入 GitHub Settings → Pages，查看 Environment 状态
- 检查 `pnpm docs:build` 是否本地通过
- 检查仓库 Pages 已启用为 GitHub Actions 模式

## 触发器矩阵

| 事件                      | `ci.yml::check` | `ci.yml::desktop-package` | `ci.yml::github-release` | `docs-preview.yml::deploy` |
| ------------------------- | --------------- | ------------------------- | ------------------------ | -------------------------- |
| push main / v1            | ✅              | ✅                        | ❌                       | 仅当路径命中               |
| pull_request to main / v1 | ✅              | ✅                        | ❌                       | ❌                         |
| tag `v*`                  | ✅              | ✅                        | ✅                       | ❌                         |
| `workflow_dispatch`       | ❌              | ❌                        | ❌                       | ✅                         |

## 相关文档

- [Benchmark Budgets](/reference/benchmark-budgets)
- [更新日志](/changelog)
- [Electron 集成](/architecture/electron-integration)
- [测试策略](/architecture/testing-strategy)
- [构建打包](/architecture/build-and-bundle)
- [架构总览](/architecture/overview)
