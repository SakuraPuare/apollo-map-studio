# 快捷键

当前快捷键来自 `src/core/actions/registry/definitions.ts` 和地图事件路由。Action Registry 中的显示文本使用 macOS 符号；非 macOS 平台会在 UI 中转换为 `Ctrl+` / `Shift+` / `Alt+` 形式。底层匹配同时接受 `Ctrl` 和 `Meta`。

## 全局动作

| 快捷键     | Action          | 说明                                         |
| ---------- | --------------- | -------------------------------------------- |
| `Ctrl/⌘+K` | Command Palette | 打开命令面板；再次按可切换                   |
| `Escape`   | Close / Cancel  | 关闭命令面板；地图侧还会取消绘制、拖拽或连接 |
| `Ctrl/⌘+,` | Settings        | 打开 Settings 弹窗                           |

## 文件动作

| 快捷键           | Action                   | 说明                         |
| ---------------- | ------------------------ | ---------------------------- |
| 无               | Import Apollo Map...     | 通过 File 菜单或命令面板导入 |
| `Ctrl/⌘+S`       | Export Apollo Map (.bin) | 导出 binary protobuf         |
| `Ctrl/⌘+Shift+S` | Export Apollo Map (.txt) | 导出 text protobuf           |

这些导出快捷键是 global keybinding，即使焦点在输入框中也会触发。浏览器默认保存页面会被阻止。

## 编辑动作

| 快捷键           | Action           | 说明                                      |
| ---------------- | ---------------- | ----------------------------------------- |
| `Ctrl/⌘+Z`       | Undo             | 先向 FSM 发送 `CANCEL`，再执行 zundo undo |
| `Ctrl/⌘+Shift+Z` | Redo             | 先向 FSM 发送 `CANCEL`，再执行 zundo redo |
| `Delete`         | Delete Selection | 删除选中实体或可删除控制点                |
| `Backspace`      | Delete Selection | 地图事件路由中与 Delete 同义              |
| `C`              | Connect Lanes    | 切换两车道连接模式                        |

当前没有 `Ctrl+Y` redo 绑定。

## 模式与绘制工具

| 快捷键 | Action         | 说明                                           |
| ------ | -------------- | ---------------------------------------------- |
| `H`    | Default (Pan)  | 取消绘制/选择/连接，回到空闲默认模式           |
| `P`    | Draw Polyline  | FSM 支持的基础绘制工具；不等于 Apollo 车道工具 |
| `B`    | Draw Bezier    | Bezier 绘制工具                                |
| `A`    | Draw Arc       | Arc 绘制工具                                   |
| `R`    | Draw Rectangle | 旋转矩形绘制工具                               |
| `G`    | Draw Polygon   | Polygon 绘制工具                               |

注意：工具快捷键只选择绘制工具。要创建 Apollo 元素，通常应先在工具条选择元素图标，让 FSM 的 `activeElement` 带上对应 `MapElementType`。例如，画车道应先选车道元素，再用 `B` 或 `A`。

`G` 同时有两个 action：非全局的 Draw Polygon 和全局的 Toggle Grid (`Ctrl/⌘+G`)。普通 `G` 是绘制 polygon，带 Ctrl/⌘ 时是切换 Grid。

## View 动作

| 快捷键     | Action       | 说明                       |
| ---------- | ------------ | -------------------------- |
| `Ctrl/⌘+G` | Toggle Grid  | 切换网格显示               |
| 无         | Toggle Snap  | 工具条或 View 菜单切换吸附 |
| 无         | Reset Layout | 重置 Dockview 布局         |

## 地图绘制键盘行为

| 按键                   | 状态       | 行为                    |
| ---------------------- | ---------- | ----------------------- |
| `Enter`                | 绘制中     | 满足最少点数时提交      |
| `Escape`               | 绘制中     | 取消绘制并清理上下文    |
| `Escape`               | 连接模式   | 退出连接模式            |
| `Escape`               | 拖拽控制点 | 取消拖拽并回到 selected |
| `Delete` / `Backspace` | selected   | 删除控制点或删除实体    |

## 鼠标交互

| 交互                     | 行为                                    |
| ------------------------ | --------------------------------------- |
| 点击实体                 | 默认/选中状态下选择实体                 |
| 点击空白                 | 已选中状态下取消选择                    |
| 拖动地图                 | 默认 MapLibre 平移                      |
| 滚轮                     | MapLibre 缩放                           |
| 双击                     | 绘制状态下提交；MapLibre 双击缩放已禁用 |
| 拖动 hot point           | 编辑实体控制点                          |
| 拖动 hot fill            | 整体移动支持中心拖拽的实体              |
| Alt + 点击 Bezier vertex | 尖角/平滑切换                           |
| Alt + 拖动 Bezier handle | 不镜像另一侧控制柄                      |

## 输入框中的快捷键

Action Registry 会跳过非 global 快捷键，如果焦点在 `input`、`textarea` 或 `select` 中。例如在 Inspector 输入 speed limit 时，普通 `B`、`A`、`C` 不会抢焦点。标记为 global 的快捷键仍然生效，例如导出、撤销、重做、Toggle Grid。

## 平台显示

Registry 内部写法：

- `⌘S`
- `⇧⌘S`
- `⌘Z`
- `⇧⌘Z`
- `⌘K`

在非 macOS 平台显示为：

- `Ctrl+S`
- `Shift+Ctrl+S`
- `Ctrl+Z`
- `Shift+Ctrl+Z`
- `Ctrl+K`

实际匹配时 `Ctrl` 和 `Meta` 都算控制修饰键。
