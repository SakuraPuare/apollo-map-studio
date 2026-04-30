import * as protobuf from 'protobufjs';
import { TokenStream } from './tokenStream';

type Token = ReturnType<TokenStream['peek']>;

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

    const value = parseFieldValue(stream, field);
    assignFieldValue(result, fieldName, field, value);
  }
}

function parseFieldValue(stream: TokenStream, field: protobuf.Field): unknown {
  if (field.resolvedType instanceof protobuf.Type) {
    return parseNestedMessage(stream, field.resolvedType);
  }
  const peekColon = stream.peek();
  if (peekColon?.kind === 'symbol' && peekColon.value === ':') stream.consume();
  const next = stream.peek();
  if (next?.kind === 'symbol' && next.value === '[') {
    return parseRepeatedArray(stream, field);
  }
  return parseScalarValue(stream, field);
}

function parseNestedMessage(
  stream: TokenStream,
  resolvedType: protobuf.Type,
): Record<string, unknown> {
  const next = stream.peek();
  if (next?.kind === 'symbol' && next.value === ':') stream.consume();
  const open = stream.expect('symbol');
  const close = open.value === '{' ? '}' : open.value === '<' ? '>' : null;
  if (!close) throw new Error(`Expected '{' or '<', got "${open.value}"`);
  const value = parseMessage(stream, resolvedType, true);
  stream.expect('symbol', close);
  return value;
}

function parseRepeatedArray(stream: TokenStream, field: protobuf.Field): unknown[] {
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
  return list;
}

function assignFieldValue(
  result: Record<string, unknown>,
  fieldName: string,
  field: protobuf.Field,
  value: unknown,
): void {
  if (field.repeated) {
    const arr = (result[fieldName] as unknown[] | undefined) ?? [];
    if (Array.isArray(value)) arr.push(...value);
    else arr.push(value);
    result[fieldName] = arr;
    return;
  }
  result[fieldName] = Array.isArray(value) ? value[0] : value;
}

function parseScalarValue(stream: TokenStream, field: protobuf.Field): unknown {
  const tok = stream.consume();
  if (!tok) throw new Error('Expected value, got EOF');

  if (field.resolvedType instanceof protobuf.Enum) {
    return parseEnumValue(tok, field, field.resolvedType);
  }

  switch (field.type) {
    case 'string':
      return parseStringValue(tok, field);
    case 'bytes':
      return parseBytesValue(tok, field);
    case 'bool':
      return parseBoolValue(tok, field);
    case 'float':
    case 'double':
      return parseFloatValue(tok, field);
    default:
      return parseIntegerValue(tok, field);
  }
}

function parseEnumValue(
  tok: NonNullable<Token>,
  field: protobuf.Field,
  resolvedType: protobuf.Enum,
): number {
  if (tok.kind === 'identifier') {
    const v = resolvedType.values[tok.value];
    if (v === undefined) throw new Error(`Unknown enum value "${tok.value}" for ${field.name}`);
    return v;
  }
  if (tok.kind === 'number') return parseInt(tok.value, 10);
  throw new Error(`Expected enum, got ${tok.kind}`);
}

function parseStringValue(tok: NonNullable<Token>, field: protobuf.Field): string {
  if (tok.kind !== 'string') throw new Error(`Expected string for ${field.name}, got ${tok.kind}`);
  return tok.value;
}

function parseBytesValue(tok: NonNullable<Token>, field: protobuf.Field): Uint8Array {
  if (tok.kind !== 'string')
    throw new Error(`Expected bytes string for ${field.name}, got ${tok.kind}`);
  const b = new Uint8Array(tok.value.length);
  for (let i = 0; i < tok.value.length; i++) b[i] = tok.value.charCodeAt(i) & 0xff;
  return b;
}

function parseBoolValue(tok: NonNullable<Token>, field: protobuf.Field): boolean {
  if (tok.kind === 'identifier') {
    if (tok.value === 'true' || tok.value === 'True' || tok.value === 't') return true;
    if (tok.value === 'false' || tok.value === 'False' || tok.value === 'f') return false;
  }
  if (tok.kind === 'number') return tok.value !== '0';
  throw new Error(`Expected bool for ${field.name}, got ${tok.kind} "${tok.value}"`);
}

function parseFloatValue(tok: NonNullable<Token>, field: protobuf.Field): number {
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

function parseIntegerValue(tok: NonNullable<Token>, field: protobuf.Field): number {
  if (tok.kind !== 'number') throw new Error(`Expected integer for ${field.name}, got ${tok.kind}`);
  return parseInt(tok.value, 10);
}

function skipFieldValue(stream: TokenStream): void {
  const next = stream.peek();
  if (next?.kind === 'symbol' && next.value === ':') stream.consume();
  const t = stream.peek();
  if (!t) return;
  if (t.kind === 'symbol' && (t.value === '{' || t.value === '<')) {
    skipBracedBlock(stream);
    return;
  }
  if (t.kind === 'symbol' && t.value === '[') {
    skipBracketedList(stream);
    return;
  }
  stream.consume();
}

function skipBracedBlock(stream: TokenStream): void {
  stream.consume();
  let depth = 1;
  while (depth > 0) {
    const x = stream.consume();
    if (!x) throw new Error('Unterminated braces in unknown field');
    if (x.kind === 'symbol' && (x.value === '{' || x.value === '<')) depth++;
    else if (x.kind === 'symbol' && (x.value === '}' || x.value === '>')) depth--;
  }
}

function skipBracketedList(stream: TokenStream): void {
  stream.consume();
  let depth = 1;
  while (depth > 0) {
    const x = stream.consume();
    if (!x) throw new Error('Unterminated list');
    if (x.kind === 'symbol' && x.value === '[') depth++;
    else if (x.kind === 'symbol' && x.value === ']') depth--;
  }
}
