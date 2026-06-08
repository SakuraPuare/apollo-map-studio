import * as protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';
import { apolloMapToLonLat } from '../adapter';
import { computeApolloMapBounds } from '../apolloGeoJson';
import { encodeMapBin } from '../binCodec';
import { getMapType } from '../loader';
import { UTM_PRESETS, utmZoneFromLon } from '../projection';
import { decodeMessage } from '../textCodec/decoder';
import { encodeMessage } from '../textCodec/encoder';
import { TokenStream } from '../textCodec/tokenStream';

const TEXT_SCHEMA = `
syntax = "proto3";
package branchtext;

enum State {
  UNKNOWN = 0;
  ON = 1;
}

message Child {
  string label = 1;
}

message Root {
  string name = 1;
  bytes payload = 2;
  double weight = 3;
  State state = 4;
  map<int32, string> ints = 5;
  map<string, Child> labels = 6;
}
`;

const TextRoot = protobuf.parse(TEXT_SCHEMA, { keepCase: true }).root.lookupType('branchtext.Root');

function decodeText(text: string): Record<string, unknown> {
  return decodeMessage(TextRoot, text);
}

describe('proto branch coverage fallbacks', () => {
  it('rejects invalid map objects before binary encoding', async () => {
    await expect(encodeMapBin({ header: { left: 'west' } })).rejects.toThrow('Map.verify failed');
  });

  it('reuses the resolved Apollo Map type from the loader cache', async () => {
    const first = await getMapType();
    const second = await getMapType();

    expect(first.fullName).toBe('.apollo.hdmap.Map');
    expect(second).toBe(first);
  });

  it('passes through malformed point-bearing adapter fields without crashing', async () => {
    const entityMeta = [] as unknown[];
    const rawMap: Record<string, unknown> = {
      lane: [
        null,
        {
          id: { id: 'bad-curve' },
          central_curve: 12,
        },
      ],
      editor_meta: {
        entity: entityMeta,
      },
    };

    const { map } = await apolloMapToLonLat(rawMap, UTM_PRESETS.sunnyvale);

    expect(map.lane).toEqual([null, { id: { id: 'bad-curve' }, central_curve: 12 }]);
    expect((map.editor_meta as { entity?: unknown }).entity).toEqual(entityMeta);
    expect((map.editor_meta as { entity?: unknown }).entity).not.toBe(entityMeta);
  });

  it('wraps longitudes before deriving UTM zones', () => {
    expect(utmZoneFromLon(181)).toBe(1);
    expect(utmZoneFromLon(-181)).toBe(60);
    expect(utmZoneFromLon(540)).toBe(60);
  });

  it('bounds barrier gates even when optional stop lines are absent', () => {
    expect(
      computeApolloMapBounds({
        barrier_gate: [
          {
            polygon: {
              point: [
                { x: -1, y: 2 },
                { x: 3, y: 4 },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      [-1, 2],
      [3, 4],
    ]);
  });

  it('covers text decoder parser fallbacks and malformed values', () => {
    expect(decodeText('; name: "road";')).toEqual({ name: 'road' });
    expect(() => decodeText('labels { : "bad" }')).toThrow('Expected map entry field');
    expect(() => decodeText('ints { key: bad value: "x" }')).toThrow(
      'Expected numeric key for ints',
    );
    expect(() => decodeText('state: "ON"')).toThrow('Expected enum');
    expect(() => decodeText('weight: "heavy"')).toThrow('Expected number for weight');
  });

  it('covers text encoder byte and non-ASCII quoting fallbacks', () => {
    const snowman = String.fromCharCode(0x2603);

    expect(encodeMessage(TextRoot, { payload: {} })).toBe('payload: ""');
    expect(encodeMessage(TextRoot, { name: snowman })).toBe(`name: "${snowman}"`);
  });

  it('parses partial hex and octal escapes without swallowing following characters', () => {
    const stream = new TokenStream(String.raw`hex: "\xG" oct: "\7x"`);

    stream.expect('identifier', 'hex');
    stream.expect('symbol', ':');
    expect(stream.expect('string').value).toBe('G');

    stream.expect('identifier', 'oct');
    stream.expect('symbol', ':');
    expect(stream.expect('string').value).toBe(`${String.fromCharCode(7)}x`);
  });
});
