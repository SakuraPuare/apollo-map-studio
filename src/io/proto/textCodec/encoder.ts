import * as protobuf from 'protobufjs';

const INDENT = '  ';

type TextMapField = protobuf.Field & {
  keyType: string;
};

function isMapField(field: protobuf.Field): field is TextMapField {
  return field.map === true && typeof (field as { keyType?: unknown }).keyType === 'string';
}

export function encodeMessage(type: protobuf.Type, msg: unknown, level = 0): string {
  if (msg === null || typeof msg !== 'object') return '';
  const pad = INDENT.repeat(level);
  const obj = msg as Record<string, unknown>;
  const lines: string[] = [];
  for (const field of type.fieldsArray) {
    field.resolve();
    const value = obj[field.name];
    if (value === null || value === undefined) continue;
    if (isMapField(field)) {
      appendMapField(lines, field, value, level, pad);
    } else if (field.repeated) {
      if (!Array.isArray(value)) continue;
      for (const item of value) appendField(lines, field, item, level, pad);
    } else {
      appendField(lines, field, value, level, pad);
    }
  }
  return lines.join('\n');
}

function appendMapField(
  lines: string[],
  field: TextMapField,
  value: unknown,
  level: number,
  pad: string,
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;

  const entryPad = INDENT.repeat(level + 1);
  for (const [key, mapValue] of Object.entries(value as Record<string, unknown>)) {
    const entryLines = [`${entryPad}key: ${encodeMapKey(field.keyType, key)}`];
    if (field.resolvedType instanceof protobuf.Type) {
      const inner = encodeMessage(field.resolvedType, mapValue, level + 2);
      if (inner.length === 0) {
        entryLines.push(`${entryPad}value {\n${entryPad}}`);
      } else {
        entryLines.push(`${entryPad}value {\n${inner}\n${entryPad}}`);
      }
    } else if (field.resolvedType instanceof protobuf.Enum) {
      const name = field.resolvedType.valuesById[mapValue as number];
      entryLines.push(`${entryPad}value: ${name ?? String(mapValue)}`);
    } else {
      entryLines.push(`${entryPad}value: ${encodeScalar(field.type, mapValue)}`);
    }
    lines.push(`${pad}${field.name} {\n${entryLines.join('\n')}\n${pad}}`);
  }
}

function appendField(
  lines: string[],
  field: protobuf.Field,
  value: unknown,
  level: number,
  pad: string,
): void {
  if (field.resolvedType instanceof protobuf.Type) {
    const inner = encodeMessage(field.resolvedType, value, level + 1);
    if (inner.length === 0) {
      lines.push(`${pad}${field.name} {\n${pad}}`);
    } else {
      lines.push(`${pad}${field.name} {\n${inner}\n${pad}}`);
    }
  } else if (field.resolvedType instanceof protobuf.Enum) {
    const name = field.resolvedType.valuesById[value as number];
    lines.push(`${pad}${field.name}: ${name ?? String(value)}`);
  } else {
    lines.push(`${pad}${field.name}: ${encodeScalar(field.type, value)}`);
  }
}

function encodeMapKey(type: string, key: string): string {
  if (type === 'string') return encodeQuoted(key);
  if (type === 'bool') return key === 'true' ? 'true' : 'false';
  return key;
}

function encodeScalar(type: string, value: unknown): string {
  switch (type) {
    case 'string':
      return encodeQuoted(String(value));
    case 'bytes':
      return encodeQuoted(bytesToLatin1(value));
    case 'bool':
      return value ? 'true' : 'false';
    case 'float':
    case 'double': {
      const n = Number(value);
      if (Number.isNaN(n)) return 'nan';
      if (n === Infinity) return 'inf';
      if (n === -Infinity) return '-inf';
      return n.toString();
    }
    default:
      return String(value);
  }
}

function bytesToLatin1(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) {
    let s = '';
    for (let i = 0; i < value.length; i++) s += String.fromCharCode(value[i]!);
    return s;
  }
  if (Array.isArray(value)) {
    let s = '';
    for (const b of value) s += String.fromCharCode(b as number);
    return s;
  }
  return '';
}

function encodeQuoted(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0d) out += '\\r';
    else if (c === 0x09) out += '\\t';
    else if (c >= 0x20 && c < 0x7f) out += String.fromCharCode(c);
    else if (c < 0x100) out += `\\${c.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(c);
  }
  return `${out}"`;
}
