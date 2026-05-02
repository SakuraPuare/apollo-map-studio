---
title: 导出 Apollo 地图（概览）
description: 导出入口、base_map / sim_map / routing_map 三种产物、二进制 vs 文本 protobuf、文件命名规则、命令面板与快捷键，以及导出失败的常见原因。
---

# 导出 Apollo 地图 / Export

> 导出是把内存中的 `mapStore.entities` 序列化为 Apollo 高精地图协议 (`modules/map/proto/map.proto`) 兼容的 `base_map.bin` 或 `base_map.txt` 文件，可被 Apollo 9.0 / Lumina 等下游工程直接消费。

本页是**入门级概览**，覆盖 UI 入口、产物语义、命名规则与第一层故障排查。如果你想了解管线、坐标重投影、overlap 重算、header 保留等内部细节，请阅读 [Exporting (deep dive)](./exporting.md)。

## 概览 / Overview

| 维度     | 说明                                                              |
| -------- | ----------------------------------------------------------------- |
| 入口     | `File → Export Apollo Map (.bin / .txt)`、命令面板、`⌘S` / `⇧⌘S`  |
| 触发函数 | `exportApolloBin` / `exportApolloText` (`src/io/mapIO.ts:95-141`) |
| 后台执行 | `apolloIOBridge` 把任务投递到 `apolloIO.worker.ts`，主线程不阻塞  |
| 进度提示 | `TaskProgressOverlay`（任务超过 1s 才浮现）                       |
| 文件写出 | `src/io/fileIO.ts` 的 `downloadBlob()` 触发浏览器下载             |
| 文件命名 | `<原始 stem>-<UTC YYYYMMDDHHMMSS>.<ext>`                          |
| 触发前提 | 必须先导入过一张 Apollo 地图（需要 `info.projString`）            |

::: tip 为什么要先 Import
导出需要 Apollo `Header.projection.proj`（PROJ.4 字符串），用于把内存中的 WGS84 经纬度反投影回 UTM 米。AMS 直接复用 `apolloMapStore.info.projString`，因此**必须先 Import 过**才有 export 上下文。`currentExportContext()` (`mapIO.ts:81-89`) 会在缺失时报 `"Nothing to export - import a map first."`。
:::

::: warning 不是从零生成完整 Apollo map
当前 worker 导出依赖导入阶段缓存的 raw Apollo map：`apolloIO.worker.ts` 中的 `cachedRawLonLatMap`。导出时先把编辑后的 entities merge 回这份 raw map，再编码为 `.bin` / `.txt`。这能保留尚未编辑或尚未桥接成 `MapEntity` 的字段，但也意味着空白新建工程不能直接产出完整 Apollo `base_map`。
:::

## 三种 Apollo 产物 / Three Map Variants

Apollo 自动驾驶栈在 runtime 用三类地图文件：

| 产物                    | 含义                                                | AMS 是否产出                                                  |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `base_map.bin` / `.txt` | 完整高精地图（lane / road / junction / signal / …） | ✅ 直接产出                                                   |
| `sim_map.bin`           | 用于仿真显示的简化版（多边形+少量字段）             | ⚠️ 由 Apollo `sim_map_generator` 离线生成；AMS 不直接产出     |
| `routing_map.bin`       | 用于规划的拓扑图（仅 lane connections）             | ⚠️ 由 Apollo `routing_map_generator` 离线生成；AMS 不直接产出 |

::: warning 仅产 base_map
当前版本 AMS 只导出 `base_map`。`sim_map` 与 `routing_map` 仍由 Apollo 工具链 `bazel run //modules/map/tools:sim_map_generator -- --map_dir=...` 生成。AMS 已经为这两类增加了导出钩子（`apolloIOProtocol.ts` 中的 `format` 联合类型），但实际 worker 路径暂未实现。
:::

## 二进制 vs 文本 / Bin vs Text

