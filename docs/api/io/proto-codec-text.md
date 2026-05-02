# IO / proto text codec

Sources:

- `src/io/proto/textCodec.ts`
- `src/io/proto/textCodec/decoder.ts`
- `src/io/proto/textCodec/encoder.ts`
- `src/io/proto/textCodec/tokenStream.ts`

The text codec reads and writes Apollo text protobuf (`.txt` /
`.pb.txt`). It is hand-rolled because Google's public text-proto
reference does not specify Apollo's quirks (mixed `{}` / `<>`
brackets, `[a, b, c]` arrays, octal/hex escapes in `bytes` fields).

## Layers

```
text bytes
   │
   ▼  TokenStream (tokenStream.ts)
identifier / string / number / symbol tokens
   │
   ▼  decoder.ts: parseMessage(stream, type)
plain object (snake_case, same shape as binCodec)
```

```
plain object
   │
   ▼  encoder.ts: encodeMessage(type, msg)
indented text bytes
```

## Top-level Exports (`textCodec.ts`)

- `decodeMapText(text)` — load `apollo.hdmap.Map` and call
  `decodeMessage`.
- `encodeMapText(obj)` — load the same type and call `encodeMessage`.
- `decodeMessage` / `encodeMessage` — re-exports for tests and tools
  that operate on non-Map types.

## Decode

`decodeMapText(text)` loads the Apollo `Map` type and calls
`decodeMessage(type, text)`.

The parser supports:

- nested messages with `{}` or `<>`;
- `:` before scalar or nested values;
- repeated scalar lists with `[...]`;
- repeated message fields by repeating blocks;
- unknown fields, which are skipped (forward compatibility with
  newer schemas);
- enum names or numeric enum values;
- bool, integer, float/double, string and bytes scalars;
- C-style escape sequences in strings (`\n`, `\NNN` octal,
  `\xHH` hex), required for `bytes` round-trip.

Number specials: `inf`, `+inf`, `-inf`, `nan`, `+nan`, `-nan` decode
to JavaScript `Infinity` / `-Infinity` / `NaN`. Trailing `f` / `F`
suffixes are consumed.

## Encode

`encodeMapText(obj)` emits fields in protobuf declaration order
(`type.fieldsArray`). Repeated fields are emitted as repeated blocks
or scalar lines. Enum ids are written as names when possible (numeric
fallback). Sub-messages use two-space indent.

`Map` fields are currently skipped by the encoder because the Apollo
map schema used by the editor does not require text map-field round
trips.

## TokenStream

```ts
class TokenStream {
  peek(): Token | null;
  consume(): Token | null;
  expect(kind, value?): Token; // throws on mismatch
  position(): number;
}

interface Token {
  kind: 'identifier' | 'string' | 'number' | 'symbol';
  value: string;
}
```

Whitespace and `# comments` are skipped between tokens. Errors carry
the stream position for human-readable diagnostics:
`Expected number for s, got identifier "abc" near pos 4271`.

## Examples

```ts
import { decodeMapText, encodeMapText } from '@/io/proto/textCodec';

const input = await readFileAsText(file);
const obj = await decodeMapText(input);
const output = await encodeMapText(obj);
// `output` is canonical (consistent indent, schema-ordered fields)
// but encodes the same proto bytes as `input`.
```

## Related

- [/api/io/proto-loader](/api/io/proto-loader) — provides the type.
- [/api/io/proto-codec-bin](/api/io/proto-codec-bin) — binary sibling;
  same plain-object shape.
- [/api/io/proto-adapter](/api/io/proto-adapter) — projection step.
- [/api/io/proto-entity-bridge](/api/io/proto-entity-bridge) — final
  bridge to `MapEntity[]`.
