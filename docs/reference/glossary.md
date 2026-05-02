---
title: 术语表
description: Apollo Map Studio 项目专有名词、Apollo HD 地图概念、技术栈术语合集，覆盖 80+ 条目。
---

# 术语表

本术语表收录 Apollo Map Studio 工程语境下的全部专有名词。它面向三类读者：

- 第一次接触本项目的新工程师，希望在阅读架构文档前快速建立词汇基础。
- Apollo 协议对接同学，关心字段、消息、单位的精确含义。
- UI/设计同学，希望理解视觉与交互术语。

::: tip 索引规则

- 字母排序：英文术语 / 拼音不混排，统一按术语英文拼写排序。
- 缩略语优先解释：缩略语条目下面会带括号给出全称（如 RBush(R-Tree based Bulk Spatial index)）。
- **加粗**的标识符表示项目代码中的真实符号或文件路径。
  :::

## A

### **action registry**

位于 `src/core/actions/registry.ts`。所有用户可执行动作（菜单项、快捷键、命令面板项、工具按钮）的单一事实来源。每个 `ActionDef` 定义 id、label、shortcut、icon、category、menu、menuOrder、inCommandPalette、drawTool 等字段。新增功能只需要修改这个文件。

### **active state**

FSM 当前所处的状态节点，例如 `idle`、`drawPolyline`、`selected`、`editingPoint`。在 `editorMachine.ts` 中作为 source of truth，UI 对应高亮工具按钮、改变 cursor、变更 hot layer 渲染。

### **anchor**

绘制贝塞尔/圆弧/Catmull-Rom 曲线时记录的控制点。在 `LaneEntity._source.anchors` 中持久化为 `BezierAnchorData[]`，使元素被选中后仍可恢复原始控制柄编辑。

### **Anti-corruption Layer（防腐层）**

`src/lib/entityOps.ts`。封装所有「触碰 Apollo proto 内部结构」的操作，让上层只通过 proto-agnostic 的 `MapEntity` 操作。proto v2 升级时只改 entityOps，不会涟漪到 UI。详见 [Anti-Corruption Layer](/architecture/anti-corruption-layer)。

### **AppImage / dmg / deb / exe**

Electron 桌面打包产物格式，分别对应 Linux / macOS / Debian 系 Linux / Windows。CI 矩阵在 `desktop-package` job 输出。详见 [CI Pipeline](/reference/ci-pipeline)。

### **Apollo HD Map**

百度 Apollo 自动驾驶项目的高精度地图协议。本项目直接读写 Apollo proto2 二进制格式（`.bin`），不依赖中间格式。

### **Apollo Map Studio**

本项目名称。Web + Electron 形态的 Apollo HD Map 编辑器。

## B

### **base_map**

Apollo 高精地图的基础形态文件，保存所有车道、信号、Junction、Overlap 等元素。文件名通常为 `base_map.bin`。Sim Map 与 Routing Map 都从 base_map 派生。

### **bench-budgets**

`scripts/bench-budgets.json`。CI 用来卡 p99 性能预算的基准表。每条 entry 是「bench 名 → p99 上限毫秒数」。详见 [Benchmark Budgets](/reference/benchmark-budgets)。

### **Bezier**

贝塞尔曲线绘制工具。FSM 状态名 `drawBezier`，对应 cubic Bézier 控制点采样。anchor 数据存入 `_source.anchors`。

### **bezier anchor**

贝塞尔锚点，包含起点 / 控制点 / 终点等 GeoPoint。结构定义在 `src/types/entities.ts` 的 `BezierAnchorData`。

### **boundary type**

车道边界类型，对齐 `LaneBoundaryType.Type` 枚举：`UNKNOWN / DOTTED_YELLOW / DOTTED_WHITE / SOLID_YELLOW / SOLID_WHITE / DOUBLE_YELLOW / CURB`。详见 [Enum Mappings](/reference/enum-mappings)。

### **buildFeatureCollection**

位于 `src/core/workers/spatial.worker.ts` 的 cold layer 编译入口。把 `Map<id, MapEntity>` 转化为 maplibre 可直接 `setData` 的 GeoJSON FeatureCollection。

## C

### **Catmull-Rom**

一种插值样条曲线，FSM 状态 `drawCatmullRom` 用于平滑地通过控制点。

### **clearArea**

Apollo 元素，禁止停车区。proto 定义见 `map_msgs/map_clear_area.proto`，类型定义见 `ClearAreaEntity`。

### **Cold Layer（冷层）**

渲染管线两层中负责「已提交、量大、不每帧变」的几何要素。由 `useColdLayer` 管理，经 RAF 合并后送入 `spatial.worker.ts` 编译，最终作为单个 GeoJSONSource 输入 maplibre。详见 [冷热分层](/architecture/cold-hot-layers)。