| 维度     | `.bin` (binary protobuf)      | `.txt` (text protobuf)               |
| -------- | ----------------------------- | ------------------------------------ |
| 编解码   | `protobufjs` 经 `binCodec.ts` | 自实现 ASCII 编解码器 `textCodec.ts` |
| 体积     | 紧凑，1MB 量级                | 大约 5–10× `.bin`                    |
| 可读性   | 不可读                        | 人类可读，便于 diff / grep           |
| 加载速度 | 快                            | 慢（需要解析）                       |
| 推荐场景 | 部署、车端 runtime            | code review、回归测试 fixture        |
| 快捷键   | `⌘S` / `Ctrl+S`               | `⇧⌘S` / `Ctrl+Shift+S`               |

::: tip protobuf 文本格式
`.txt` 文件其实是 protobuf textproto，不等于 JSON。它的语法是 `field_name: value`、嵌套 message 用花括号；与 `.bin` 是同一份 `map.proto` 的两种序列化。
:::

## UI 入口 / Entry Points

```
                  ┌─────────────────────────────────┐
                  │           MenuBar               │
                  │  File → Export Apollo Map (.bin)│  ← Cmd/Ctrl+S
                  │       → Export Apollo Map (.txt)│  ← Cmd/Ctrl+Shift+S
                  └────────┬────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │     Command Palette     │  ← Cmd/Ctrl+K then "export"
              │  Export Apollo Map (.bin)│
              │  Export Apollo Map (.txt)│
              └────────────┬────────────┘
                           │
                           ▼
                exportApolloBin / exportApolloText
                  (src/io/mapIO.ts:95-141)
```

来源：`src/core/actions/registry/definitions.ts:33-53`

```ts
{ id: 'exportApolloBin',  shortcut: '⌘S',  keybinding: { key: 's', ctrl: true } },
{ id: 'exportApolloText', shortcut: '⇧⌘S', keybinding: { key: 's', ctrl: true, shift: true } },
```

## 文件命名规则 / Filenames

`suggestedFilename` (`mapIO.ts:75-79`) 生成：

```
<base>-<YYYYMMDDHHMMSS>.<ext>
  where base = info.filename minus .bin/.txt/.pb.txt
```

举例：导入名为 `sunnyvale_with_two_offices.bin`，下午 14:23:05 UTC 导出 `.bin`，实际下载文件名：

```
sunnyvale_with_two_offices-20260502142305.bin
```

::: tip 时间戳是 UTC
为避免跨时区混淆，时间戳采用 UTC（`new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)`）。
:::

## 操作步骤 / Steps

1. **导入** 一张 Apollo 地图（如果还没有）。详见 [Import](./import.md)。
2. **修改/新增** 实体。
3. **触发导出**：
   - 菜单 `File → Export Apollo Map (.bin)`，**或**
   - 按 `⌘S` / `Ctrl+S`，**或**
   - 命令面板搜索 `export`。
4. 浏览器触发下载（`<a download>` + Blob URL）。Electron 目前也走同一 browser download 路径，不走 native save dialog。
5. 等待几秒（大地图 30–60s）。
6. 在状态栏底部观察 `TaskProgressOverlay`：导出超过 1s 才会出现进度条。

## 进度可视化 / Task Progress

进度由 `apolloIO.worker.ts` 通过 `PROGRESS` 消息推送，写入 `taskProgressStore`，`TaskProgressOverlay.tsx` 渲染。可见五段：

| 阶段                  | 进度区间  | 文案示例                               |
| --------------------- | --------- | -------------------------------------- |
| 序列化前置            | 0.00–0.02 | "Preparing export"                     |
| Entity 切片传输       | 0.02–0.10 | "Sending entities 12,000 / 18,250"     |
| 反投影 + overlap 重算 | 0.10–0.60 | "Reprojecting + reconciling overlaps"  |
| protobuf 编码         | 0.60–0.95 | "Encoding map_lane / map_junction / …" |
| 落盘                  | 0.95–1.00 | "Writing file"                         |

## 常见问题 / Troubleshooting

