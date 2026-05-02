# 快速开始

本页按当前 `master` 重构后的实现说明 Apollo Map Studio 的安装、启动和主界面。当前应用入口很薄：`src/App.tsx` 只渲染 `WorkspaceLayout`；实际工作台由 `src/components/layout/WorkspaceLayout.tsx` 组合菜单栏、授权提示、工具条、Dockview 面板、状态栏、命令面板、设置弹窗、投影选择弹窗和任务进度浮层。

## 环境要求

- Node.js 20+
- pnpm 10+
- 现代浏览器，开发默认地址为 `http://localhost:5173`
- 如果运行桌面版开发命令，需要本机可运行 Electron

## 安装依赖

```bash
git clone https://github.com/SakuraPuare/apollo-map-studio
cd apollo-map-studio
pnpm install
```

## 启动 Web 编辑器

```bash
pnpm dev
```

Vite 启动后打开终端输出的本地地址，默认是：

```text
http://localhost:5173
```

Web 编辑器使用同一套 React 工作台。地图画布由 MapLibre 初始化，默认中心点、缩放、车道默认半宽、车道箭头间距和撤销历史长度从 `localStorage` 中读取；这些值可在 Settings 弹窗中修改。

## 启动 Electron 开发版

```bash
pnpm electron:dev
```

该命令会并行启动 Vite 和 Electron 开发流程：

1. 以 `127.0.0.1:5173` 启动 Vite。
2. 等待 Vite 端口就绪。
3. 构建 Electron main/preload 代码。
4. 打开 Electron 壳，renderer 指向本地 Vite 服务。

## 构建与打包

```bash
pnpm build:web
pnpm build:desktop
pnpm package:linux
pnpm package:mac
pnpm package:win
```

打包产物写入 `release/`。项目也保留 `pnpm package` 用于构建目录形式的 Electron 包。

## 文档与质量检查

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build:web
pnpm docs:build
pnpm test
```

性能基准命令：

```bash
pnpm bench --outputJson bench-results.json
node scripts/check-bench-budget.mjs bench-results.json
```

## 主界面布局

主窗口从上到下分为五个区域：

| 区域            | 当前实现        | 作用                                                                                      |
| --------------- | --------------- | ----------------------------------------------------------------------------------------- |
| 菜单栏          | `MenuBar`       | 从 Action Registry 生成 File、Edit、View 菜单，并显示“绘图/场景”模式切换                  |
| 授权提示        | `LicenseBanner` | 授权临期、过期或被篡改时显示；编辑动作会经过授权守卫                                      |
| 工具条          | `ToolStrip`     | 选择默认模式、连接车道、选择 Apollo 元素、选择绘制工具、打开命令面板、切换 Grid/Snap      |
| Dockview 工作区 | `DockviewReact` | 承载地图、左侧栏、Inspector、Timeline 等可停靠面板                                        |
| 状态栏          | `StatusBar`     | 显示应用模式、FSM 状态、实体数量、导入文件名、lane/road 计数、Grid/Snap、鼠标经纬度和缩放 |

Dockview 布局按应用模式保存；菜单中的 Reset Layout 会清除当前模式的保存布局并重建默认布局。Settings 弹窗中的 Reset Layout to Default 会移除 `ams-layout-v2` 并刷新页面。

## 左侧 Activity Bar

| 页签     | 面板           | 说明                                                                                                            |
| -------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| Explorer | Outline        | 显示地图总实体数、Apollo 顶层类型计数、绘图 primitive 计数、未归属 lane、悬空 junction 引用和导入 header 元数据 |
| Layers   | Layer Tree     | 按 Road、Junction、Lane 等类型组织实体，支持选择、删除、拖拽归属和图层可见/锁定                                 |
| Search   | Search         | 按实体 ID 或 entityType 子串搜索，最多显示 200 条结果                                                           |
| Timeline | Timeline       | 当前是独立时间轴 UI，包含播放、暂停、停止、步进和示例轨道；它不驱动地图实体                                     |
| Settings | Settings modal | 点击后打开全局设置弹窗，然后侧栏回到 Explorer                                                                   |

## 工具条结构

从左到右：

1. Default (Pan)：回到空闲状态，取消当前绘制/选择/连接。
2. Connect Lanes：进入两车道连接模式。
3. Apollo 元素平铺图标：车道、路口、PNC 路口、车位、人行横道、信号灯、停车标志、减速带、让行标志、禁停区、道闸、区域。
4. 当前元素可用绘制工具：随元素变化，例如车道只显示 Bezier 和 Arc，车位显示 Rectangle 和 Polygon。
5. 命令面板入口：按钮上显示 `⌘K`；非 macOS 平台会显示为 `Ctrl+K`。
6. View 槽位：Grid 和 Snap 开关。

## 应用模式

菜单栏右侧有“绘图 / 场景”切换，状态保存在 `uiStore.appMode`。当前代码会用它区分 Dockview 保存布局和状态栏展示；地图编辑主流程仍由 FSM、工具条和地图事件路由控制。文档中凡是绘制、选择、导入、导出步骤，默认都指当前“绘图”模式。

## 设置项

| 设置                    | 范围        | 生效说明                                   |
| ----------------------- | ----------- | ------------------------------------------ |
| History limit           | 10-1000     | 控制 zundo 撤销历史限制                    |
| Map Longitude           | -180 到 180 | 地图初始化中心点经度，提示需要重启生效     |
| Map Latitude            | -90 到 90   | 地图初始化中心点纬度，提示需要重启生效     |
| Map Zoom                | 1-22        | 地图初始化缩放，提示需要重启生效           |
| Default half-width (m)  | 0.5-10      | 新建 lane 时写入左右宽度 sample 的默认半宽 |
| Arrow spacing (px)      | 40-500      | 更新 `cold-lane-arrows` 的 symbol spacing  |
| Reset Layout to Default | -           | 清除保存布局并刷新                         |

## 命令入口

- File 菜单：导入 Apollo Map、导出 `.bin`、导出 `.txt`、打开 Settings。
- Edit 菜单：Undo、Redo、Delete Selection、Connect Lanes。
- View 菜单：Reset Layout、Toggle Grid、Toggle Snap。
- 命令面板：`Ctrl/⌘+K` 打开，可搜索并执行大多数 action。

## 当前数据模型要点

- 地图实体在 `mapStore.entities: Map<string, MapEntity>` 中维护。
- 撤销/重做由 `zundo` 包装 `mapStore` 完成。
- 导入会一次性替换实体集合并清空撤销历史。
- 新增、更新、删除实体会触发 lane topology 和 overlap 的增量重算。
- 导出前会在 IO worker 中再次执行拓扑和 overlap 全量处理。

## 编辑授权注意事项

代码中编辑类 action 和 `mapStore` 写操作都会经过授权守卫。未处于可编辑状态时，添加、更新、删除、选择工具、连接车道等动作可能不会执行；View 类动作如 Reset Layout、Grid、Snap 不属于地图数据编辑。
