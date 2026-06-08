import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useApolloMapStore,
  type ApolloMapHeader,
  type ApolloMapImportInfo,
} from '@/store/apolloMapStore';
import { MapMetadataForm } from '../MapMetadataForm';

function resetApolloMapStore() {
  useApolloMapStore.setState({
    header: null,
    bounds: null,
    info: null,
    lastError: null,
  });
}

function mockClientStoreSnapshot() {
  vi.spyOn(React, 'useSyncExternalStore').mockImplementation(((
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot()) as typeof React.useSyncExternalStore);
}

function importInfo(overrides: Partial<ApolloMapImportInfo> = {}): ApolloMapImportInfo {
  return {
    filename: 'apollo_map.bin',
    counts: { road: 2 },
    projString: '+proj=utm +zone=10',
    importedAt: Date.UTC(2024, 0, 2, 3, 4, 5),
    ...overrides,
  };
}

beforeEach(() => {
  resetApolloMapStore();
  mockClientStoreSnapshot();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApolloMapStore();
});

describe('MapMetadataForm SSR rendering', () => {
  it('renders the no-import notice when metadata is absent', () => {
    const html = renderToStaticMarkup(<MapMetadataForm />);

    expect(html).toContain('导入 Apollo 地图后');
    expect(html).not.toContain('来源信息');
  });

  it('renders source info, decoded bytes, camel-case revisions, and numeric bounds', () => {
    const header: ApolloMapHeader = {
      version: new TextEncoder().encode('v1.5'),
      date: '2026-06-08',
      district: 'sunnyvale',
      generation: 42,
      revMajor: '9',
      revMinor: new TextEncoder().encode('3'),
      vendor: 'Apollo',
      projection: { proj: new TextEncoder().encode('+proj=tmerc') },
      left: '116.125',
      top: 39.75,
      right: '116.5',
      bottom: 39.125,
    };
    useApolloMapStore.getState().setImported(importInfo(), null, header);

    const html = renderToStaticMarkup(<MapMetadataForm />);

    expect(html).toContain('来源信息');
    expect(html).toContain('apollo_map.bin');
    expect(html).toContain('+proj=utm +zone=10');
    expect(html).toContain('头部信息');
    expect(html).toContain('v1.5');
    expect(html).toContain('2026-06-08');
    expect(html).toContain('sunnyvale');
    expect(html).toContain('42');
    expect(html).toContain('+proj=tmerc');
    expect(html).toContain('116.125000');
    expect(html).toContain('39.750000');
    expect(html).toContain('116.500000');
    expect(html).toContain('39.125000');
  });

  it('prefers snake-case revisions and formats missing or invalid values as dashes', () => {
    const header: ApolloMapHeader = {
      version: '',
      date: null,
      district: undefined,
      generation: { source: 'test' },
      rev_major: 'snake-major',
      revMajor: 'camel-major',
      rev_minor: 'snake-minor',
      revMinor: 'camel-minor',
      projection: null,
      left: '',
      top: Number.POSITIVE_INFINITY,
      right: 'not-a-number',
      bottom: null,
    };
    useApolloMapStore
      .getState()
      .setImported(importInfo({ filename: 'empty.pb.txt' }), null, header);

    const html = renderToStaticMarkup(<MapMetadataForm />);

    expect(html).toContain('empty.pb.txt');
    expect(html).toContain('snake-major');
    expect(html).toContain('snake-minor');
    expect(html).not.toContain('camel-major');
    expect(html).not.toContain('camel-minor');
    expect(html).toContain('[object Object]');
    expect((html.match(/>—</g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('falls back to a dash when byte decoding throws', () => {
    const decode = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation(() => {
      throw new TypeError('bad bytes');
    });

    useApolloMapStore.getState().setImported(importInfo(), null, {
      version: new Uint8Array([0xff]),
      projection: { proj: new Uint8Array([0xff]) },
    });

    const html = renderToStaticMarkup(<MapMetadataForm />);

    expect(decode).toHaveBeenCalled();
    expect((html.match(/>—</g) ?? []).length).toBeGreaterThanOrEqual(10);
  });
});
