import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, pickFile } from '../fileIO';

type Listener = () => void;

class FakeInput {
  type = '';
  accept = '';
  multiple = false;
  style = { display: '' };
  files: File[] | null = null;
  removed = false;
  listeners = new Map<string, Listener>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  click(): void {}

  remove(): void {
    this.removed = true;
    throw new Error('remove failed');
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.();
  }
}

class FakeAnchor {
  href = '';
  download = '';
  style = { display: '' };

  click(): void {}

  remove(): void {}
}

let created: Array<FakeInput | FakeAnchor> = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      const element = tag === 'a' ? new FakeAnchor() : new FakeInput();
      created.push(element);
      return element;
    }),
    body: {
      appendChild: vi.fn(),
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fileIO edge cases', () => {
  it('treats a change event without a FileList as cancelled and ignores remove failures', async () => {
    const promise = pickFile('.bin');
    const input = created[0] as FakeInput;

    input.files = null;
    input.dispatch('change');

    await expect(promise).resolves.toBeNull();
    expect(input.removed).toBe(true);
  });

  it('propagates object URL creation failures before creating a download anchor', () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error('object URL failed');
    });

    expect(() => downloadBlob(new Blob(['map']), 'map.bin')).toThrow('object URL failed');
    expect(document.createElement).not.toHaveBeenCalled();
    expect(document.body.appendChild).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
