---
title: 开发环境搭建
description: pnpm install / pnpm dev / pnpm electron:dev、Node 版本、跨平台注意、推荐 VS Code 扩展。
---

# 开发环境搭建

本章覆盖从 clone 到第一次 `pnpm dev` 的最短路径，外加 Electron 调试与
平台特定注意事项。

::: tip TL;DR

```bash
git clone <repo>
cd apollo-map-studio
pnpm install
pnpm dev   # localhost:5173
```

Web 编辑器跑起来后再考虑 Electron。
:::

## 必备 (Required)

- **Node.js 22.22.1+** — `node -v` 应显示 `v22.22.1` 或更高。
- **pnpm 11.5.2** — `pnpm -v` 应显示 `11.5.2`。
- **Git 2.40+** — Husky 9 依赖 modern git。
- **OS** — Linux / macOS / Windows 都可（Windows 推荐 WSL2 跑测试）。

::: warning 不要用 npm / yarn
`pnpm-lock.yaml` 是项目唯一 lockfile。`npm install` 会生成 `package-lock.json`
并解出不同的依赖图，导致 CI 与本地不一致。
:::

## 安装 Node + pnpm

### 推荐：fnm + corepack

```bash
# 一次性
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 22.22.1
fnm use 22.22.1
corepack enable
corepack prepare pnpm@11.5.2 --activate
```

### 或：volta

```bash
curl https://get.volta.sh | bash
volta install node@22.22.1
volta install pnpm
```

::: tip 不用 nvm？
nvm 没问题，但启动慢且不支持自动 corepack。fnm 是 Rust 实现的快版，本仓库
推荐。
:::

## 第一次 setup

```bash
git clone <repo-url>
cd apollo-map-studio
pnpm install         # 安装依赖 + 触发 husky
pnpm typecheck       # 一定要先跑通，找环境问题
pnpm test            # 跑单测，~6s
pnpm dev             # 启动 vite，默认 5173
```

打开 localhost:5173，应当看到地图编辑器主界面（地图为空白，
正常）。

### 验证 husky

```bash
ls -la .husky/_/
# 应有 pre-commit / commit-msg / ...
```

如果没有，跑 `pnpm install` 时 `prepare` 脚本（`husky`）应该会自动安
装。如果脚本被禁用了：

```bash
pnpm exec husky install
```

## Electron 开发

```bash
pnpm electron:dev
```

这条命令同时启动两个进程：

1. **vite dev server** at `127.0.0.1:5173`（concurrently 第一行）
2. **Electron** 加载该 URL（concurrently 第二行）

热更新：渲染进程改 React/CSS 立即热替换。**主进程**改了
`electron/main.ts` 需要 Ctrl+C 然后重跑 `pnpm electron:dev`。

::: tip Linux 沙盒
某些 Linux 发行版（Ubuntu 22+）需要 `--no-sandbox` 才能跑 Electron dev。
脚本已配；如果你看到 `chrome-sandbox` 报错，确认你没改 `package.json`
的 `electron:dev` 脚本。
:::

## 推荐 VS Code 扩展

| 扩展                                   | 用途                     |
| -------------------------------------- | ------------------------ |
| ESLint (dbaeumer)                      | flat config 已配，开就用 |
| Prettier (esbenp)                      | 保存自动格式化           |
| Tailwind CSS IntelliSense              | utility class 补全       |
| TypeScript Vue Plugin (Volar) — 不需要 | 我们没用 Vue             |
| Stylelint                              | tokens.css 守卫          |
| GitLens                                | blame / history 浏览     |
| Vitest                                 | 测试快捷面板             |
| Mermaid Markdown                       | 文档站 mermaid 预览      |

### `.vscode/settings.json` 推荐

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

::: warning `files.eol` 必须 `\n`
`.prettierrc.json` 强制 LF。Windows 用户的 CRLF 会导致 Prettier 报错。
git 配置 `core.autocrlf=input` 也行。
:::

## 平台说明

### macOS

- Apple Silicon 原生 Node 22 ARM 即可。
- 一些 native deps（如 keytar，本项目没用）需 Rosetta；当前依赖纯 JS。
- 桌面打包详见 [打包桌面版本](../recipes/packaging-desktop-builds)。

### Linux

