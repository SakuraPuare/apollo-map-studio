import * as protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';
import { decodeMessage } from '../textCodec/decoder';
import { encodeMessage } from '../textCodec/encoder';
import { TokenStream } from '../textCodec/tokenStream';

const SCHEMA = `
syntax = "proto3";
package textcodec;

message Child {
  string label = 1;
  repeated int32 values = 2;
}

enum State {
  UNKNOWN = 0;
  ON = 1;
  OFF = 2;
}

message Root {
  string name = 1;
  bytes payload = 2;
  repeated int32 numbers = 3;
  repeated double weights = 4;
  bool flag = 5;
  State state = 6;
  Child child = 7;
  repeated Child children = 8;
  map<string, Child> labels = 9;
  map<bool, int32> bools = 10;
  map<int32, string> ints = 11;
  map<string, State> states = 12;
  double special = 13;
  float fraction = 14;
  uint32 count = 15;
  sint64 signed = 16;
  map<string, string> strings = 17;
  map<string, bytes> byte_map = 18;
  map<string, bool> flags = 19;
}
`;

const root = protobuf.parse(SCHEMA, { keepCase: true }).root;
const Root = root.lookupType('textcodec.Root');

function decode(text: string): Record<string, unknown> {
  return decodeMessage(Root, text);
}

describe('TokenStream edge cases', () => {
  it('skips comments and whitespace while reading escapes, symbols, and numeric tokens', () => {
    const stream = new TokenStream(String.raw`
      # leading comment
      name: "line\n\x41\101\"\\"
      single: 'tab\t\q'
      values: [-2, +.5, 0x10, 1.25e-3F, -inf, +nan]
    `);

    expect(stream.expect('identifier', 'name')).toEqual({ kind: 'identifier', value: 'name' });
    stream.expect('symbol', ':');
    expect(stream.expect('string').value).toBe('line\nAA"\\');

    stream.expect('identifier', 'single');
    stream.expect('symbol', ':');
    expect(stream.expect('string').value).toBe('tab\tq');

    stream.expect('identifier', 'values');
    stream.expect('symbol', ':');
    stream.expect('symbol', '[');
    expect(stream.expect('number').value).toBe('-2');
    stream.expect('symbol', ',');
    expect(stream.expect('number').value).toBe('+.5');
    stream.expect('symbol', ',');
    expect(stream.expect('number').value).toBe('0x10');
    stream.expect('symbol', ',');
    expect(stream.expect('number').value).toBe('1.25e-3F');
    stream.expect('symbol', ',');
    expect(stream.expect('number').value).toBe('-inf');
    stream.expect('symbol', ',');
    expect(stream.expect('number').value).toBe('+nan');
    stream.expect('symbol', ']');
    expect(stream.consume()).toBeNull();
  });

  it('reports malformed token input with useful errors', () => {
    expect(() => new TokenStream('@').consume()).toThrow('Unexpected character "@"');
    expect(() => new TokenStream('"unterminated').consume()).toThrow('Unterminated string');
    expect(() => new TokenStream('name').expect('symbol', ':')).toThrow('Expected symbol ":"');
    expect(() => new TokenStream('').expect('identifier')).toThrow('Expected identifier, got EOF');
  });
});

