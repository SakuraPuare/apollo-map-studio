---
title: 安装与运行
description: 在 Linux / macOS / Windows 上安装 Apollo Map Studio 的开发依赖与桌面壳，覆盖 pnpm、Vite、Electron 42、electron-builder 打包流水线。
---

# 安装与运行 / Installation

::: tip 适用读者
本页给开发者与首次试用者：拿到源码、把开发服务器跑起来、把桌面壳打包成 `.AppImage` / `.dmg` / `.exe`。如果你只想下载已打包二进制，跳到 [发行版下载](#发行版下载--release-downloads)。
:::

## 概览 / Overview

Apollo Map Studio 是一个 React 19 + TypeScript + Vite 8 的工程，桌面端套 Electron 42 壳。所有依赖通过 **pnpm** 管理，CI 在 `.github/workflows/ci.yml` 跑 typecheck / lint / format / test / bench / docs / desktop package。

### 软件栈版本

| 依赖 / Package   | 版本（package.json） | 说明                                   |
| ---------------- | -------------------- | -------------------------------------- |
| Node.js          | ≥ 22.22.1            | `package.json` engines 要求            |
| pnpm             | ≥ 11.5.2             | `packageManager: pnpm@11.5.2`          |
| TypeScript       | `^6.0.3`             | tsconfig.json + tsconfig.electron.json |
| Vite             | `^8.0.16`            | dev / build / preview                  |
| Electron         | `^42.3.3`            | 桌面壳                                 |
| electron-builder | `^26.15.2`           | 打包 dmg/AppImage/exe                  |
| MapLibre GL      | `^5.24.0`            | WebGL 渲染                             |
| Zustand / zundo  | `^5.0.14` / `^2.3.0` | 数据中心 + 撤销                        |
| XState           | `^5.32.0`            | 编辑 FSM                               |
| protobufjs       | `^8.6.1`             | Apollo proto codec                     |
| proj4            | `^2.20.8`            | UTM ↔ WGS84                            |

## 操作步骤 / Steps

### 1. 克隆与安装

```bash
git clone <repo-url>
cd apollo-map-studio
pnpm install
```

::: warning Apple Silicon 注意
macOS arm64 拉 `electron` 可能要走代理。可以临时设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
:::

### 2. Web 模式

```bash
pnpm dev
```

`vite` 默认监听 `127.0.0.1:5173`（与 `electron:dev` 用同一端口）。HMR 由 `@vitejs/plugin-react` 提供。

### 3. 桌面 / Electron 模式

```bash
pnpm electron:dev
```

`package.json` 中 `electron:dev` 的脚本逻辑：

```mermaid
flowchart LR
  A[concurrently] --> B[vite --host 127.0.0.1]
  A --> C[wait-on tcp:127.0.0.1:5173]
  C --> D[pnpm build:electron]
  D --> E[electron .]
  B --> E
```

- `vite` 提供前端资源；
- `wait-on` 等到 5173 就绪；
- `tsc -p tsconfig.electron.json` 编译主进程到 `dist-electron/`；
- `cross-env ELECTRON_RENDERER_URL=http://127.0.0.1:5173 electron .` 启动桌面壳，主进程加载远端 dev URL。

### 4. 离线启动 / 不带 HMR

```bash
pnpm electron:start    # = pnpm build:desktop && electron .
```

适合在 CI 或离线机器上跑生产构建。

### 5. 打包

```bash
pnpm package           # 只打 --dir，便于本地排错
pnpm package:linux     # AppImage / deb
pnpm package:mac       # dmg（x64 + arm64 双架构）
pnpm package:win       # nsis exe
```

`electron-builder` 配置在仓库根 `electron-builder.yml`（如有）或 `package.json` 的 `build` 字段中（按版本而定）。CI 流水线 `.github/workflows/ci.yml` 会先构建 web/docs/hardened Electron assets，再用 `pnpm exec electron-builder ... --publish never` 打包桌面产物；本地 `package:*` 脚本会先跑 `build:desktop`。

### 6. 文档站

```bash
pnpm docs:dev          # localhost:5173
pnpm docs:build
pnpm docs:preview
```

本地 `docs:dev` 默认使用根路径 `/`。如需预览 GitHub Pages 等子路径部署，显式设置 `VITEPRESS_BASE=/apollo-map-studio/ pnpm docs:dev`。

VitePress 配置在 `docs/.vitepress/config.ts`。

## 选项与参数表 / Options Table

| 命令 / Script                    | 调用                                                                                                            | 用途                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `pnpm dev`                       | `vite`                                                                                                          | 浏览器开发，端口 5173                   |
| `pnpm build`                     | `pnpm build:web && pnpm build:docs:desktop`                                                                     | 输出 `dist/` 与 `dist/docs`             |
| `pnpm build:web`                 | `vite build`                                                                                                    | 输出 renderer 到 `dist/`                |
| `pnpm preview`                   | `vite preview`                                                                                                  | 本地预览生产构建                        |
| `pnpm build:electron`            | sync public key + clean + `tsc -p tsconfig.electron.json`                                                       | 编译 main / preload 到 `dist-electron/` |
| `pnpm build:electron:hardened`   | `build:electron` + harden script                                                                                | 加密受保护 Electron 模块                |
| `pnpm verify:electron-hardening` | verifier script                                                                                                 | 校验 sealed modules / loader / manifest |
| `pnpm build:desktop`             | `build && build:electron:hardened && verify:electron-hardening`                                                 | Web + docs + hardened Electron 全量构建 |
| `pnpm electron:dev`              | concurrently vite + electron                                                                                    | 桌面 HMR                                |
| `pnpm electron:start`            | build:desktop + electron .                                                                                      | 离线/生产                               |
| `pnpm package`                   | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --dir --publish never`               | 不签名、不打包发行                      |
| `pnpm package:linux`             | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --linux --x64 --publish never`       | AppImage / deb / rpm                    |
| `pnpm package:mac`               | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --mac --x64 --arm64 --publish never` | dmg                                     |
| `pnpm package:win`               | `build:desktop && cross-env NODE_OPTIONS=--no-deprecation electron-builder --win --x64 --publish never`         | nsis exe                                |
| `pnpm typecheck`                 | renderer + config + Electron tsconfigs                                                                          | 三套 tsconfig 校验                      |
| `pnpm lint`                      | `eslint . && react-doctor`                                                                                      | flat config + UI 结构检查               |
| `pnpm test`                      | `vitest run`                                                                                                    | 单元 / 集成                             |
| `pnpm test:electron`             | `node scripts/run-electron-tests.mjs`                                                                           | Electron 主进程测试                     |
| `pnpm bench`                     | `vitest bench --run --maxWorkers=1`                                                                             | 稳定性能基线                            |
| `pnpm bench:fast`                | `vitest bench --run --maxWorkers=100%`                                                                          | 快速本地性能摸底                        |

## 键盘鼠标速查表 / Shortcut Cheatsheet

安装阶段不涉及画布快捷键，但首次启动后建议熟悉：

| 操作          | 快捷键                 | 说明                 |
| ------------- | ---------------------- | -------------------- |
| 命令面板      | `⌘K`                   | 索引全部 action 入口 |
| 设置          | `⌘,`                   | 打开 Settings 弹窗   |
| 重启 Electron | DevTools 中 `Ctrl+R`   | 主进程仍存活         |
| 打开 DevTools | `⌘⌥I` / `Ctrl+Shift+I` | 调试渲染进程         |

## 常见问题 / Troubleshooting

### Q1. `pnpm install` 卡在 `electron` 下载

切镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install
```

### Q2. `electron:dev` 报 `Failed to load URL http://127.0.0.1:5173/`

`wait-on` 默认 30s 超时。如果机器很慢，把脚本改成 `wait-on -t 120000 tcp:127.0.0.1:5173`。

### Q3. macOS 启动报 “未签名开发者”

打开 `系统设置 → 隐私与安全性`，点击「仍然打开」。要彻底解决需要 `electron-builder.yml` 配置 codeSign。

### Q4. Windows 上 `electron-builder` 找不到 `wine`

仅在跨平台从 macOS/Linux 打 win 包时需要 `wine` 或 `wine64`。原生在 Windows 打则无需。

### Q5. `pnpm test` 报 `import.meta.glob is not a function`

确认 `vitest` 版本与 Vite 8 兼容。proto loader 用了 `import.meta.glob('/src/proto/**/*.proto', { query: '?raw', eager: true })`，低版本 vitest 的 vite 集成不支持 `query`。

## 发行版下载 / Release downloads

打过 tag 之后，CI 会上传到 GitHub Releases：

- `Apollo-Map-Studio-<version>-linux.AppImage`
- `Apollo-Map-Studio-<version>.dmg`
- `Apollo-Map-Studio-<version>-Setup.exe`

签名策略见 `.github/workflows/ci.yml` 的 desktop package job。

## 相关源码 / Source links

- `package.json` — scripts / engines / pnpm onlyBuiltDependencies
- `tsconfig.electron.json` — Electron 主进程编译目标
- `.github/workflows/ci.yml` — typecheck / lint / format / test / bench / docs / desktop package

## 相关文档 / See also

- [快速开始](./getting-started.md)
- [设置](./settings.md)
- [License 激活](./license-activation.md)