- Ubuntu 22.04+ / Debian 12+ / Fedora 38+ 测试通过。
- AppImage 运行需 `libfuse2`：`sudo apt install libfuse2`。
- 沙盒问题见上方 `--no-sandbox` 备注。

### Windows

- **强烈推荐 WSL2** 做日常开发（CI 就是 ubuntu-latest）。
- 原生 PowerShell 也行，但路径分隔符 / 行尾 / 权限可能踩坑。
- Windows Defender 实时扫描会让 `pnpm install` 慢 3-5 倍。把项目目录
  加排除列表。

## 常用脚本速查

| 脚本                  | 作用                                |
| --------------------- | ----------------------------------- |
| `pnpm dev`            | Web 开发服务器                      |
| `pnpm build`          | Web 生产构建                        |
| `pnpm electron:dev`   | Electron 开发模式                   |
| `pnpm electron:start` | Electron 生产模式（已 build）       |
| `pnpm package`        | 当前 OS 打包                        |
| `pnpm package:linux`  | 打 Linux 包                         |
| `pnpm package:mac`    | 打 macOS 包                         |
| `pnpm package:win`    | 打 Windows 包                       |
| `pnpm typecheck`      | tsc + tsc -p tsconfig.electron.json |
| `pnpm lint`           | ESLint                              |
| `pnpm lint:fix`       | ESLint --fix                        |
| `pnpm format`         | Prettier --write                    |
| `pnpm format:check`   | Prettier --check                    |
| `pnpm test`           | Vitest run                          |
| `pnpm bench`          | Vitest bench                        |
| `pnpm docs:dev`       | VitePress 文档站                    |
| `pnpm docs:build`     | VitePress build                     |

## 故障排查 (Troubleshooting)

### `pnpm install` 卡住

切镜像：

```bash
pnpm config set registry https://registry.npmmirror.com
pnpm install --frozen-lockfile
```

::: warning 不要把 registry 写进 `.npmrc` 提交
镜像因网络环境而异，写进 repo 会让海外贡献者拉不到包。配在 user 级
`~/.npmrc` / `~/.config/pnpm/rc`。
:::

### 端口 5173 被占

```bash
pnpm dev --port 5174
```

或 `lsof -i :5173` 找谁占着然后 kill。

### Electron 启动黑屏

可能：

- `dist/` 没生成 — 跑 `pnpm build:web`。
- preload 报错 — 看终端 stderr。
- DevTools 打开（`Ctrl+Shift+I`）看 Console。

### TypeScript 报 "Cannot find module '@/...'"

`tsconfig.json` 的 `paths` 与 `vite.config.ts` 的 `resolve.alias` 必须
保持同步。重启 VS Code 让 TS Server 重读 config（`Cmd+Shift+P → Restart TS Server`）。

### Husky pre-commit 没触发

```bash
ls -la .husky/_/
# 应有可执行 hook 脚本
chmod +x .husky/pre-commit  # 必要时
```

## 相关源码 (Source links)

- [`package.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/package.json) — scripts 节
- [`pnpm-lock.yaml`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/pnpm-lock.yaml)
- [`.husky/pre-commit`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/.husky/pre-commit)
- [`vite.config.ts`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/vite.config.ts)
- [`tsconfig.json`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/tsconfig.json)

## 下一步 (Next steps)

- 跑通环境后阅读 [代码风格](./code-style)、
  [提交规范](./commit-conventions)、[PR 清单](./pr-checklist)。
- 想动核心模块前先读 [架构总览](../architecture/overview)。
- 想画第一条 lane？参见 [快速开始](../guide/getting-started)。

## Docker / Codespaces

未官方支持，但可用：

```bash
# 任何 Node 22.22.1+ + pnpm 11.5.2 镜像都能跑
docker run -it --rm -v "$PWD":/app -w /app node:22 bash
corepack enable
pnpm install
pnpm test
```

GitHub Codespaces 用 `.devcontainer/devcontainer.json`（如启用）能拉
预热环境。当前未提交，欢迎 PR。

## 常用 Git 工作流

```bash
git checkout -b feat/awesome-thing
# 写代码、commit
git push -u origin feat/awesome-thing
gh pr create --fill --base main
```

参见 [PR 清单](./pr-checklist) 与
[提交规范](./commit-conventions)。

::: tip 一句话
**先跑通**再看代码。任何 setup 问题先排环境（Node 版本、pnpm 版本），
不要在源码里找答案。
:::
