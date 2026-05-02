---
title: io / apollo-io-bridge
description: src/io/apolloIOBridge.ts — 主线程到 apolloIO.worker 的 Promise 网关
---

# io / apollo-io-bridge

`src/io/apolloIOBridge.ts` 是主线程到 `apolloIO.worker` 的 **Promise
网关**。它把 `apolloIOProtocol` 的消息往返封装成 4 个 Promise 风格
方法，处理超时、worker 重启、entity chunk 拆包、`NEEDS_PROJECTION`
对话框联动。

## 公开 API

```ts
export interface ApolloImportWorkerResult {
  info: ApolloMapImportInfo;
  header: ApolloMapHeader | null;
  bounds: ApolloMapBounds | null;
  entities: MapEntity[];
  stats: ApolloImportStats;
}

class ApolloIOBridge {
  importBin(filename: string, bytes: Uint8Array, onProgress?): Promise<ApolloImportWorkerResult>;
  importText(filename: string, bytes: Uint8Array, onProgress?): Promise<ApolloImportWorkerResult>;
  exportBin(entities: MapEntity[], projString: string, onProgress?): Promise<Uint8Array>;
  exportText(entities: MapEntity[], projString: string, onProgress?): Promise<Uint8Array>;
  clear(): Promise<void>;
}

export const apolloIOBridge: ApolloIOBridge; // module singleton
```

> Source: `src/io/apolloIOBridge.ts:59-309`

`onProgress` 回调收到 `ApolloIOProgress = { label, detail?, progress }`，
caller 可直接转给 `taskProgressStore.updateTask`。

## 内部状态

```ts
type PendingEntry =
  | { kind: 'import'; resolve; reject; timer; onProgress?; entities: MapEntity[] }
  | { kind: 'exportBin'; resolve; reject; timer; onProgress? }
  | { kind: 'exportText'; resolve; reject; timer; onProgress? }
  | { kind: 'clear'; resolve; reject; timer; onProgress? };
```

`pending: Map<requestId, PendingEntry>`、`counter` 用于生成
`${prefix}_${++counter}` 的 requestId。`worker: Worker | null`
延迟初始化（首次 post 时 `ensureWorker()`）。

## 流程详解

### 导入

```ts
importBin(filename, bytes, onProgress) →
  this.register(requestId, { kind: 'import', ..., entities: [] }) →
  this.post({ type: 'IMPORT_BIN', requestId, filename, bytes }, [bytes.buffer])
```

第二个参数是 `Transferable[]`，把 `bytes.buffer` 移交给 worker，避免
拷贝。worker 完成后通过 `IMPORT_ENTITIES_CHUNK × N` + `IMPORT_RESULT`
消息流回；`handleMessage` 把 chunk 累积到 `entry.entities`。

### 导出（更复杂的 chunked 流）

```ts
exportBin(entities, projString, onProgress) →
  this.post({ type: 'BEGIN_EXPORT', requestId, format, projString, total })
  for chunk of entities (size 2000):
    this.post({ type: 'EXPORT_ENTITIES_CHUNK', requestId, entities: chunk, offset, total })
    onProgress(...) // 0.02..0.10
    await this.yieldToMain()
  this.post({ type: 'FINISH_EXPORT', requestId })
  ← EXPORT_BIN_RESULT { bytes }
```

`yieldToMain` = `setTimeout(0)`，让 React commit / event loop 喘口气，
避免 50 万实体序列化时把主线程锁死 5 秒。

### `NEEDS_PROJECTION`

worker 检测到 header 缺投影时主动推 `NEEDS_PROJECTION`：

```ts
if (msg.type === 'NEEDS_PROJECTION') {
  const picked = await useProjDialogStore.getState().request();
  const projString = picked ?? FALLBACK_PROJ; // UTM_PRESETS.beijing
  this.post({ type: 'RESOLVE_PROJECTION', requestId: msg.requestId, projString });
  return;
}
```

`useProjDialogStore.request()` 返回 `Promise<string | null>` —
`null` 走 fallback。

### 超时与失败

- `register` 时设置 `setTimeout(... DEFAULT_TIMEOUT_MS = 600_000)`，超时
  reject `Apollo IO request timed out after 600000ms`；
- worker 触发 `onerror` → `disposeWorker()` + 把所有 pending reject；
- 任何时候 reject 的请求都会 `clearTimeout`、`pending.delete`。

## 与外部模块的耦合

- 依赖 `apolloIOProtocol` 的消息类型；
- 依赖 `useProjDialogStore`（投影选择对话框）；
- 依赖 `proto/projection.UTM_PRESETS.beijing`（fallback）。