describe('decodeMessage text-format edge cases', () => {
  it('decodes comments, nested braces, repeated lists, numeric forms, and map entries', () => {
    const decoded = decode(String.raw`
      # Unknown scalar/list/message fields are skipped.
      ignored_scalar: "skip me"
      ignored_list: [1, [2, 3], 4]
      ignored_message {
        nested < value: [1, 2] >
      }

      name: 'road\nA'
      payload: "\000\377A"
      numbers: [1, 2]
      numbers: -3
      numbers: 0x10
      weights: [.5, 1e2, +nan]
      weights: inf
      flag: True
      state: 0x2
      child < label: "primary" values: [4, 5] >
      children { label: "first" }
      children: < label: "second" values: 6 values: [7, 8] >
      labels { key: "filled" value { label: "mapped" values: [9] } unknown: "field" ; }
      labels: < key: "defaulted" >
      bools { key: t value: 9 }
      bools { key: 0 value: 11 }
      ints { key: -7 value: "negative" }
      ints { key: 0x10 value: "hex" }
      states { key: "mode" value: OFF }
      states { key: "defaulted" }
      strings { key: "empty" }
      byte_map { key: "empty" }
      flags { key: "empty" }
      special: -nan
      fraction: 1.25f
      count: +0x2a
      signed: -0x7b
    `);

    expect(decoded.name).toBe('road\nA');
    expect(decoded.payload).toEqual(new Uint8Array([0, 255, 65]));
    expect(decoded.numbers).toEqual([1, 2, -3, 16]);

    const weights = decoded.weights as number[];
    expect(weights[0]).toBe(0.5);
    expect(weights[1]).toBe(100);
    expect(weights[2]).toBeNaN();
    expect(weights[3]).toBe(Infinity);

    expect(decoded.flag).toBe(true);
    expect(decoded.state).toBe(2);
    expect(decoded.child).toEqual({ label: 'primary', values: [4, 5] });
    expect(decoded.children).toEqual([{ label: 'first' }, { label: 'second', values: [6, 7, 8] }]);
    expect(decoded.labels).toEqual({
      filled: { label: 'mapped', values: [9] },
      defaulted: {},
    });
    expect(decoded.bools).toEqual({ true: 9, false: 11 });
    expect(decoded.ints).toEqual({ '-7': 'negative', '16': 'hex' });
    expect(decoded.states).toEqual({ mode: 2, defaulted: 0 });
    expect(decoded.strings).toEqual({ empty: '' });
    expect(decoded.byte_map).toEqual({ empty: new Uint8Array() });
    expect(decoded.flags).toEqual({ empty: false });
    expect(decoded.special).toBeNaN();
    expect(decoded.fraction).toBe(1.25);
    expect(decoded.count).toBe(42);
    expect(decoded.signed).toBe(-123);
  });

  it('reports parser errors for malformed field values and skipped unknown blocks', () => {
    expect(() => decode(':')).toThrow('Expected field name');
    expect(() => decode('child { label: "open"')).toThrow('Unexpected EOF inside message');
    expect(() => decode('child: [ label: "wrong opener" ]')).toThrow("Expected '{' or '<'");
    expect(() => decode('ignored { nested < value: 1')).toThrow(
      'Unterminated braces in unknown field',
    );
    expect(() => decode('ignored: [1, [2]')).toThrow('Unterminated list');
    expect(() => decode('name: 123')).toThrow('Expected string for name');
    expect(() => decode('payload: true')).toThrow('Expected bytes string for payload');
    expect(() => decode('flag: "true"')).toThrow('Expected bool for flag');
    expect(() => decode('state: MAYBE')).toThrow('Unknown enum value "MAYBE"');
    expect(() => decode('labels { value { label: "missing key" } }')).toThrow(
      'Missing key for map field labels',
    );
    expect(() => decode('labels { key: 1 value { label: "bad key" } }')).toThrow(
      'Expected string key for labels',
    );
    expect(() => decode('bools { key: "yes" value: 1 }')).toThrow('Expected bool key for bools');
    expect(() => decode('numbers: [1, 2')).toThrow('Expected value, got EOF');
  });
});

describe('encodeMessage text-format edge cases', () => {
  it('encodes nested messages, repeated fields, maps, bytes, strings, and special numbers', () => {
    const text = encodeMessage(Root, {
      name: 'line\nquote"slash\\bell\x07',
      payload: new Uint8Array([0, 10, 34, 92, 255]),
      numbers: [1, 2],
      weights: [NaN, Infinity, -Infinity, 1.25],
      flag: false,
      state: 1,
      child: {},
      children: [{ label: 'kid', values: [7, 8] }],
      labels: { empty: {}, filled: { label: 'mapped' } },
      bools: { true: 1, false: 0 },
      ints: { 7: 'seven' },
      states: { known: 2, raw: 99 },
      special: -Infinity,
      fraction: 0.5,
      strings: { plain: 'text' },
      byte_map: { bytes: [65, 66] },
      flags: { truthy: true },
    });

    expect(text).toContain(String.raw`name: "line\nquote\"slash\\bell\007"`);
    expect(text).toContain(String.raw`payload: "\000\n\"\\\377"`);
    expect(text).toContain('weights: nan');
    expect(text).toContain('weights: inf');
    expect(text).toContain('weights: -inf');
    expect(text).toContain('flag: false');
    expect(text).toContain('state: ON');
    expect(text).toContain('child {\n}');
    expect(text).toContain('children {');
    expect(text).toContain('values: 7');
    expect(text).toContain('labels {\n  key: "empty"\n  value {\n  }\n}');
    expect(text).toContain('labels {\n  key: "filled"\n  value {\n    label: "mapped"\n  }\n}');
    expect(text).toContain('bools {\n  key: true\n  value: 1\n}');
    expect(text).toContain('bools {\n  key: false\n  value: 0\n}');
    expect(text).toContain('ints {\n  key: 7\n  value: "seven"\n}');
    expect(text).toContain('states {\n  key: "known"\n  value: OFF\n}');
    expect(text).toContain('states {\n  key: "raw"\n  value: 99\n}');
    expect(text).toContain('special: -inf');
    expect(text).toContain('fraction: 0.5');
    expect(text).toContain('byte_map {\n  key: "bytes"\n  value: "AB"\n}');

    const decoded = decode(text);
    expect(decoded.name).toBe('line\nquote"slash\\bell\x07');
    expect(decoded.payload).toEqual(new Uint8Array([0, 10, 34, 92, 255]));
    expect(decoded.labels).toEqual({ empty: {}, filled: { label: 'mapped' } });
    expect(decoded.states).toEqual({ known: 2, raw: 99 });
  });

  it('skips unsupported input shapes without emitting accidental fields', () => {
    expect(encodeMessage(Root, null)).toBe('');
    expect(encodeMessage(Root, 'not an object')).toBe('');

    const text = encodeMessage(Root, {
      name: undefined,
      numbers: 'not repeated',
      labels: ['not a map'],
      child: null,
      flag: true,
    });

    expect(text).toBe('flag: true');
  });
});
