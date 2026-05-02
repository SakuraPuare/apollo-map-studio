---
title: 更新日志
description: Apollo Map Studio 版本发布历史，记录每个版本的功能、修复、CI/CD 与文档变更。
---

# 更新日志

本页是 Apollo Map Studio 项目的官方更新日志，按时间倒序记录每个版本的变更。
唯一事实来源是仓库根目录的 [`CHANGELOG.md`](https://github.com/SakuraPuare/apollo-map-studio/blob/main/CHANGELOG.md)，
本页保持镜像同步。

::: tip 版本号语义
项目采用 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)：
**MAJOR.MINOR.PATCH**。`v1` 分支表示生产线，`main` 分支用于实验性整理。
所有以 `v*` 形式打的 git tag 都会触发 CI 的 `github-release` job。
:::

## [1.0.0] — 2026-05-02

第一个对外稳定版本。该版本完成了 Web → Electron 桌面双形态发布、离线激活、
Worker 化的 Apollo 导入导出，以及 Apollo 协议 round-trip 关键字段（boundary
curve / proto2 optional / overlap / map header metadata）的保真。

### 新功能（Features）

| 主题            | 描述                                                                                             | 关联架构页                                          |
| --------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 桌面打包        | 新增 Linux、macOS、Windows 三平台 Electron 打包流水线，输出 AppImage / deb / dmg / zip / exe。   | [Electron 集成](/architecture/electron-integration) |
| 离线激活        | 新增机器码绑定的离线激活码体系，主进程做签名校验，renderer 仅展示状态。                          | [授权系统](/architecture/license-system)            |
| 导入导出 Worker | 将 Apollo `.bin` 解析与编码迁入 Web Worker，主线程不再因大图卡顿；提供进度 UI。                  | [Worker 协议](/architecture/worker-protocol)        |
| Apollo 元素覆盖 | 扩充 Apollo 元素的检视器表单与元数据展示，覆盖 lane / junction / signal / road / overlap 等。    | [Inspector 系统](/architecture/inspector-system)    |
| Round-trip 保真 | 保留 boundary curve、proto2 optional 语义、overlap 派生、map header 元数据，导入导出零字段丢失。 | [导出引擎](/architecture/export-engine)             |
| 性能优化        | 引入冷热分层渲染、Web Worker 化 spatial 重建、bench-budgets 性能预算守卫。                       | [冷热分层](/architecture/cold-hot-layers)           |

### CI / CD

- 新增基于 pnpm 的 CI（`.github/workflows/ci.yml`），在 ubuntu-latest 上完成
  typecheck、lint、prettier 校验、Web 生产构建、文档构建、单元测试、benchmark
  与性能预算守卫。
- 新增 `desktop-package` 矩阵 job，覆盖 ubuntu-latest / macos-latest / windows-latest
  三个 runner，并通过 `actions/upload-artifact@v7` 上传产物。
- 新增 `github-release` job，在以 `v*` 打 tag 时使用 `softprops/action-gh-release@v3`
  发布 GitHub Release，自动归档 web 与桌面三平台产物。
- 新增 `docs-preview.yml`，监听 `docs/**`、`CHANGELOG.md`、`package.json`、
  `pnpm-lock.yaml` 路径，生成 GitHub Pages 子路径部署，环境名为 `github-pages`。

### 文档

- 恢复 `v1` 代码线下的 README、LICENSE、CHANGELOG 与 VitePress 文档骨架。
- 新增中英双语 reference 章节（即本章节）：协议、类型、枚举、性能预算、CI、设计令牌。

## [0.2.0] — 2026-02-25

### 新功能

- 新增道路（Road）分组 UI，将多车道分配到同一 road / section。
- 新增地图校验报告与元素列表浏览器（element list explorer），便于全局排查孤立 lane / 缺失 boundary。
- 新增 road properties 面板，展示 lane 拓扑摘要。

### Bug 修复

- 修复导入 / 导出过程中字节单位换算问题（speed_limit 在 m/s 与 km/h 间的误转换）。
- 修复 lane 之间的 predecessor / successor 关系，以及 junction polygon 的左右手定则归一化。

### 文档

- 落地初版 VitePress 文档站，覆盖 architecture、guide、api 三大类目。

## [0.1.0] — 2026-02-18

### 新功能

- 项目初始化：基于 Vite + React 19 + TypeScript 6 启动 Apollo Map Studio web 编辑器。
- 新增 Apollo proto 加载（protobufjs）、二进制 map 导入与导出、参数化几何工具。
- 新增 Zustand stores（mapStore / uiStore）、zundo undo/redo、MapLibre 渲染基础。
- 新增基础编辑器 UI：菜单栏、工具条、地图画布、属性面板初版。

## 升级指南

::: warning 0.x → 1.0.0

- **License**：1.0.0 引入了离线激活，未授权状态下进入只读模式；通过
  [离线激活指南](/guide/license-activation) 获取激活码。
- **Worker 协议**：`spatial.worker.ts` 协议升级至 v2，旧版自定义 worker bridge
  需要按 [Worker 协议](/architecture/worker-protocol) 重新对齐。
