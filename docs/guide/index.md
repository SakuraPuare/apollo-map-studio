---
title: 用户指南索引
description: Apollo Map Studio 用户指南的入口与全站地图，覆盖入门、绘制、属性编辑、拓扑、导入导出、设置、许可证与故障排查的全部页面。
---

# 用户指南 / Guide

> 本指南面向 Apollo Map Studio (AMS) 的最终使用者：**高精地图标注工程师 / 自动驾驶仿真工程师 / 路测车队运维**。
> 与 [Architecture](/architecture/) 和 [Design](/design/) 不同，本指南 **不解释代码**，只解释“界面上每一个按钮、每一个快捷键、每一段流程的意义”。

::: tip 阅读顺序建议
首次接触本工具的用户建议按 **入门 → 绘制 → 属性 → 拓扑 → 导入导出 → 设置/快捷键 → 故障排查** 的顺序阅读。已经熟悉 QGIS / Photoshop 的用户可以跳过入门章节，直接跳到 [MenuBar 与 ToolStrip](./menubar-and-toolstrip.md) 与 [Inspector](./inspector.md)。
:::

## 全站地图 / Site Map

下表按常见任务整理指南入口。英文版在同名 `docs/en/guide/` 页面中维护，侧边栏也提供语言切换。

| 分类                     | 中文页面                                     | 适合解决的问题                                                 |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------- |
| **入门 / Onboarding**    | [快速开始](./getting-started.md)             | 五分钟内跑起应用、认识工作区、完成一次导入和导出               |
|                          | [安装与运行](./installation.md)              | 准备 Node、pnpm、Vite、Electron 和桌面打包环境                 |
|                          | [许可证激活](./license-activation.md)        | 理解桌面端离线激活、机器码、过期与只读状态                     |
| **总体界面 / Workspace** | [菜单栏与工具条](./menubar-and-toolstrip.md) | 找到导入、导出、绘制、视图切换等入口                           |
|                          | [活动栏与面板](./activity-bar-and-panels.md) | 使用 Layer Tree、Search、Inspector、Timeline 等侧边面板        |
|                          | [命令面板](./command-palette.md)             | 用 `⌘K` / `Ctrl+K` 快速搜索并执行动作                          |
|                          | [设置](./settings.md)                        | 调整地图中心、缩放、车道半宽、历史步数和渲染参数               |
| **绘制 / Drawing**       | [绘制工具总览](./drawing-tools.md)           | 选择折线、贝塞尔、圆弧、矩形、多边形等绘制工具                 |
|                          | [车道绘制](./drawing-lanes.md)               | 从中心线创建 Lane，并理解边界、半宽、邻接与路口关系            |
|                          | [编辑与吸附](./editing-and-snapping.md)      | 移动点位、吸附端点、撤销重做和保持拓扑一致                     |
|                          | [坐标系与投影](./coordinate-system.md)       | 处理 WGS84、UTM、Apollo ENU 与 PROJ.4 配置                     |
| **属性 / Inspection**    | [Inspector 面板](./inspector.md)             | 编辑实体属性、边界类型、限速、拓扑引用和 Overlap pin           |
|                          | [图层树](./layer-tree.md)                    | 按实体类型浏览、选择、定位和组织地图元素                       |
|                          | [地图元素](./map-elements.md)                | 查看 Lane、Junction、Signal、Crosswalk 等元素的用途            |
| **拓扑 / Topology**      | [拓扑总览](./topology.md)                    | 理解 predecessor、successor、neighbor、self_reverse 的派生逻辑 |
|                          | [拓扑与路口](./topology-and-junctions.md)    | 处理路口多边形、车道端点、Junction 与 PNC Junction             |
| **导入导出 / IO**        | [导入概览](./import.md)                      | 选择 `.bin`、`.txt`、`.pb.txt` 文件并完成首次导入              |
|                          | [导入深入](./importing.md)                   | 理解投影补全、header 保留、类型恢复和导入失败排查              |
|                          | [导出概览](./export.md)                      | 保存 base_map 二进制或文本格式，并理解文件命名规则             |
|                          | [导出深入](./exporting.md)                   | 了解导出前的拓扑、Overlap、header 和 protobuf 处理             |
| **快捷键 / Keys**        | [快捷键参考](./shortcuts.md)                 | 查找全部快捷键、平台映射和冲突处理                             |
|                          | [跨平台映射](./keyboard-shortcuts.md)        | 从 Photoshop、QGIS、VS Code 等工具迁移操作习惯                 |
| **故障排查**             | [故障排查](./troubleshooting.md)             | 定位 Worker、投影、撤销、许可证、导入导出和桌面包问题          |

## 学习路径 / Learning Path

### 路径 A：从零开始构建一张高精地图 (≈ 2 小时)

```mermaid
flowchart LR
  A[Getting Started] --> B[安装与激活]
  B --> C[绘制车道<br/>Drawing Lanes]
  C --> D[设置宽度/类型<br/>Inspector]
  D --> E[创建路口<br/>Junctions]
  E --> F[导出 base_map.bin]
  F --> G[在 Apollo 中验证]
```

