---
title: io / map-io
description: src/io/mapIO.ts — Apollo HD-map 文件路径粘合层（pickAndImportApollo / exportApolloBin / exportApolloText）
---

# io / map-io

`src/io/mapIO.ts` 是 Apollo HD-map 文件路径的「胶水」层。它把
浏览器的文件选择器 / 下载、`taskProgressStore` 的进度通知、
`apolloIOBridge` 的 worker 调用，和 `mapStore` / `apolloMapStore` 的
状态同步组合成 3 个高层入口：

```ts
export function pickAndImportApollo(): Promise<ApolloMapImportInfo | null>;
export function exportApolloBin(): Promise<void>;
export function exportApolloText(): Promise<void>;
```

> Source: `src/io/mapIO.ts:1-141`

## 内部 helper（非导出）

```ts
function reportProgress(taskId: string, progress: ApolloIOProgress): void;
function beginTask(id: string, label: string, detail?: string): void;
function endTask(id: string): void;
function importApolloBinFile(file: File): Promise<ApolloImportWorkerResult>;
function importApolloTextFile(file: File): Promise<ApolloImportWorkerResult>;
function suggestedFilename(originalName: string, ext: 'bin' | 'txt'): string;
function currentExportContext(): { info: ApolloMapImportInfo; entities: MapEntity[] } | null;
```

`taskId` 常量：`'apollo-import' | 'apollo-export'`，与
`taskProgressStore` 的 `beginTask / endTask` 配对。

## `pickAndImportApollo()`

```ts
export async function pickAndImportApollo(): Promise<ApolloMapImportInfo | null> {
  const file = await pickFile('.bin,.txt,.pb.txt,application/octet-stream,text/plain');
  if (!file) return null;

  beginTask(TASK_IMPORT, 'Importing Apollo map', file.name);
  try {
    const isText = /\.(pb\.txt|txt)$/i.test(file.name);
    const result = isText ? await importApolloTextFile(file) : await importApolloBinFile(file);
    useApolloMapStore.getState().setImported(result.info, result.bounds, result.header);
    useMapStore.getState().replaceImportedEntities(result.entities);
    return result.info;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    useApolloMapStore.getState().setError(`Import failed: ${msg}`);
    console.error('[mapIO] import failed', error);
    return null;
  } finally {
    endTask(TASK_IMPORT);
  }
}
```

要点：

- 文件 accept 字符串覆盖 `.bin`、`.txt`、`.pb.txt`，再加上 MIME
  fallback；
- `.pb.txt` / `.txt` 走文本解码，否则按二进制处理；
- 成功后**先**写 `apolloMapStore.setImported`（保存原始 raw map 上
  下文）**再**写 `useMapStore.replaceImportedEntities`。前者不进 zundo；
  后者会清空 zundo 历史；
- 任何抛错都被 catch 转成 `setError(...)` + `console.error`，调用方
  收到 `null`。

## `exportApolloBin / exportApolloText`

```ts
export async function exportApolloBin(): Promise<void>;
export async function exportApolloText(): Promise<void>;
```

详细流程见 [Export / Base Map](/api/export-base-map)。本节侧重 mapIO
层的事务边界：

- `currentExportContext` 返回 `null` 时直接弹错误；
- `apolloIOBridge.exportBin / exportText` 返回的 `Uint8Array` 会被
  copy 到本地 buffer 后包成 `Blob`，避免 transferable buffer 在下载
  之后被回收；
- `downloadBlob` 用 `<a>` 触发；setTimeout 1s 后 revoke object URL；
- catch 路径与 import 完全对称。

## 文件名命名规范

`suggestedFilename` 取原 base name（去 `.bin / .txt / .pb.txt`），追加
`-YYYYMMDDHHmmss`，加扩展名。例如：

```
input  : Sunnyvale-base-map.bin
output : Sunnyvale-base-map-20260502143015.bin
```

时间戳用 `new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)`
拼出 14 位 yyyymmddHHMMss。
