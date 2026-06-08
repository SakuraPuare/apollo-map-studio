/**
 * mapIcons — MapLibre icon registry / loader.
 *
 * Test strategy:
 *   - The module exports MAP_ICON_PX (a constant) and registerMapIcons (async).
 *   - rasterize() is internal and requires real DOM/Canvas (Blob, Image, Canvas),
 *     so branch tests stub those browser APIs instead of requiring a real renderer.
 *   - registerMapIcons() depends on a maplibre-gl Map instance and DOM, so we
 *     test its contract using a hand-rolled map stub:
 *       • Skips icons that are already registered (hasImage → true).
 *       • Calls addImage for icons that are not yet registered.
 *       • Does NOT reject the whole batch when one icon fails (error isolation).
 *   - MAP_ICON_PX constant value is tested directly (64 px per spec comment).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAP_ICON_PX, registerMapIcons } from '../mapIcons';

afterEach(() => {
  vi.doUnmock('react-dom/server');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── MAP_ICON_PX constant ──────────────────────────────────────────────────────

describe('MAP_ICON_PX', () => {
  it('equals 64', () => {
    expect(MAP_ICON_PX).toBe(64);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(MAP_ICON_PX)).toBe(true);
    expect(MAP_ICON_PX).toBeGreaterThan(0);
  });
});

// ── REGISTRY keys (via registerMapIcons behaviour) ────────────────────────────

/** Minimal map stub. hasImage/addImage are vi.fn() for assertion. */
function makeMapStub(alreadyRegistered: string[] = []) {
  const addImage = vi.fn();
  return {
    hasImage: vi.fn((id: string) => alreadyRegistered.includes(id)),
    addImage,
    _addImage: addImage,
  };
}

/** All 6 icon IDs defined in the source REGISTRY. */
const ALL_ICON_IDS = [
  'icon-parking',
  'icon-signal',
  'icon-barrier',
  'icon-stop',
  'icon-yield',
  'icon-speed-bump',
] as const;

function stubUrlStatics(
  createObjectURL: (blob: Blob) => string,
  revokeObjectURL: (url: string) => void,
): void {
  const OriginalURL = globalThis.URL;
  class FakeURL extends OriginalURL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal('URL', FakeURL);
}

describe('registerMapIcons — skips already-registered icons', () => {
  beforeEach(() => {
    // Suppress console.error noise from expected rasterize failures in jsdom-less env
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not call addImage for icons that hasImage returns true', async () => {
    const map = makeMapStub([...ALL_ICON_IDS]); // all pre-registered
    await registerMapIcons(map);
    expect(map.addImage).not.toHaveBeenCalled();
  });

  it('calls hasImage for every icon in the registry (6 total)', async () => {
    const map = makeMapStub([...ALL_ICON_IDS]); // all pre-registered → no rasterize
    await registerMapIcons(map);
    expect(map.hasImage).toHaveBeenCalledTimes(6);
    for (const id of ALL_ICON_IDS) {
      expect(map.hasImage).toHaveBeenCalledWith(id);
    }
  });
});

describe('registerMapIcons — resolves without throwing on rasterize failure', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns a Promise that resolves (does not reject) even when rasterize fails', async () => {
    // In the test environment Blob/URL.createObjectURL/Image/Canvas are absent or
    // stub-only, so rasterize will throw. The module must swallow per-icon errors.
    const map = makeMapStub([]); // nothing pre-registered → triggers rasterize
    await expect(registerMapIcons(map)).resolves.toBeUndefined();
  });

  it('logs a console.error for each failing icon but continues', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const map = makeMapStub([]);
    await registerMapIcons(map);
    // At least one error should have been logged for each of the 6 icons that
    // failed rasterization in the headless test environment.
    expect(errorSpy.mock.calls.length).toBeGreaterThan(0);
    // Each logged call should include '[mapIcons]' prefix
    for (const call of errorSpy.mock.calls) {
      expect(String(call[0])).toMatch(/\[mapIcons\]/);
    }
  });
});

describe('registerMapIcons — icon ID contract', () => {
  it('all 6 expected icon IDs are checked on the map', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const map = makeMapStub([...ALL_ICON_IDS]); // pre-registered to avoid DOM ops
    await registerMapIcons(map);

    const checkedIds = map.hasImage.mock.calls.map(([id]) => id);
    for (const id of ALL_ICON_IDS) {
      expect(checkedIds).toContain(id);
    }
  });

  it('icon IDs are strings matching the icon-* naming convention', () => {
    for (const id of ALL_ICON_IDS) {
      expect(id).toMatch(/^icon-[a-z-]+$/);
    }
  });
});

