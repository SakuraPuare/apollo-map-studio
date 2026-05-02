---
title: io / proto-codec-text
description: src/io/proto/textCodec.ts + textCodec/* — Apollo HD-map text protobuf codec
---

# io / proto-codec-text

`src/io/proto/textCodec.ts` is the facade for Apollo HD-map protobuf
text format. It delegates to `textCodec/decoder.ts` and
`textCodec/encoder.ts`; `textCodec/tokenStream.ts` provides the
low-level lexer.

## Exported symbols

```ts
// src/io/proto/textCodec.ts
export function decodeMapText(text: string): Promise<Record<string, unknown>>;
export function encodeMapText(obj: Record<string, unknown>): Promise<string>;

// Re-exported low-level helpers (useful for nested types):
export function decodeMessage(type: protobuf.Type, text: string): Record<string, unknown>;
export function encodeMessage(type: protobuf.Type, msg: unknown, level?: number): string;
```

## `textCodec/decoder.ts`

```ts
export function decodeMessage(type: protobuf.Type, text: string): Record<string, unknown>;
```

- Tokenises once into a `TokenStream`.
- Known fields recurse through `parseFieldValue`; unknown fields are
  silently skipped via `skipFieldValue` for forward compatibility.
- Supports both `name { ... }` and angle-bracket group syntax.
- Number literals: `inf`, `-inf`, `nan`, `0xHEX`, decimals, trailing
  `f`/`F`.
- Bool literals: `true / True / t / 1` and `false / False / f / 0`.
- String escapes: `\n`, `\r`, `\t`, `\xHH`, `\OOO`, `\"`, `\\`,
  `\a / \b / \f / \v`.

## `textCodec/encoder.ts`

```ts
export function encodeMessage(type: protobuf.Type, msg: unknown, level?: number): string;
```

- 2-space indent;
- nested message: `name { ... }` on its own block;
- enum: prefers symbolic from `resolvedType.valuesById`, falls back
  to numeric string;
- bytes: latin1 quoted string with octal escapes for bytes outside
  `[0x20, 0x7e]`;
- floats: `Infinity / -Infinity / NaN` map to `inf / -inf / nan`.

## `textCodec/tokenStream.ts`

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

`peek()` returns the next token without consuming; `consume()`
removes it; `expect()` throws
an `Expected kind ..., got kind "value" near pos N`-style error on
mismatch.

## Binary vs text

Text format is easier to inspect and diff; it is roughly 6–10×
larger than binary on real Apollo HD maps. Production / CI imports
and benchmark fixtures should use binary.

## Tests

`src/io/proto/__tests__/textCodec.test.ts` covers tricky escapes,
angle-bracket group syntax, multi-`{}` nesting, and round-trip equivalence
between decoder and encoder.

## See also

- [Proto / Codec](/en/api/proto-codec) — top-level overview.
- [io/proto-codec-bin](/en/api/io/proto-codec-bin) — binary
  counterpart.
