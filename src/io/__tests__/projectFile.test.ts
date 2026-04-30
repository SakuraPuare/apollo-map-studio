import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { decodeMapBin } from '../proto/binCodec';
import { packAms, unpackAms, AMS_VERSION } from '../projectFile';

const APOLLO_BIN = path.resolve(
  import.meta.dirname,
  '../__fixtures__/apollo/borregas_ave/base_map.bin',
);

function makeFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type });
}

describe('projectFile — .ams pack / unpack', () => {
  it.runIf(existsSync(APOLLO_BIN))(
    'round-trips the borregas map: decode → pack → unpack → decode',
    async () => {
      const original = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(original);
      const info = {
        filename: 'base_map.bin',
        counts: { lane: 60, road: 37 },
        projString: '+proj=utm +zone=10 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
        importedAt: Date.now(),
      };
      const blob = await packAms(decoded, info);
      expect(blob.type).toBe('application/zip');
      expect(blob.size).toBeGreaterThan(1000);

      const file = makeFile(blob, 'project.ams');
      const { rawEnuMap, manifest } = await unpackAms(file);
      expect(manifest.version).toBe(AMS_VERSION);
      expect(manifest.filename).toBe(info.filename);
      expect(manifest.projString).toBe(info.projString);
      expect((rawEnuMap as { lane: unknown[] }).lane.length).toBe(60);
    },
  );

  it('throws on a zip that lacks map.bin', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const onlyManifest = zipSync({
      'manifest.json': strToU8(JSON.stringify({ version: AMS_VERSION, filename: 'x' })),
    });
    const copy = new Uint8Array(onlyManifest.byteLength);
    copy.set(onlyManifest);
    const blob = new Blob([copy.buffer], { type: 'application/zip' });
    await expect(unpackAms(makeFile(blob, 'broken.ams'))).rejects.toThrow(/missing map.bin/);
  });

  it('preserves a small custom entitiesMeta payload', async () => {
    const fakeMap = { header: { version: new TextEncoder().encode('1.0') } };
    const info = {
      filename: 'tiny.bin',
      counts: {},
      projString: '+proj=utm +zone=10 +ellps=WGS84 +no_defs',
      importedAt: 12345,
    };
    const blob = await packAms(fakeMap, info, {
      bezier: { lane_1: { handles: [[1, 2]] } },
    });
    const { manifest } = await unpackAms(makeFile(blob, 't.ams'));
    expect(manifest.entitiesMeta).toEqual({ bezier: { lane_1: { handles: [[1, 2]] } } });
  });
});
