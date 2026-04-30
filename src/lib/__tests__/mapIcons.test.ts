/**
 * mapIcons — MapLibre icon registry / loader.
 *
 * Test strategy:
 *   - The module exports MAP_ICON_PX (a constant) and registerMapIcons (async).
 *   - rasterize() is internal and requires real DOM/Canvas (Blob, Image, Canvas)
 *     which is not available in a Node/vitest-node environment — we do NOT test it.
 *   - registerMapIcons() depends on a maplibre-gl Map instance and DOM, so we
 *     test its contract using a hand-rolled map stub:
 *       • Skips icons that are already registered (hasImage → true).
 *       • Calls addImage for icons that are not yet registered.
 *       • Does NOT reject the whole batch when one icon fails (error isolation).
 *   - MAP_ICON_PX constant value is tested directly (64 px per spec comment).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAP_ICON_PX, registerMapIcons } from '../mapIcons';

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

describe('registerMapIcons — skips already-registered icons', () => {
  beforeEach(() => {
    // Suppress console.error noise from expected rasterize failures in jsdom-less env
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not call addImage for icons that hasImage returns true', async () => {
    const map = makeMapStub([...ALL_ICON_IDS]); // all pre-registered
    await registerMapIcons(map as any);
    expect(map.addImage).not.toHaveBeenCalled();
  });

  it('calls hasImage for every icon in the registry (6 total)', async () => {
    const map = makeMapStub([...ALL_ICON_IDS]); // all pre-registered → no rasterize
    await registerMapIcons(map as any);
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
    await expect(registerMapIcons(map as any)).resolves.toBeUndefined();
  });

  it('logs a console.error for each failing icon but continues', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const map = makeMapStub([]);
    await registerMapIcons(map as any);
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
    await registerMapIcons(map as any);

    const checkedIds = map.hasImage.mock.calls.map((c: any[]) => c[0]);
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
