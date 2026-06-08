import { beforeEach, describe, expect, it } from 'vitest';
import { useProjDialogStore } from '../projDialogStore';

const initialState = useProjDialogStore.getState();

beforeEach(() => {
  useProjDialogStore.setState(
    {
      ...initialState,
      pending: false,
      resolver: null,
    },
    true,
  );
});

describe('projDialogStore', () => {
  it('opens a pending request and resolves it with the selected projection', async () => {
    const request = useProjDialogStore.getState().request();

    expect(useProjDialogStore.getState().pending).toBe(true);
    expect(useProjDialogStore.getState().resolver).toEqual(expect.any(Function));

    useProjDialogStore.getState().resolve('+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs');

    await expect(request).resolves.toBe('+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs');
    expect(useProjDialogStore.getState().pending).toBe(false);
    expect(useProjDialogStore.getState().resolver).toBeNull();
  });

  it('resolves cancellation to null', async () => {
    const request = useProjDialogStore.getState().request();

    useProjDialogStore.getState().resolve(null);

    await expect(request).resolves.toBeNull();
    expect(useProjDialogStore.getState().pending).toBe(false);
  });

  it('cancels the previous request when a new one starts', async () => {
    const first = useProjDialogStore.getState().request();
    const firstResolver = useProjDialogStore.getState().resolver;
    const second = useProjDialogStore.getState().request();

    await expect(first).resolves.toBeNull();
    expect(useProjDialogStore.getState().pending).toBe(true);
    expect(useProjDialogStore.getState().resolver).not.toBe(firstResolver);

    useProjDialogStore.getState().resolve('custom-proj');
    await expect(second).resolves.toBe('custom-proj');
  });

  it('is a no-op to resolve when no request is pending', () => {
    expect(() => useProjDialogStore.getState().resolve('unused')).not.toThrow();
    expect(useProjDialogStore.getState().pending).toBe(false);
    expect(useProjDialogStore.getState().resolver).toBeNull();
  });
});