| 症状                                                      | 原因                                                | 处理                                                               |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| 错误条 "Nothing to export - import a map first."          | 还没 Import，缺 `info.projString`                   | 先 Import，详见 [Import](./import.md)                              |
| 错误条 "Export failed: ..."                               | worker 抛异常，已经被 `mapIO.ts:108-111` 捕获       | 打开 DevTools console 看堆栈；常见是 PROJ 字符串非法               |
| `.bin` 文件可下载但 Apollo 加载失败                       | 字段类型不匹配，常见是新增 entity 字段没在 proto 中 | 用 `.txt` 重新导出做 diff，定位异常 entity                         |
| `.txt` 内 Lane 没有 `successor_id`/`predecessor_id`       | 拓扑没 reconcile                                    | 检查导出前 [Topology](./topology.md) 是否健康                      |
| Overlap 报 "Region polygon empty"                         | overlap 重算时所有 lane corridor 都被截掉           | 看 `_userOverrides` 是否误把 `regionOverlaps` 钉住但实体已删       |
| 大地图（>50k entities）导出超时                           | 默认 timeout 10 分钟，仍可能不够                    | 把 `apolloIOBridge.ts:14` 的 `DEFAULT_TIMEOUT_MS` 调大重试，或拆图 |
| 错误 "No imported Apollo map is cached in the IO worker." | worker 没有导入阶段缓存的 `cachedRawLonLatMap`      | 重新 Import 源 base_map 后再 Export                                |

## 配置存储位置 / Persistence

