---
title: io / proto-codec-text
description: src/io/proto/textCodec.ts + textCodec/* — Apollo HD-map 文本 protobuf 编解码
---

# io / proto-codec-text

`src/io/proto/textCodec.ts` 是 Apollo HD-map 文本 protobuf 的 facade，
内部委托给 `textCodec/decoder.ts` 与 `textCodec/encoder.ts`。
`textCodec/tokenStream.ts` 提供低层词法分析。

## 公开符号

```ts
// src/io/proto/textCodec.ts
export function decodeMapText(text: string): Promise<Record<string, unknown>>;
export function encodeMapText(obj: Record<string, unknown>): Promise<string>;

// 也直接 re-export 内部两个低层函数，方便 sub-message 复用：
export function decodeMessage(type: protobuf.Type, text: string): Record<string, unknown>;
export function encodeMessage(type: protobuf.Type, msg: unknown, level?: number): string;
```

## textCodec/decoder.ts

```ts
export function decodeMessage(type: protobuf.Type, text: string): Record<string, unknown>;
```

要点：

- 用 `TokenStream` 一次性 tokenise；
- 已知字段调用 `parseFieldValue` 递归 / 标量解析；
- 未知字段（schema 里没声明的）走 `skipFieldValue` —— 注释式
  forward-compat，避免上游加新字段时编辑器报错；
- 支持 `name { ... }` 和 angle-bracket group 两种 sub-message 语法；
- 数字字面量支持 `inf` / `-inf` / `nan` / `0xHEX` / 小数 / `f` 后缀；
- 布尔字面量支持 `true / True / t / 1` 与 `false / False / f / 0`；
- 字符串字面量支持 `\n / \r / \t / \xHH / \OOO / \" / \\` 等转义，
  还有简单 `\a / \b / \f / \v` octal-style escapes。

## textCodec/encoder.ts

```ts
export function encodeMessage(type: protobuf.Type, msg: unknown, level?: number): string;
```

要点：

- 缩进 = 2 spaces；
- nested message：`name { ... }` 多行 + 自动缩进；
- enum：尝试用 `valuesById` 输出符号名，失败时退回数字字符串；
- bytes：`bytesToLatin1` + `encodeQuoted`（小于 `0x20` 或 `>= 0x7f` 走
  3 位八进制 `\OOO`）；
- 数值：处理 `Infinity / -Infinity / NaN` 输出 `inf / -inf / nan`。

## textCodec/tokenStream.ts

```ts
export interface Token {
  kind: 'identifier' | 'string' | 'number' | 'symbol';
  value: string;
}

export class TokenStream {
  constructor(text: string);
  peek(): Token | null;
  consume(): Token | null;
  expect(kind: Token['kind'], value?: string): Token;
  position(): number;
}
```

`peek()` 读取下一个 token 但不消费；`consume()` 消费一个；`expect()`
按 kind/value 检查并 throw on mismatch（错误信息形如
`Expected kind ..., got kind "value" near pos N`）。

## 何时偏向用 binary

文本格式调试方便，体积约是 binary 的 6–10 倍；生产部署、CI 的导入
基线、benchmark 输入都用 binary。
