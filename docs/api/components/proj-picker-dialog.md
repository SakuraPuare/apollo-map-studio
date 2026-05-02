---
title: ProjPickerDialog
description: 导入无 Header.projection.proj 的 Apollo 地图时弹出的投影选择 modal——三种模式：region preset / UTM zone / custom PROJ.4。
---

# ProjPickerDialog

> 源码：`src/components/dialogs/ProjPickerDialog.tsx`

## 用途与 UX 角色

`ProjPickerDialog` 是 Apollo `.bin/.txt` 导入流水线的**最后一道护栏**。Apollo 的 `Map.header.projection.proj` 是 PROJ.4 字符串，承载所有 lane corridor / road / signal 几何的本地坐标→WGS84 转换。如果文件缺失这个字段，编辑器无法决定如何把本地米坐标变成经纬度——这时 dialog 弹出，让用户选：

1. **Region preset**：4 个预设（Sunnyvale / Beijing / Shanghai / Shenzhen，对应常见的 Apollo borregas + 中国车队）。
2. **UTM zone**：手动输入 UTM 区号（1–60）+ 半球（N/S）。
3. **Custom PROJ**：粘贴任意 PROJ.4 字符串；自动 sanitize（去除 Apollo 模板括号 `+lat_0={37.4}`）。

底部预览框实时显示**最终生效的 PROJ 字符串**，方便对照。

## 组件接口

`ProjPickerDialog` 不接受 props——通过 `useProjDialogStore` 与外部通信：

```ts
export function ProjPickerDialog(): JSX.Element | null;

// 外部调用方：
const { resolve } = useProjDialogStore.getState();
useProjDialogStore.getState().request(); // 返回 Promise<string | null>
```

| Store 字段           | 说明                                              |
| -------------------- | ------------------------------------------------- |
| `pending: boolean`   | 是否有正在等待的请求                              |
| `resolve(s \| null)` | 用户提交时调用——返回 PROJ.4 字符串或 null（取消） |

`resolve(null)` 后导入流水线 abort，文件不会进入 mapStore。

## 内部状态

```ts
type Mode = 'preset' | 'utm' | 'custom';
```

| `useState`                  | 初值        | 说明            |
| --------------------------- | ----------- | --------------- |
| `mode: Mode`                | `'preset'`  | tab 切换        |
| `preset: PresetEntry['id']` | `'beijing'` | 当前选中预设    |
| `zone: number`              | `50`        | UTM 区号        |
| `hemisphere: 'N' \| 'S'`    | `'N'`       | 半球            |
| `custom: string`            | `''`        | 用户粘贴的 PROJ |

每次 dialog 打开（`pending` 由 false → true），通过 `useEffect([pending])` 重置以上 5 个 state（`ProjPickerDialog.tsx:38-46`），避免上次操作残留。

## 副作用

| 时机                                | 行为                                         |
| ----------------------------------- | -------------------------------------------- |
| `useEffect([pending])` reset        | 打开时重置全部状态                           |
| `useEffect([pending, resolve])` Esc | 挂全局 `keydown` 监听，Esc → `resolve(null)` |
| `submit()` 按钮 / Enter             | `canSubmit` 为 true 时 `resolve(computed)`   |
| backdrop click                      | `resolve(null)`                              |

`computed` 派生（`ProjPickerDialog.tsx:63-67`）：

```ts
const computed =
  mode === 'preset'
    ? UTM_PRESETS[preset]
    : mode === 'utm'
      ? utmProjString(zone, hemisphere)
      : sanitizeProjString(custom);
```

## 渲染骨架

```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => resolve(null)} />
  <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
    <Header title="Choose Coordinate System" hint="imported map has no Header.projection.proj" onClose={() => resolve(null)} />
    <div className="px-5 py-4 space-y-4">
      <ModeTabs mode={mode} setMode={setMode} />
      {mode === 'preset' && <PresetList … />}
      {mode === 'utm' && <UTMInputs … />}
      {mode === 'custom' && <CustomTextarea … />}
      <ResolvedPreview computed={computed} />
    </div>
    <Footer cancel={() => resolve(null)} submit={submit} canSubmit={canSubmit} />
  </div>
</div>
```

## 工具函数

来自 `@/io/proto/projection`：

- `UTM_PRESETS: Record<id, projString>` — 预设字典
- `utmProjString(zone, hemisphere)` — `+proj=utm +zone={n} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`（北半球省略 `+south`）
- `sanitizeProjString(custom)` — 去除 `{...}` 模板，trim 空白，验证基本结构

## 性能注释

- 单 modal，几乎不存在性能问题。
- Esc 监听仅在 `pending=true` 时挂载，关闭时立即解绑。
- preset 列表是常量数组（4 项），无虚拟化需求。

## 已知缺口

- **没有 EPSG 代码输入**：如 `EPSG:32650`。要完整支持需调用 proj4 库做 lookup。
- 没有"测试投影"——预览仅是字符串拼接，不做 forward/inverse 试算。
- preset 列表硬编码，未来可加上"最近使用"或"项目级保存"。

## 源码索引

| 关注点               | 文件位置                       |
| -------------------- | ------------------------------ |
| 主组件               | `ProjPickerDialog.tsx:27-230`  |
| `PRESETS` 常量       | `ProjPickerDialog.tsx:14-19`   |
| `useEffect` reset    | `ProjPickerDialog.tsx:38-46`   |
| Esc 监听             | `ProjPickerDialog.tsx:48-59`   |
| `computed` 派生      | `ProjPickerDialog.tsx:63-67`   |
| Mode tabs            | `ProjPickerDialog.tsx:103-117` |
| 预设列表             | `ProjPickerDialog.tsx:119-144` |
| UTM 输入             | `ProjPickerDialog.tsx:146-179` |
| Custom textarea      | `ProjPickerDialog.tsx:181-196` |
| Resolved preview     | `ProjPickerDialog.tsx:198-204` |
| Footer cancel/submit | `ProjPickerDialog.tsx:206-227` |
| Projection helpers   | `src/io/proto/projection.ts`   |

## 跨页参考

- [WorkspaceLayout](./workspace-layout.md) — `LazyProjPickerDialog` 在此挂载
- [`projDialogStore`](/api/store) — request/resolve API
- Apollo import → `src/io/mapIO.ts` → `src/io/apolloIO.worker.ts`（消息契约见 `src/io/apolloIOProtocol.ts`）
- 投影 helpers → `src/io/proto/projection.ts`

## 英文镜像

[/en/api/components/proj-picker-dialog](/en/api/components/proj-picker-dialog)