describe('registerMapIcons — successful rasterization path', () => {
  function stubRasterDom() {
    const imageData = { width: MAP_ICON_PX, height: MAP_ICON_PX, data: new Uint8ClampedArray(4) };
    const ctx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => imageData),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
    };
    const createObjectURL = vi.fn(() => 'blob:icon');
    const revokeObjectURL = vi.fn();
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width: number;
      height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    stubUrlStatics(createObjectURL, revokeObjectURL);
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
        return canvas;
      }),
    });
    return { canvas, ctx, imageData, createObjectURL, revokeObjectURL };
  }

  it('adds rasterized icons and skips icons that appear after rasterization', async () => {
    const dom = stubRasterDom();
    const added = new Set<string>();
    const map = {
      hasImage: vi.fn((id: string) => id === 'icon-stop' || added.has(id)),
      addImage: vi.fn((id: string) => {
        added.add(id);
        return map;
      }),
    };

    await registerMapIcons(map);

    expect(dom.createObjectURL).toHaveBeenCalled();
    expect(dom.ctx.clearRect).toHaveBeenCalledWith(0, 0, MAP_ICON_PX, MAP_ICON_PX);
    expect(dom.ctx.drawImage).toHaveBeenCalled();
    expect(dom.ctx.getImageData).toHaveBeenCalledWith(0, 0, MAP_ICON_PX, MAP_ICON_PX);
    expect(map.addImage).toHaveBeenCalledWith('icon-parking', dom.imageData);
    expect(map.addImage).not.toHaveBeenCalledWith('icon-stop', expect.anything());
    expect(dom.revokeObjectURL).toHaveBeenCalled();
  });

  it('does not inject a duplicate xmlns when rendered SVG already has one', async () => {
    vi.resetModules();
    vi.doMock('react-dom/server', () => ({
      renderToStaticMarkup: vi.fn(() => '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    }));
    const blobs: Blob[] = [];
    const imageData = { width: MAP_ICON_PX, height: MAP_ICON_PX, data: new Uint8ClampedArray(4) };
    stubUrlStatics(
      vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:icon';
      }),
      vi.fn(),
    );
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          getImageData: vi.fn(() => imageData),
        })),
      })),
    });
    const { registerMapIcons: registerWithMockedRender } = await import('../mapIcons');
    const map = makeMapStub([]);

    await registerWithMockedRender(map);

    expect(await blobs[0]?.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(map.addImage).toHaveBeenCalledTimes(ALL_ICON_IDS.length);
  });
});

describe('registerMapIcons — rasterization error branches', () => {
  function stubImageLoad(url = 'blob:icon') {
    const createObjectURL = vi.fn(() => url);
    const revokeObjectURL = vi.fn();
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(
        readonly width: number,
        readonly height: number,
      ) {}

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    stubUrlStatics(createObjectURL, revokeObjectURL);
    vi.stubGlobal('Image', FakeImage);
    return { createObjectURL, revokeObjectURL };
  }

  it('logs failures and revokes object URLs when canvas has no 2d context', async () => {
    const url = stubImageLoad();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const map = makeMapStub([]);
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    });

    await registerMapIcons(map);

    expect(map.addImage).not.toHaveBeenCalled();
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(url.revokeObjectURL).toHaveBeenCalledTimes(ALL_ICON_IDS.length);
    expect(errorSpy).toHaveBeenCalledTimes(ALL_ICON_IDS.length);
  });

  it('logs image load failures before attempting to create a canvas', async () => {
    const createObjectURL = vi.fn(() => 'blob:broken-icon');
    const revokeObjectURL = vi.fn();
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    const createElement = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const map = makeMapStub([]);

    stubUrlStatics(createObjectURL, revokeObjectURL);
    vi.stubGlobal('Image', FailingImage);
    vi.stubGlobal('document', { createElement });

    await registerMapIcons(map);

    expect(map.addImage).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledTimes(ALL_ICON_IDS.length);
    expect(errorSpy).toHaveBeenCalledTimes(ALL_ICON_IDS.length);
    for (const call of errorSpy.mock.calls) {
      expect(call[1]).toBeInstanceOf(Error);
      expect((call[1] as Error).message).toBe('icon svg load failed');
    }
  });
});