导出本身**不写 `localStorage`**；它只**读** `apolloMapStore.info.projString`（来自最近一次 Import）。如果你想强制更换 PROJ，应通过 `ProjPickerDialog` 手动指定，详见 [Importing](./importing.md#projection-picker)。

## 相关源码 / Source

- `src/io/mapIO.ts:75-141` — 文件名 + 主流程
- `src/io/fileIO.ts:53-67` — browser download helper
- `src/io/apolloIOBridge.ts:88-178` — 主线程 ↔ worker 桥接
- `src/io/apolloIO.worker.ts` — 实际 reconcile + 编码
- `src/io/proto/binCodec.ts:17-23` — `.bin` encode
- `src/io/proto/textCodec.ts:13-16` — `.txt` encode
- `src/core/actions/registry/definitions.ts:33-53` — `exportApolloBin` / `exportApolloText` 注册

## 进阶用例 / Advanced

### 1. 批量导出多张地图

AMS 一次只能导出一张地图（与 import 单文件对应）。要批处理：

```bash
# Headless 用 Playwright 录制脚本（仓库示例）
pnpm exec playwright test e2e/export-batch.spec.ts \
  --grep "batch export" \
  -- --maps=foo.bin,bar.bin,baz.bin
```

或用 Apollo 自带 CLI `bazel run //modules/map/tools:map_diff`。AMS 不复制 Apollo 既有命令行能力。

### 2. 导出仅修改过的实体（增量）

::: warning 不支持
当前 export 是**全量**——它把 `mapStore.entities.values()` 全数序列化。当前版本不提供“仅导出修改实体”的差分包；如需对比两次输出，请用导出的完整 `base_map` 运行外部 diff 工具。
:::

### 3. 强制忽略 `_userOverrides`

如果你想做一次“完全自动派生”的 clean export（重置所有用户钉位），**临时**清空 entity 的 `_userOverrides`：

```js
// DevTools console
useMapStore.getState().entities.forEach((e, id) => {
  if (e._userOverrides) {
    useMapStore.getState().updateEntity(id, { ...e, _userOverrides: undefined });
  }
});
// 然后 ⌘S 导出
```

::: danger 这是单向操作
清空后无法恢复，原有的手工值会被 derive 覆盖。务必先备份当前 mapStore（导出一次 .bin 当 backup）。
:::

### 4. 验证 round-trip

```bash
# 1. import foo.bin → export foo-A.bin
# 2. import foo-A.bin → export foo-B.bin
# 3. diff
diff <(protoc --decode_raw < foo-A.bin) <(protoc --decode_raw < foo-B.bin)
# 应该输出空（除时间戳/derive 派生字段外）
```

## 已知限制 / Known Limitations

| 项目               | 限制                                                              |
| ------------------ | ----------------------------------------------------------------- |
| 体积               | 单文件 > 200MB 时浏览器 Blob URL 可能 OOM；用 desktop 端或 split  |
| 并发               | 一次只能跑一个 import / export；并发会被 `taskProgressStore` 拒绝 |
| sim_map            | 不直接产出                                                        |
| routing_map        | 不直接产出                                                        |
| Web 端文件名       | 浏览器可能改动文件后缀（Safari 自动加 `.txt` 给二进制）           |
| 大图 progress 跳跃 | < 1s 不显示进度条；用户感觉“突然弹出文件”是预期                   |

## 文件后缀策略 / Filename Suffix Strategy

`mapIO.ts:75-79`：

| 输入文件名                  | 导出 .bin                        | 导出 .txt      |
| --------------------------- | -------------------------------- | -------------- |
| `foo.bin`                   | `foo-<ts>.bin`                   | `foo-<ts>.txt` |
| `foo.txt`                   | `foo-<ts>.bin`                   | `foo-<ts>.txt` |
| `foo.pb.txt`                | `foo-<ts>.bin`                   | `foo-<ts>.txt` |
| `something_with_no_ext`     | `something_with_no_ext-<ts>.bin` | `…-<ts>.txt`   |
| 空 (`info.filename === ''`) | `apollo-map-<ts>.bin`            | 同             |

## 浏览器 vs Electron 下载差异 / Web vs Desktop

| 行为               | 浏览器                                                 | Electron                          |
| ------------------ | ------------------------------------------------------ | --------------------------------- |
| 触发机制           | `<a href={blobUrl} download={name}>`                   | 同（Electron 走 native download） |
| 是否弹出保存对话框 | 默认下载到 `~/Downloads`（除非 Chrome 设置“总是询问”） | Electron 弹 native dialog         |
| 体积上限           | 浏览器 Blob URL ~ 2 GB（取决于 GPU）                   | Electron 走文件系统，无上限       |
| 文件名安全字符     | 浏览器 sanitize `/`                                    | Electron 同                       |

## 相关文档 / See also

- [Exporting (deep dive)](./exporting.md) — 完整管线、reconcile、overlap、header 保留
- [Import](./import.md) — Import 流程（导出前置）
- [Coordinate System](./coordinate-system.md) — PROJ.4 / UTM 解释
- [Troubleshooting](./troubleshooting.md) — 通用排错

## 命令行替代方案 / CLI Alternatives

如果你不想 UI 交互，本仓库附带了 headless 工具：

```bash
# 把 base_map.bin 转成 .txt（直接调用 codec）
node scripts/bin-to-text.mjs --in foo.bin --out foo.txt

# 校验一份 .bin 是否符合 schema
node scripts/verify-map.mjs --in foo.bin
```

::: warning 不替代主流程
这些脚本是 CI 与 tooling 用的；主流程仍是 GUI 的 `⌘S`。脚本不会跑 derive / overlap reconcile。
:::

## 与 Apollo CLI 互操作 / Apollo CLI Interop

```bash
# 1. 用 AMS 导出
# 2. 用 Apollo 工具链生成 sim_map / routing_map
bazel run //modules/map/tools:sim_map_generator -- \
  --map_dir=/path/to/exported/dir \
  --output_dir=/path/to/exported/dir
bazel run //modules/map/tools:routing_map_generator -- \
  --map_dir=/path/to/exported/dir
```

最终目录结构（Apollo runtime 期待）：

```
/path/to/map/
├── base_map.bin        ← AMS 产出
├── base_map.txt        ← AMS 产出（可选）
├── sim_map.bin         ← Apollo sim_map_generator 产出
├── routing_map.bin     ← Apollo routing_map_generator 产出
└── routing_map.txt     ← 同
```

## 检查清单（发版前） / Pre-release Checklist

| ✓   | 项                                                                  |
| --- | ------------------------------------------------------------------- |
| ☐   | `⌘S` 导出 `.bin`，文件大小合理（KB ~ MB）                           |
| ☐   | `⇧⌘S` 导出 `.txt`，textproto 可被 `protoc` 解码                     |
| ☐   | round-trip 验证 (`importBin → exportBin → importBin`) entity 数一致 |
| ☐   | overlap 数量稳定（不增不减）                                        |
| ☐   | `_userOverrides` 字段在 round-trip 后保留                           |
| ☐   | header.projection / vendor / district 不变                          |
| ☐   | 大图（>10k entities）耗时 < 5s                                      |
| ☐   | progress 进度条正确显示，无回退                                     |
| ☐   | 导出后内存释放（DevTools 性能记录）                                 |
