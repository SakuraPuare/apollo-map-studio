---
title: io / file-io
description: src/io/fileIO.ts — 浏览器文件选择器与下载工具
---

# io / file-io

`src/io/fileIO.ts` 是浏览器侧文件 IO 的纯 DOM 工具集。它不依赖
React、不依赖 store，便于单元测试时 mock `document.createElement`。

## 公开符号

```ts
export function pickFile(accept: string): Promise<File | null>;
export function readFileAsBytes(file: Blob): Promise<Uint8Array>;
export function readFileAsText(file: Blob): Promise<string>;
export function downloadBlob(blob: Blob, filename: string): void;
```

> Source: `src/io/fileIO.ts:1-66`

## `pickFile(accept): Promise<File | null>`

打开一个隐藏的 `<input type="file">` 并 resolve 用户选择的 `File` 或
`null`（取消时）。`accept` 可以传 MIME 列表 / 后缀列表，例如
`'.bin,.txt,application/octet-stream'`。

实现要点：

- 用 `'change'` 事件读 `input.files[0]`；
- 用原生 `'cancel'` 事件检测取消（macOS 上 `focus` 推断会和
  `change` 竞争 → 误判为取消）；
- 选择完成后 `input.remove()` 清理 DOM；
- 使用 `settled` flag 防止 `change` 之后再被 `cancel` 复盖。

```ts
const file = await pickFile('.bin,.txt,.pb.txt');
if (file) {
  const bytes = await readFileAsBytes(file);
}
```

## `readFileAsBytes(file): Promise<Uint8Array>`

`new Uint8Array(await file.arrayBuffer())`。

## `readFileAsText(file): Promise<string>`

`file.text()`，UTF-8 解码。

## `downloadBlob(blob, filename): void`

合成一个 `<a href="${objectURL}" download="${filename}">` 并 `click()`，
1 秒后 `URL.revokeObjectURL` 释放内存：

```ts
const blob = new Blob([bytes.buffer], { type: 'application/octet-stream' });
downloadBlob(blob, 'apollo-base-map.bin');
```

## 使用约束

- 仅在浏览器（含 Tauri webview）内可用。Electron 主进程的 dialog 由
  `electron/preload` 提供，与本模块没有交集。
- 不处理多文件选择：当前 Apollo 导入只接受单文件，所以
  `input.multiple = false`。
- `pickFile` 不抛错，全部走 `null` 分支。
