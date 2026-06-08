import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, pickFile, pickFiles, readFileAsBytes } from '../fileIO';

type Listener = () => void;

class FakeInput {
  type = '';
  accept = '';
  multiple = false;
  style = { display: '' };
  files: File[] | null = null;
  clicked = false;
  removed = false;
  listeners = new Map<string, Listener>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  click(): void {
    this.clicked = true;
  }

  remove(): void {
    this.removed = true;
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.();
  }
}

class FakeAnchor {
  href = '';
  download = '';
  style = { display: '' };
  clicked = false;
  removed = false;

  click(): void {
    this.clicked = true;
  }

  remove(): void {
    this.removed = true;
  }
}

let created: Array<FakeInput | FakeAnchor> = [];
let appended: unknown[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  created = [];
  appended = [];
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      const element = tag === 'a' ? new FakeAnchor() : new FakeInput();
      created.push(element);
      return element;
    }),
    body: {
      appendChild: vi.fn((element: unknown) => {
        appended.push(element);
      }),
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fileIO', () => {
  it('picks the first selected file and removes the hidden input', async () => {
    const promise = pickFile('.bin');
    const input = created[0] as FakeInput;
    const selected = { name: 'base_map.bin' } as File;
    input.files = [selected];

    expect(input.type).toBe('file');
    expect(input.accept).toBe('.bin');
    expect(input.multiple).toBe(false);
    expect(input.style.display).toBe('none');
    expect(input.clicked).toBe(true);
    expect(appended).toEqual([input]);

    input.dispatch('change');

    await expect(promise).resolves.toBe(selected);
    expect(input.removed).toBe(true);
  });

  it('returns null for a cancelled single-file picker', async () => {
    const promise = pickFile('.txt');
    const input = created[0] as FakeInput;

    input.dispatch('cancel');

    await expect(promise).resolves.toBeNull();
    expect(input.removed).toBe(true);
  });

  it('picks multiple files and settles only once', async () => {
    const promise = pickFiles('.json');
    const input = created[0] as FakeInput;
    const first = { name: 'a.json' } as File;
    const second = { name: 'b.json' } as File;
    input.files = [first, second];

    expect(input.multiple).toBe(true);
    input.dispatch('change');
    input.files = [];
    input.dispatch('cancel');

    await expect(promise).resolves.toEqual([first, second]);
  });

  it('reads blobs as bytes', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);

    await expect(readFileAsBytes(blob)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it('downloads a blob and revokes the object URL after the delay', async () => {
    downloadBlob(new Blob(['hello']), 'map.bin');
    const anchor = created[0] as FakeAnchor;

    expect(anchor.href).toBe('blob:test-url');
    expect(anchor.download).toBe('map.bin');
    expect(anchor.style.display).toBe('none');
    expect(anchor.clicked).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    expect(anchor.removed).toBe(true);
  });
});