### **CommandPalette（命令面板）**

全局唤起的命令搜索窗（Ctrl/Cmd+K），从 `getCommandPaletteActions()` 拉取动作列表，按 id 派发。

### **CONFIRM / DOUBLE_CLICK**

FSM 终止当前绘制状态、写入 `mapStore` 的两个事件。`useDrawCommit` 在状态退到 `idle` 时调用 `addEntity`。

### **CRS（Coordinate Reference System）**

坐标参考系统。本项目通过 `proj4` 在 WGS84 / UTM / 自定义本地系之间切换，配合 `MapProjection.proj` 字段。

### **Curve（曲线）**

Apollo 几何基础类型，由若干 `CurveSegment` 组成。proto 定义见 `map_msgs/map_geometry.proto`，TS 定义见 `src/types/apollo.ts:Curve`。

### **CurveSegment**

单段曲线。当前实现只支持 `lineSegment` oneof，其余 `arc`、`spiral` 类型预留。

## D

### **Decoration（装饰）**

车道边界经 `decorateBoundary` 拼接 / 圆角化处理后产生的辅助 features。是 `buildFeatureCollection` 中最重的部分（每条 lane ~3ms 全量重建），Phase E 为此引入了 `decorationCache`。

### **decorationCache**

`spatial.worker.ts` 中按 lane id 维护的装饰缓存：`Map<lane_id, Feature[]>`。INCREMENTAL 消息只 invalidate「受影响集」。

### **Dockview**

本项目使用的可拖拽多面板布局库（Dockview 5），为 Photoshop 风格工作台提供窗格抓取与重排能力。

### **DOM event router**

`src/hooks/useMapEventRouter.ts`。把 maplibre canvas 的原生 mouse/keyboard 事件路由给 FSM，处理 dblclick 去重（`isDuplicateInput`）等问题。

### **drawTool**

`ActionDef.drawTool` 字段，标识动作绑定的绘制工具（如 `polyline`、`bezier`、`arc`）。

## E

### **editorMachine**

FSM 主体，位于 `src/core/fsm/editorMachine.ts`，使用 XState 5。当前文件挂 `// @ts-nocheck`，等 XState 5 的泛型推断 bug 修复后再移除。

### **EditorMeta**

proto2 自定义字段（field 1000），编辑器元数据，承载 `geometry_kind` 等编辑器视角才需要的信息。proto 定义见 `editor/editor_meta.proto`。

### **Electron**

桌面打包运行时。本项目使用 Electron 41，主进程负责 license 校验、文件 I/O、菜单原生化；renderer 加载 Web 编辑器。

### **entityOps**