| 步骤          | 文档                                                | 预计耗时 |
| ------------- | --------------------------------------------------- | -------- |
| 1. 启动       | [Getting Started](./getting-started.md)             | 5 min    |
| 2. 激活许可证 | [License Activation](./license-activation.md)       | 5 min    |
| 3. 学习元素   | [Map Elements](./map-elements.md)                   | 15 min   |
| 4. 绘制       | [Drawing Lanes](./drawing-lanes.md)                 | 30 min   |
| 5. 编辑属性   | [Inspector](./inspector.md)                         | 20 min   |
| 6. 拓扑       | [Topology](./topology.md)                           | 20 min   |
| 7. 导出       | [Export](./export.md) → [Exporting](./exporting.md) | 15 min   |

### 路径 B：在已有地图上做局部修改 (≈ 30 分钟)

1. [Import](./import.md) → [Importing](./importing.md) — 把现有 `base_map.bin` 拖入。
2. 用 [Layer Tree](./layer-tree.md) + [Search Panel](./activity-bar-and-panels.md#search) 定位目标实体。
3. 用 [Editing & Snapping](./editing-and-snapping.md) 修改控制点。
4. 用 [Inspector](./inspector.md) 校正字段。
5. [Export](./export.md) 保留原 header，并强制重算 overlap。

### 路径 C：作为 QA / 路测验车员只读浏览 (≈ 10 分钟)

只需熟悉 [MenuBar & ToolStrip](./menubar-and-toolstrip.md)、[Activity Bar & Panels](./activity-bar-and-panels.md) 与 [Command Palette](./command-palette.md) 即可。试用版（`trial`）状态足以读图，不需要激活码。

## 配置存储位置一览 / Persistence Map

下表汇总每篇文档涉及的持久化键，便于在 `localStorage` 损坏或迁移机器时一次性清理。所有键都带 `apollo-map-studio:` 前缀，由 `src/store/settingsStore.ts` 与 `WorkspaceLayout/dockviewLayout.ts` 写入。

| 键 / Key                                          | 写入位置                            | 类型   | 说明                       |
| ------------------------------------------------- | ----------------------------------- | ------ | -------------------------- |
| `apollo-map-studio:historyLimit`                  | `settingsStore.setHistoryLimit`     | number | zundo 撤销栈深度           |
| `apollo-map-studio:mapCenterLng` / `mapCenterLat` | `settingsStore.setMapCenter`        | number | 初始 MapLibre 经纬度中心   |
| `apollo-map-studio:mapZoom`                       | `settingsStore.setMapZoom`          | number | 初始缩放级别               |
| `apollo-map-studio:laneHalfWidth`                 | `settingsStore.setLaneHalfWidth`    | number | 默认 lane 半宽 (m)         |
| `apollo-map-studio:laneArrowSpacing`              | `settingsStore.setLaneArrowSpacing` | number | 箭头符号间距 (px)          |
| `apollo-map-studio:layout:drawing`                | `WorkspaceLayout/dockviewLayout.ts` | JSON   | 绘图模式 dockview 布局快照 |
| `apollo-map-studio:layout:scene`                  | 同上                                | JSON   | 场景模式布局快照           |

::: warning 桌面端许可证 (Desktop license)
桌面端 (Electron) 还会在用户数据目录下写入两个文件：`license.json` 与 `machine.bind`。激活信息**不会**进入 `localStorage`。详情见 [License Activation](./license-activation.md)。
:::

## 设计原则 / Design Principles

本节摘自项目 [DESIGN.md](https://github.com/apollo-map-studio/apollo-map-studio/blob/main/DESIGN.md)，是理解一切交互行为的前提：

1. **参数化优先 (Parametric first)** — 控制点、宽度、转弯类型才是真相；GeoJSON 是渲染中间产物。
2. **冷热分离 (Cold/hot split)** — 已落盘的 entities 走 worker 编译；正在拖拽的几何走主线程 setData。
3. **FSM 单一控制器** — 一切鼠标/键盘事件先经过 `editorMachine`，再被分发到具体行为；杜绝事件冲突。
4. **Anti-corruption 适配 (R2)** — UI 层永远不直接 import `apollo.proto`，都走 `src/lib/entityOps.ts`。

## 相关文档 / See also

- [Architecture](/architecture/) — 五层架构、FSM、worker、状态管理
- [Design](/design/) — 视觉规范、ams-\* 设计令牌、字体
- [Reference](/reference/) — 类型 / 函数 / 事件协议级别的 API
- [Changelog](https://github.com/apollo-map-studio/apollo-map-studio/blob/main/CHANGELOG.md) — 版本历史

## 文档使用建议 / How to Use These Docs

指南按用户任务组织，而不是按源码目录组织。第一次使用时建议顺着“学习路径”阅读；遇到具体问题时直接从站内搜索或上方地图跳转。

| 场景                 | 建议做法                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| 不确定某个按钮作用   | 先看 [菜单栏与工具条](./menubar-and-toolstrip.md)，再看对应面板页             |
| 导入后地图位置异常   | 看 [坐标系与投影](./coordinate-system.md) 和 [故障排查](./troubleshooting.md) |
| 编辑后拓扑不符合预期 | 看 [拓扑总览](./topology.md) 与 [拓扑与路口](./topology-and-junctions.md)     |
| 准备交付 Apollo      | 先看 [导出概览](./export.md)，再看 [导出深入](./exporting.md)                 |

## 双语文档 / Bilingual Docs

中文站点位于 `/`，英文站点位于 `/en/`。两套文档保持相同的信息结构，但会按各自语言习惯调整标题和表达方式，不要求逐句对齐。

| 入口                 | 说明                                             |
| -------------------- | ------------------------------------------------ |
| [中文首页](/)        | 面向中文读者的默认入口                           |
| [English Home](/en/) | English documentation root                       |
| 顶部语言切换         | 在同一主题下切换中英文站点                       |
| 相对链接             | 多数页面使用同目录相对链接，便于在当前语言内跳转 |

## 反馈渠道 / Feedback Channels

| 类型              | 渠道                                |
| ----------------- | ----------------------------------- |
| 文档错误 (内容错) | GitHub Issue with `docs:bug`        |
| 文档建议 (新章节) | GitHub Discussion                   |
| 代码 bug          | GitHub Issue with `bug`             |
| 安全问题          | 私信 maintainer                     |
| 商务合作          | `regulatory.whitefish.gdns@mask.me` |

## VitePress 站点结构 / VitePress Layout

```
docs/
├── .vitepress/
│   └── config.ts            ← sidebar / nav / locales 配置
├── architecture/            ← 架构层文档（5 层 / FSM / worker）
├── design/                  ← 视觉规范
├── guide/                   ← 中文用户指南（本目录）
├── en/
│   ├── architecture/
│   ├── design/
│   ├── guide/               ← 英文用户指南
│   └── reference/
└── reference/               ← 中文 API 参考
```

`vitepress build` 输出到 `docs/.vitepress/dist`；CI 在 `.github/workflows/docs.yml` 中部署到 GitHub Pages。

## 文档仓库别名 / Doc Aliases

VitePress 在 markdown 内允许：

| 形式                  | 解析                         |
| --------------------- | ---------------------------- |
| `/architecture/`      | `docs/architecture/index.md` |
| `./inspector.md`      | 当前目录的 inspector.md      |
| `../inspector.md`     | 上级目录                     |
| `text -> locale/path` | 仅当前 locale 内有效         |

::: warning 跨 locale 链接
切换到英文版时 vitepress 不会自动重写跨 locale 链接。如需指向特定语言，写绝对路径 `/en/guide/inspector` 或 `/guide/inspector`。
:::

## 文档贡献 / Contributing Docs

新增或修改指南时，请优先从读者任务出发：先说明场景，再给步骤，最后补充字段含义和排错线索。需要引用源码时，保持简短，只把它作为验证入口，不要把页面写成源码清单。

1. 在中文和英文目录中更新同名页面。
2. 在 `docs/.vitepress/config.ts` 中补齐侧边栏入口。
3. 用 `pnpm docs:dev` 预览页面结构。
4. 用 `pnpm docs:build` 检查站点是否可构建。

## 字典 / Glossary（高频术语）

| 术语            | 含义                                               |
| --------------- | -------------------------------------------------- |
| FSM             | 有限状态机，本项目特指 `editorMachine`             |
| zundo           | Zustand 的 undo middleware                         |
| Action Registry | 单一 ActionDef 数据源，驱动 menu/strip/palette/键  |
| Cold layer      | 已落盘 entities 的 GeoJSON 渲染图层（worker 编译） |
| Hot layer       | 实时绘制中的临时几何图层（主线程 setData）         |
| ENU             | East-North-Up，Apollo 内部 2D 坐标                 |
| WGS84           | 经纬度（地球表面）                                 |
| PROJ.4          | 投影字符串规范                                     |
| Overlap         | 多个实体相交的约束 entity                          |

## 起步快走 / Quickstart

如果你只看一页就够，把这页的下三步做完即可入门：

1. `pnpm dev` 跑起来。
2. `File → Import Apollo Map...` 选一份 `.bin`。
3. 点一条 lane → 在右侧 Inspector 改 speed limit → `⌘S` 导出。

任何不顺利，回到 [Troubleshooting](./troubleshooting.md) 第 1 节。

## 兼容性 / Compatibility Matrix

| 模块                | 最小版本                  |
| ------------------- | ------------------------- |
| Chrome              | 130                       |
| Edge                | 130                       |
| Firefox             | 130                       |
| Safari              | 18                        |
| Electron            | 41                        |
| Apollo HD-map proto | 1.x（与 Apollo 9.0 兼容） |
| 推荐节点版本        | Node 22 LTS               |
| 推荐 pnpm           | 9.x                       |

## 命名规范 / Naming

- 文件名小写 + 短横线：`menubar-and-toolstrip.md`
- 标题双语：`# 菜单栏与工具条 / MenuBar & ToolStrip`
- Section 标题英文优先（便于跨 locale grep）
- 表格列尽可能英文（`Symptom / Cause / Fix`）
