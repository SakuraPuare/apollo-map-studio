---
layout: home

hero:
  name: Apollo Map Studio
  text: Apollo HD 地图编辑器
  tagline: 面向 Apollo 自动驾驶平台 base_map 的导入、可视化、几何编辑、拓扑派生、Overlap 重算与二进制 / 文本 protobuf 导出工具，支持 Web 与 Electron 桌面双端。
  image:
    src: /logo.svg
    alt: Apollo Map Studio
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 导入第一张地图
      link: /guide/import
    - theme: alt
      text: 架构总览
      link: /architecture/overview
    # - theme: alt
    #   text: VitePress 展示
    #   link: /reference/vitepress-showcase
    - theme: alt
      text: GitHub
      link: https://github.com/SakuraPuare/apollo-map-studio

features:
  - icon: 🗺️
    title: 完整的 Apollo 元素覆盖
    details: 支持 Lane、Junction、PNC Junction、ParkingSpace、Crosswalk、Signal、StopSign、SpeedBump、YieldSign、ClearArea、Boundary 与 Region 等全量 base_map 实体的可视化编辑。

  - icon: ✏️
    title: 强大的绘制工具集
    details: 折线、Catmull-Rom、Bezier、圆弧、旋转矩形、多边形等几何工具一应俱全；点击绘制、双击/回车提交、控制点拖拽、Alt 键滑动切换、中心拖拽、多目标对齐与吸附无缝衔接。

  - icon: 🔗
    title: 拓扑自动派生
    details: 基于车道端点重合、几何相邻、反向孪生与 junction 多边形相交规则，自动重算 predecessor、successor、neighbor、self_reverse 与 junction_id；增量更新只重算受影响子集。

  - icon: 🧬
    title: Overlap 关系重算
    details: 导入、编辑与导出阶段按几何事实维护 overlap_id；lane 与 crosswalk 的 region overlap 支持在 Inspector 中钉住，避免误删。

  - icon: 📦
    title: Apollo 往返 IO
    details: 支持 .bin / .txt / .pb.txt 三种 protobuf 编码导入导出，保留导入 map 的 header、投影信息与未直接编辑字段，确保跨工具往返无损。

  - icon: 🪟
    title: Photoshop 风格工作台
    details: 由菜单栏、工具条、Activity Bar、可重置 Dockview 布局、Outline、Layer Tree、Search、Inspector、Timeline 与状态栏构成；面板可任意拖拽、停靠与浮动。

  - icon: ⚡
    title: 冷热分层渲染
    details: Cold Layer 在 Web Worker 中维护空间索引、装饰缓存与 RBush；Hot Layer 在主线程按帧重算实时绘制预览。Phase E 增量装饰只重渲受影响 lane。

  - icon: 🖥️
    title: Web 与桌面双形态
    details: 开发期使用 Vite Dev Server 的 Web 编辑器；通过 Electron 命令一键启动桌面壳，并跨平台打包 Linux AppImage、macOS DMG、Windows NSIS 安装包。

  - icon: 🔑
    title: 离线机器绑定授权
    details: 桌面构建内置离线激活流程，与机器指纹绑定；未处于可编辑授权态时编辑动作被 editableGuard 统一拦截。

  - icon: 🧠
    title: XState 5 有限状态机
    details: editorMachine 是编辑器交互的唯一真理源，覆盖 idle / drawing / editing 等状态，与 useDrawCommit、useActionDispatcher 共同保证 undo/redo 与 mid-draw cancel 的一致性。

  - icon: 🧱
    title: 严格分层与防腐
    details: components → hooks → store → lib → core 单向依赖；entityOps 防腐层屏蔽 Apollo proto v2 升级风险，UI 层只感知抽象的 MapEntity 概念。

  - icon: 🧪
    title: 完整 CI 流水线
    details: typecheck、ESLint、Prettier、Vitest 单测、benchmark + budget guard 一应俱全；pre-commit 通过 husky + lint-staged 强约束，性能预算回归自动拦截。
---

<div class="vp-doc" style="max-width: 1152px; margin: 4rem auto 0; padding: 0 2rem;">

## 文档地图

按你的目标找入口：

| 你想做什么                   | 起点                                                                |
| ---------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- | --- |
| 第一次接触 Apollo Map Studio | [快速开始](/guide/getting-started)                                  |
| 导入一张 Apollo base_map     | [导入地图](/guide/import) → [导入深度](/guide/importing)            |
| 在地图上绘制车道与连接       | [绘制工具](/guide/drawing-tools) → [车道绘制](/guide/drawing-lanes) |
| 理解坐标系与投影             | [坐标系统指南](/guide/coordinate-system)                            |
| 编辑 Inspector 属性          | [Inspector 面板](/guide/inspector)                                  |
| 把地图导出回 Apollo          | [导出概览](/guide/export) → [导出深度](/guide/exporting)            |
| 桌面端激活授权               | [离线激活](/guide/license-activation)                               |
| 二次开发架构与源码           | [架构总览](/architecture/overview)                                  |
| 添加新动作 / 工具 / 元素     | [操作手册](/recipes/adding-a-new-action)                            |
| 贡献代码与 PR                | [开发环境](/contributing/development-setup)                         |
| <!--                         | 检查文档站主题与 Markdown                                           | [VitePress 功能展示](/reference/vitepress-showcase) | --> |

## 关键概念速查

- **base_map** — Apollo HD 地图的源数据格式，本工具的输入与输出基准。
- **MapEntity** — 编辑器内部的统一实体抽象，由 `entityOps` 屏蔽 Apollo proto 细节。
- **Cold / Hot Layer** — 已提交几何（冷）与正在拖动 / 绘制的几何（热）分别用不同管线渲染。
- **FSM** — XState 5 有限状态机 `editorMachine`，是交互的唯一真理源。
- **Junction Graph** — 描述车道端点拓扑依赖的图结构，用于增量装饰重算。
- **Overlap** — 几何上重叠的元素之间的 N : N 引用关系，例如 lane × signal、lane × crosswalk。

## 项目阶段

- **当前版本**：`v1.0.0` — 已发布。
- **License**：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)。
- **English Docs**：[English documentation](/en/) 。
- **变更日志**：[Changelog](/changelog)。

</div>