见 [Anti-corruption Layer](#anti-corruption-layer-防腐层)。同义词。

### **enumLabels**

位于 `src/lib/enumLabels.ts`。i18n 枚举抓手，给所有 proto 枚举值提供人类可读 label，是未来 i18n 的唯一接入点。详见 [Enum Mappings](/reference/enum-mappings)。

## F

### **FSM（Finite State Machine，有限状态机）**

本项目使用 XState 5 实现的编辑器状态控制器。所有 mouse/keyboard 事件路由到 FSM，FSM 决定接下来做什么（绘制、选中、编辑控制点）。详见 [FSM 设计](/architecture/fsm-design)。

### **featureCache**

`spatial.worker.ts` 中按 entity id 维护的「已编译 features」缓存。比 `decorationCache` 粒度更细。

## G

### **GeoJSON**

本项目使用的几何中间格式。MapLibre 直接消费 GeoJSON，cold layer worker 输出 GeoJSON FeatureCollection。

### **GeoJSONSource**

maplibre 的 source 类型。Cold layer 与 hot layer 各自挂一个 GeoJSONSource。

### **geo distance**

`spatial.worker.ts` 在 `HIT_TEST` 中使用 Mercator 修正过的地理距离，避免低纬度 / 高纬度时长度失真。

### **getEnumLabel**

`src/lib/enumLabels.ts:173`。`getEnumLabel(category, value)`，是 UI 取人类可读 label 的唯一入口。

### **getMenuActions**

action registry 暴露的查询函数，按 menu 字段筛选动作给菜单栏。

## H

### **Hot Layer（热层）**

渲染管线两层中负责「正在编辑、每帧重算」的几何要素。由 `useHotLayer` 管理，不走 worker。详见 [冷热分层](/architecture/cold-hot-layers)。

### **HD Map**

High-Definition Map，高精度地图。Apollo 协议是其中一种实现。

### **husky**

Git hooks 工具，本地 pre-commit 触发 `lint-staged`（eslint --fix + prettier --write）。

## I

### **Icon registry**

`src/components/ui/icon-registry.ts`。把 ActionDef.icon 字符串解析为 React 组件。所有 icon 都通过这层转换，避免散落 import。

### **idle（FSM）**

FSM 默认状态。等待用户开始绘制 / 选中 / 编辑。

### **immer**

不可变更新库。Zustand store 的 `updateEntity` 等写操作内部使用 immer 产生新引用，配合 zundo 自动做 history 快照。

### **import.proto**

泛指 `src/proto/` 下所有 `.proto` 文件。本项目使用 protobufjs 在运行时加载这些文件，不预编译为 .ts。

### **INCREMENTAL（worker message）**

`spatial.worker.ts` 协议中的增量更新消息。只重新装饰受影响的 lane，避免全量重建。

### **isDuplicateInput**

`useMapEventRouter` 内部 helper，去重 dblclick + click（防止 click 先于 dblclick 触发误识别）。

## J

### **JetBrains Mono**

本项目等宽字体选用。详见 [Design Tokens](/reference/design-tokens)。

### **Junction（路口）**

Apollo 元素，多车道交叉处。proto 定义见 `map_msgs/map_junction.proto`，类型 `JunctionEntity`。

### **Junction Graph**

`src/core/workers/laneJunctionGraph.ts`。表示 lane 端点之间的依赖关系。INCREMENTAL 计算「受影响集」时通过 `getDependents(id)` 在 O(K) 内完成。

### **junction stitching（路口缝合）**

`src/core/geometry/laneJunctions.ts`。把进出 junction 的 lane 端点对齐拼接，产生一致的 join 值。每个 junction ~0.01ms，幂等。

## K

### **keybinding**

`ActionDef.keybinding` 字段。形如 `Mod+K`，由 `matchesKeybinding` helper 解析并匹配 `KeyboardEvent`。

## L

### **Lane（车道）**

Apollo 核心元素。本项目主体绘制对象。proto 定义见 `map_msgs/map_lane.proto`，类型 `LaneEntity`。包含中心曲线、左右边界、拓扑邻居、宽度采样、override 列表。

### **LaneBoundary**

车道边界对象，包含 curve / length / virtual / boundaryType[] 字段。

### **LaneSampleAssociation**

`{ s, width }` 对，用来刻画车道在某个 s 位置的局部宽度。

### **license-gen**

`tools/license-gen/`，离线激活码签发工具。生成 ed25519 keypair，签名机器码绑定的激活信息。

### **lint-staged**

配合 husky 的工具，只对暂存区的文件跑 lint。

## M

### **MapEntity**

本项目对 ApolloEntity 的薄包装，添加 `_source` / `_userOverrides` 等编辑器字段。所有写操作走 `entityOps`。

### **MapLibre GL（5）**

本项目地图渲染底座。纯 WebGL，剥离一切业务逻辑。

### **MapProjection**

Apollo `Projection` 消息的 TS 形态。仅含 `proj` 字符串，被 proj4 消费。

### **map.proto**

Apollo 顶层 `Map` 消息的 schema 文件 `src/proto/map_msgs/map.proto`。

### **menubar**

`src/components/layout/MenuBar`。Photoshop 风格的顶部菜单。从 action registry 拉取菜单条目。

### **MGRS（Military Grid Reference System）**

军用坐标参考系统，UTM 之上的网格化字符串编码方式。状态栏可选展示。

### **Mod 键**

跨平台快捷键修饰：macOS 上是 ⌘（Command），其它平台是 Ctrl。`matchesKeybinding` 会自动识别。

## N

### **nanoid**

ID 生成器，用于 `lane_V1StGp4kQz3R` 之类的稳定 ID。

### **neighbor lane**

Lane 拓扑里的邻车道：`leftNeighborForwardIds` / `rightNeighborForwardIds` / `leftNeighborReverseIds` / `rightNeighborReverseIds`。

## O

### **Overlap（重叠）**

Apollo 元素，描述 lane / signal / junction / crosswalk 等之间的重叠关系。proto 定义见 `map_msgs/map_overlap.proto`，类型 `OverlapEntity`。

### **overlap derivation（重叠派生）**

工程实现见 `recomputeOverlapsAsync`。Worker 在快照上推导 overlap 集合，主线程 patch apply。

## P

### **PointENU**

Apollo 几何基础点类型。东 / 北 / 上三轴，单位米。本项目用 `GeoPoint` 别名表达 WGS84 经纬度。

### **predecessor / successor / neighbor**

Lane 拓扑三类引用，分别表示来车道 / 去车道 / 同向逆向邻车道。

### **proj4**

PROJ.4 字符串解析器，处理 `MapProjection.proj` 中的 `+proj=tmerc ...`。

### **protobufjs**

本项目使用的 proto 运行时库，不预编译。proto 文件原文随包发布。

### **proto2 optional**

proto2 中 `optional` 字段在缺失时不写入 wire；本项目对此严格区分 `undefined` 与 `0`，防止 round-trip 注水。

## R

### **RAF（requestAnimationFrame）**

浏览器渲染节拍。`useColdLayer` 把多次 entity 变化合并到下一个 RAF 再 setData。

### **RBush**

基于 R-Tree 的二维空间索引库。`spatial.worker.ts` 用它实现毫秒级 hitTest。

### **Reconcile（协调）**

对照拓扑重新归一化 overlap / lane neighbor，常用于导入后或大规模编辑后。

### **RoadBoundary**

Road 元素的多边形边界，含 outer polygon 与 holes。

### **Routing Map**

Apollo 路由场景使用的派生地图，关注 lane 拓扑与拓扑约束。

### **RSU（Road Side Unit）**

路侧单元。Apollo 中通过 `RSU` 消息记录 ID / junction / overlap。

## S

### **schema-only fields**

proto 中存在、但 TS 类型未声明的字段，protobufjs round-trip 时会保留 unknown bytes。`editor_meta` 字段就是利用这一点放编辑器扩展。

### **Sim Map**

Apollo 仿真器使用的派生地图，关注与 Cyber simulator 兼容的字段子集。

### **shadcn/ui**

本项目使用的组件库。基于 Radix UI + Tailwind 4 的可拷贝组件。详见 [Design Tokens](/reference/design-tokens)。

### **Signal**

Apollo 信号灯元素。proto 定义见 `map_msgs/map_signal.proto`。

### **SourceDrawInfo**

`LaneEntity._source` 等字段类型，记录原始绘制工具与锚点，便于重新进入编辑。

### **spatial worker**

`src/core/workers/spatial.worker.ts`。Cold layer 编译、RBush 维护、hit test 都在这里。

### **status bar**

工作台底部状态条。展示 cursor lng/lat、grid/snap toggle、当前 zoom 等。

### **Syne**

本项目品牌字体，用于标题。详见 [Design Tokens](/reference/design-tokens)。

## T

### **temporal store**

zundo 注入到 Zustand 的副 store，承载 `undo` / `redo` / `clear` 等历史 API。

### **type discriminator**

`ApolloEntity` 联合类型上的 `entityType` 字段，用来 narrowing。

## U

### **undo CANCEL closure**

`useActionDispatcher.ts:76-82` 实现的细节：undo 之前先给 FSM 派 `CANCEL`，避免绘制中途 Ctrl+Z 把 FSM 与 mapStore 解耦。R1 闭环。

### **UTM（Universal Transverse Mercator）**

通用横轴墨卡托投影。Apollo 默认使用本地 UTM 区。

### **uiStore**

Zustand store，存 grid/snap toggle、cursorLngLat、layerStates、currentZoom。**不入** undo history。

## V

### **VitePress**

本项目文档栈，VitePress 1.x。

### **VITEPRESS_BASE**

GitHub Pages 子路径部署用的环境变量，由 `docs-preview.yml` 注入为 `/<repo-name>/`。

## W

### **WGS84**

World Geodetic System 1984。本项目坐标默认使用 WGS84 经纬度，PROJ.4 把它和 UTM 互换。

### **Web Worker**

浏览器后台线程。`spatial.worker.ts`、`apollo.worker.ts` 都跑在 worker 中。

### **worker bridge**

主线程到 worker 的代理类，统一封装 postMessage 协议、Promise 化响应、生命周期管理。详见 [Worker 协议](/architecture/worker-protocol)。

## X

### **XState 5**

本项目 FSM 库。当前因泛型推断 bug 在 `editorMachine.ts` 临时挂 `// @ts-nocheck`。

## Y

### **YieldSign**

Apollo 让行牌元素。proto 定义见 `map_msgs/map_yield_sign.proto`。

## Z

### **Zustand**

本项目状态管理库。配合 `immer` middleware 处理 immutable update，配合 `zundo` 处理 undo/redo。

### **zundo**

Zustand 的 undo middleware。本项目通过 `partialize: { entities }` 仅快照实体表，UI 偏好不入历史。

### **zod**

Schema 校验库。Inspector 表单使用 zod schema 校验输入。

## 跨章节链接

- [架构总览](/architecture/overview)
- [Reference 总览](/reference/)
- [Apollo Types](/reference/apollo-types)
- [Enum Mappings](/reference/enum-mappings)
- [Proto Schema](/reference/proto-schema)
- [Benchmark Budgets](/reference/benchmark-budgets)
- [CI Pipeline](/reference/ci-pipeline)
- [Color Palette](/reference/color-palette)
- [Design Tokens](/reference/design-tokens)
