import { describe, expect, it } from 'vitest';
import { shouldEmitVitePressLeanChunk } from './config';

describe('VitePress lean chunk emission guard', () => {
  it('accepts original markdown entry chunks', () => {
    expect(
      shouldEmitVitePressLeanChunk({
        type: 'chunk',
        isEntry: true,
        facadeModuleId: '/repo/docs/guide/getting-started.md',
        fileName: 'assets/guide_getting-started.abcd1234.js',
      }),
    ).toBe(true);
  });

  it('rejects generated lean chunks so they are not emitted as lean.lean assets', () => {
    expect(
      shouldEmitVitePressLeanChunk({
        type: 'chunk',
        isEntry: true,
        facadeModuleId: '/repo/docs/guide/getting-started.md',
        fileName: 'assets/guide_getting-started.abcd1234.lean.js',
      }),
    ).toBe(false);
  });

  it('rejects non-entry, non-markdown, non-asset, and non-js chunks', () => {
    const base = {
      type: 'chunk',
      isEntry: true,
      facadeModuleId: '/repo/docs/guide/getting-started.md',
      fileName: 'assets/guide_getting-started.abcd1234.js',
    };

    expect(shouldEmitVitePressLeanChunk({ ...base, type: 'asset' })).toBe(false);
    expect(shouldEmitVitePressLeanChunk({ ...base, isEntry: false })).toBe(false);
    expect(shouldEmitVitePressLeanChunk({ ...base, facadeModuleId: '/repo/src/main.ts' })).toBe(
      false,
    );
    expect(shouldEmitVitePressLeanChunk({ ...base, fileName: 'guide_getting-started.js' })).toBe(
      false,
    );
    expect(
      shouldEmitVitePressLeanChunk({
        ...base,
        fileName: 'assets/guide_getting-started.css',
      }),
    ).toBe(false);
  });
});
