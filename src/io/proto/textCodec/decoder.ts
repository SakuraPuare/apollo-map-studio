import * as protobuf from 'protobufjs';
import { TokenStream } from './tokenStream';

export function decodeMessage(type: protobuf.Type, text: string): Record<string, unknown> {
  const stream = new TokenStream(text);
  const result = parseMessage(stream, type, false);
  return result;
}

function parseMessage(
  stream: TokenStream,
  type: protobuf.Type,
  inBraces: boolean,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (;;) {
    const t = stream.peek();
    if (!t) {
      if (inBraces) throw new Error('Unexpected EOF inside message');
      return result;
    }
    if (inBraces && t.kind === 'symbol' && (t.value === '}' || t.value === '>')) {
      return result;
    }
    if (t.kind === 'symbol' && t.value === ';') {
      stream.consume();
      continue;
    }

    if (t.kind !== 'identifier') {
      throw new Error(
        `Expected field name, got ${t.kind} "${t.value}" near pos ${stream.position()}`,
      );
    }
    stream.consume();
    const fieldName = t.value;
    const field = type.fields[fieldName];

    if (!field) {
      skipFieldValue(stream);
      continue;
    }
    field.resolve();

    let value: unknown;

    if (field.resolvedType instanceof protobuf.Type) {
      const next = stream.peek();
      if (next?.kind === 'symbol' && next.value === ':') stream.consume();
      const open = stream.expect('symbol');
      const close = open.value === '{' ? '}' : open.value === '<' ? '>' : null;
      if (!close) throw new Error(`Expected '{' or '<', got "${open.value}"`);
      value = parseMessage(stream, field.resolvedType, true);
      stream.expect('symbol', close);
    } else {
      const peekColon = stream.peek();
      if (peekColon?.kind === 'symbol' && peekColon.value === ':') stream.consume();
      const next = stream.peek();
      if (next?.kind === 'symbol' && next.value === '[') {
        stream.consume();
        const list: unknown[] = [];
        for (;;) {
          const peek = stream.peek();
          if (peek?.kind === 'symbol' && peek.value === ']') {
            stream.consume();
            break;
          }
          list.push(parseScalarValue(stream, field));
          const sep = stream.peek();
          if (sep?.kind === 'symbol' && sep.value === ',') stream.consume();
        }
        value = list;
      } else {
        value = parseScalarValue(stream, field);
      }
    }

    if (field.repeated) {
      const arr = (result[fieldName] as unknown[] | undefined) ?? [];
      if (Array.isArray(value)) arr.push(...value);
      else arr.push(value);
      result[fieldName] = arr;
    } else {
      result[fieldName] = Array.isArray(value) ? value[0] : value;
    }
  }
}

function parseScalarValue(stream: TokenStream, field: protobuf.Field): unknown {
  const tok = stream.consume();
  if (!tok) throw new Error('Expected value, got EOF');

  if (field.resolvedType instanceof protobuf.Enum) {
    if (tok.kind === 'identifier') {
      const v = field.resolvedType.values[tok.value];
      if (v === undefined) throw new Error(`Unknown enum value "${tok.value}" for ${field.name}`);
      return v;
    }
    if (tok.kind === 'number') return parseInt(tok.value, 10);
    throw new Error(`Expected enum, got ${tok.kind}`);
  }

  switch (field.type) {
    case 'string':
      if (tok.kind !== 'string')
        throw new Error(`Expected string for ${field.name}, got ${tok.kind}`);
      return tok.value;
    case 'bytes': {
      if (tok.kind !== 'string')
        throw new Error(`Expected bytes string for ${field.name}, got ${tok.kind}`);
      const b = new Uint8Array(tok.value.length);
      for (let i = 0; i < tok.value.length; i++) b[i] = tok.value.charCodeAt(i) & 0xff;
      return b;
    }
    case 'bool':
      if (tok.kind === 'identifier') {
        if (tok.value === 'true' || tok.value === 'True' || tok.value === 't') return true;
        if (tok.value === 'false' || tok.value === 'False' || tok.value === 'f') return false;
      }
      if (tok.kind === 'number') return tok.value !== '0';
      throw new Error(`Expected bool for ${field.name}, got ${tok.kind} "${tok.value}"`);
    case 'float':
    case 'double': {
      if (tok.kind === 'identifier') {
        if (tok.value === 'inf') return Infinity;
        if (tok.value === 'nan') return NaN;
      }
      if (tok.kind === 'number') {
        let v = tok.value;
        if (v.endsWith('f') || v.endsWith('F')) v = v.slice(0, -1);
        if (v === 'inf' || v === '+inf') return Infinity;
        if (v === '-inf') return -Infinity;
        if (v === 'nan' || v === '+nan' || v === '-nan') return NaN;
        return parseFloat(v);
      }
      throw new Error(`Expected number for ${field.name}, got ${tok.kind}`);
    }
    default: {
      if (tok.kind !== 'number')
        throw new Error(`Expected integer for ${field.name}, got ${tok.kind}`);
      return parseInt(tok.value, 10);
    }
  }
}

function skipFieldValue(stream: TokenStream): void {
  const next = stream.peek();
  if (next?.kind === 'symbol' && next.value === ':') stream.consume();
  const t = stream.peek();
  if (!t) return;
  if (t.kind === 'symbol' && (t.value === '{' || t.value === '<')) {
    stream.consume();
    let depth = 1;
    while (depth > 0) {
      const x = stream.consume();
      if (!x) throw new Error('Unterminated braces in unknown field');
      if (x.kind === 'symbol' && (x.value === '{' || x.value === '<')) depth++;
      else if (x.kind === 'symbol' && (x.value === '}' || x.value === '>')) depth--;
    }
  } else if (t.kind === 'symbol' && t.value === '[') {
    stream.consume();
    let depth = 1;
    while (depth > 0) {
      const x = stream.consume();
      if (!x) throw new Error('Unterminated list');
      if (x.kind === 'symbol' && x.value === '[') depth++;
      else if (x.kind === 'symbol' && x.value === ']') depth--;
    }
  } else {
    stream.consume();
  }
}
