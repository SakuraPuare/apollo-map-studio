---
layout: home

hero:
  name: Apollo Map Studio
  text: Apollo HD Map 编辑器
  tagline: 面向 Apollo base_map 的导入、可视化、几何编辑、拓扑派生、重叠关系重算与二进制/文本 protobuf 导出工具。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 导入地图
      link: /guide/import

features:
  - icon: map
    title: Apollo 元素编辑
    details: 支持车道、路口、PNC 路口、车位、人行横道、信号灯、停车标志、减速带、让行标志、禁停区、道闸和区域等编辑器工具条元素。

  - icon: mouse-pointer-click
    title: 直接地图交互
    details: MapLibre 画布负责点击绘制、双击/回车提交、选择、控制点拖拽、Alt 平滑切换、中心拖拽、吸附和两车道连接。

  - icon: waypoints
    title: 拓扑自动派生
    details: 车道端点重合、几何相邻、反向孪生和与 junction 多边形相交会触发 predecessor、successor、neighbor、self_reverse 与 junction_id 重算。

  - icon: combine
    title: Overlap 重算
    details: 导入、编辑和导出路径会按几何事实维护 overlap_id；lane 与 crosswalk 的 region overlap 支持在 Inspector 中钉住。

  - icon: package
    title: Apollo 往返 IO
    details: 可导入 .bin、.txt、.pb.txt，导出 Apollo Map 的 .bin 或 text protobuf，并保留导入 map 的 header、投影和未直接编辑字段。

  - icon: panels-top-left
    title: Dockview 工作台
    details: 菜单栏、工具条、Activity Bar、可重置布局、Outline、Layer Tree、Search、Inspector、Timeline 和状态栏组成当前主界面。

  - icon: monitor-down
    title: Web 与桌面构建
    details: 开发时使用 Vite Web 编辑器，也可通过 Electron 命令启动桌面壳并打包 Linux、macOS、Windows 产物。

  - icon: key
    title: 离线授权
    details: 桌面构建包含本机绑定的离线激活流程；未处于可编辑授权状态时，编辑类动作会被统一拦截。
---