- **Bench 预算**：CI 现在会强制执行 `scripts/bench-budgets.json` 中的 p99 上限。
  本地若 bench 偏高，先排查机器负载，再考虑 PR 内调整预算并附说明。
  :::

## 链接

- [项目 README](https://github.com/SakuraPuare/apollo-map-studio#readme)
- [GitHub Releases](https://github.com/SakuraPuare/apollo-map-studio/releases)
- [架构总览](/architecture/overview)
- [Reference 入口](/reference/)
- [性能预算](/reference/benchmark-budgets)
- [CI 流水线](/reference/ci-pipeline)

## 历史风险与已知问题

> 以下条目并非新增功能，而是用于追踪当前文档梳理过程中识别出的工程红线，
> 适合贡献者作为 follow-up 入口。

- `settingsStore.historyLimit` 被修改后，已经创建的 zundo temporal store
  不会自动重建，需重启或 reload 才能完全应用，参见
  [状态管理](/architecture/state-management)。
- `replaceImportedEntityMap` 会清空 undo history，导入被视为新文档快照，
  不是普通编辑动作；undo/redo 不能跨越导入边界。
- `recomputeOverlapsAsync()` 使用调用时的实体快照；worker 计算期间继续编辑
  会出现短暂 drift，patch apply 后状态会重新一致。
- renderer 侧授权状态用于 UI 展示，真正校验位于 Electron 主进程；
  绕过 renderer 不会绕过 license。
- `tools/license-gen/gen-keys.mjs --rotate` 会改写
  `electron/license/public-key.cts`，并使旧 activation code 对新构建失效；
  必须作为发布事件管理。

## 1.0.0 版本 PR 概览（精选）

> 1.0.0 涵盖大量提交，下面只列出对架构 / 协议 / CI 影响最大的几类变更，
> 完整提交历史请用 `git log --oneline v0.2.0..v1.0.0` 查看。

| 主题            | 说明                                                 |
| --------------- | ---------------------------------------------------- |
| feat(license)   | ed25519 keypair + 机器码绑定 + Electron 主进程校验   |
| ci(desktop)     | tag push 触发跨平台打包 Linux / macOS / Windows      |
| chore(v1)       | 把 v1 分支重新接入 docs / ci / release 流程          |
| chore(merge)    | 保留 v1 树并合并 main 历史，解决长期偏离             |
| docs(vitepress) | 多 agent 并行重写文档；本 reference 章节即来自该批次 |

## 各版本影响面对照表

| 子系统                  | 0.1.0          | 0.2.0          | 1.0.0                                                         |
| ----------------------- | -------------- | -------------- | ------------------------------------------------------------- |
| Apollo proto round-trip | 基础           | 修复 byte/单位 | boundary curve / proto2 optional / overlap unknown 全保真     |
| 渲染管线                | 单层           | 单层           | 冷热分层、worker 化 spatial、RAF coalesce                     |
| 状态机                  | 简单切换       | 引入选中态     | drawPolyline / Bezier / Catmull / Arc / Rect / Polygon 多状态 |
| Inspector               | 基础字段       | 多字段         | 全 Apollo 元素 + override 跟踪                                |
| 离线激活                | —              | —              | 机器码绑定，主进程校验                                        |
| 桌面打包                | —              | —              | Linux / macOS / Windows 三平台                                |
| CI                      | 基础 typecheck | + 单元测试     | + 文档构建、bench、桌面打包矩阵、Release                      |

## 子系统所有者矩阵

| 子系统                | 主要 owner（角色） | 关键文件                                                |
| --------------------- | ------------------ | ------------------------------------------------------- |
| FSM / drawing         | core engineer      | `src/core/fsm/editorMachine.ts`                         |
| Anti-corruption layer | core engineer      | `src/lib/entityOps.ts`                                  |
| Cold/Hot 渲染         | rendering engineer | `src/hooks/useColdLayer.ts`, `src/hooks/useHotLayer.ts` |
| Spatial worker        | rendering engineer | `src/core/workers/spatial.worker.ts`                    |
| Inspector & forms     | UI engineer        | `src/components/panels/Inspector*`                      |
| License               | platform engineer  | `electron/license/*`, `tools/license-gen/*`             |
| CI / release          | platform engineer  | `.github/workflows/ci.yml`                              |
| Docs (本页)           | docs maintainer    | `docs/**`                                               |

## 路线图（信息性，无承诺）

::: tip 仅供参考
此处仅作为方向感共享，不构成发布承诺。任何条目落地后会从这里删除并出现在
对应的版本章节里。
:::

| 主题           | 描述                                                                      | 关联章节                                            |
| -------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| 多语言 i18n    | `enumLabels.ts` 已经预留 hook，未来引入 i18next 时只需要替换 dictionary。 | [Enum Mappings](/reference/enum-mappings)           |
| 亮色主题       | 1.0 仅暗色；亮色主题计划通过 `[data-theme="light"]` 覆盖 `ams-*` token。  | [Color Palette](/reference/color-palette)           |
| Worker 协议 v3 | 计划引入 `SharedArrayBuffer` 减少 postMessage clone 开销。                | [Worker 协议](/architecture/worker-protocol)        |
| 跨平台原生菜单 | 当前 Electron 菜单仍由 React 渲染；计划迁移至原生菜单 API。               | [Electron 集成](/architecture/electron-integration) |

## 版本号语义解读

| 升级          | 说明                                               | 兼容性       |
| ------------- | -------------------------------------------------- | ------------ |
| MAJOR (X.0.0) | proto wire-format 不兼容、CLI 入口变更、数据迁移   | 需要迁移指南 |
| MINOR (1.X.0) | 新增功能、新增 inspector 字段、新增 worker message | 向后兼容     |
| PATCH (1.0.X) | bug 修复、文档修正、不影响行为的内部重构           | 完全向后兼容 |

## 发布检查清单

每次发布前，release manager 会逐条对照：

1. ✅ `pnpm typecheck` / `pnpm lint` / `pnpm format:check` 全绿
2. ✅ `pnpm test` 通过
3. ✅ `pnpm bench && node scripts/check-bench-budget.mjs` 全部 PASS
4. ✅ `pnpm build:web` 与 `pnpm package:linux | mac | win` 各自成功
5. ✅ 本 changelog 与 [/en/changelog](/en/changelog) 双语同步
6. ✅ `CHANGELOG.md`（仓库根）已添加新版本头部并提交
7. ✅ tag 已签署 (`git tag -s vX.Y.Z`)
8. ✅ tag push 后 CI 三个 job（check / desktop-package / github-release）全绿

## 兼容性矩阵

| 项目         | 1.0.0                                                       |
| ------------ | ----------------------------------------------------------- |
| Node.js      | ≥ 20                                                        |
| pnpm         | ≥ 10                                                        |
| 浏览器       | Chrome 120+, Firefox 120+, Safari 17+（建议 Chromium 系列） |
| Electron     | 41                                                          |
| Apollo proto | proto2 syntax，与 Apollo 9.0 字段对齐                       |
| MapLibre GL  | 5.x                                                         |
| Dockview     | 5.x                                                         |
| TypeScript   | 6.x                                                         |
| Vite         | 8.x                                                         |
| React        | 19.x                                                        |
| XState       | 5.x                                                         |
| Zustand      | + zundo middleware                                          |

## 弃用与移除

> 1.0.0 不存在已弃用 API。0.x 期间所有破坏性变更已经在本 changelog 历史中
> 体现，1.0.0 视为「全新基线」。后续版本任何弃用必须先经 1 个 MINOR 版本
> 警告，再在下一个 MAJOR 版本移除。

| 计划弃用                            | 状态            | 替代                                                     |
| ----------------------------------- | --------------- | -------------------------------------------------------- |
| `editorMachine` 的 `// @ts-nocheck` | 计划 1.x 中移除 | 切到 `setup({}).createMachine(...)` 或 XState 修复后取消 |

## 性能基线（1.0.0 vs 0.2.0）

| 场景                         | 0.2.0    | 1.0.0                   | 提升           |
| ---------------------------- | -------- | ----------------------- | -------------- |
| 100-lane 链全量缝合 p99      | ~12 ms   | ~5 ms                   | ~2.4x          |
| 单 lane 编辑增量装饰 p99     | 等同全量 | < 5 ms                  | ~10x（视图深） |
| 1000-point polyline 偏移 p99 | ~80 ms   | ~40 ms                  | ~2x            |
| 大图导入主线程阻塞           | ~3 s     | < 200 ms（worker 化后） | ~15x           |

::: warning 数据来源
上表为内部基准记录，实际项目的真实数据请以 `pnpm bench` 输出为准。
:::

## 安全相关

- 离线激活密钥对（ed25519）位于 `electron/license/public-key.cts`，**不是**
  本仓库的秘密；私钥由发行方独立保管。
- `tools/license-gen/gen-keys.mjs --rotate` 是一次性破坏性操作；轮换后旧
  activation code 立刻失效。
- 渲染端的 license 状态仅供 UI 提示；任何「绕过 renderer」的尝试不会绕过
  Electron 主进程校验。

## 历史里程碑（按主题）

- **数据保真**：Apollo proto2 optional 严格保持，无 round-trip 注水。
- **性能**：冷热分层 + worker 化 + RAF coalesce + 增量装饰。
- **工程化**：bench 性能预算、CI 三平台桌面打包、文档自动部署。
- **可分发**：Web + Linux/macOS/Windows 三平台一同发布。
- **可商用**：离线激活、机器码绑定、密钥独立保管。

## 文档维护约定

- **仅追加**：1.0.0 及之后版本的章节不允许 inline 修改，仅通过补充 PATCH
  版本来纠正历史问题。
- **零虚构**：本页不出现未发布的版本号；每条 entry 必须能在
  `git log --tags --simplify-by-decoration` 中找到对应 tag。
- **双语镜像**：本页变更必须同步反映到 [English Changelog](/en/changelog)。
- **关联 PR / Issue**：建议每条 entry 在适当的位置链接对应的 GitHub PR
  或 Issue，便于回溯设计动机。
- **审核**：本页修改必须在 PR 中得到至少一名 maintainer review。
