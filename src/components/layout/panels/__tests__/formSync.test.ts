import { describe, expect, it, vi } from 'vitest';
import {
  arraysShallowEqual,
  shouldSkipOptionalEnumWrite,
  syncFormValues,
} from '../InspectorForms/formSync';

describe('Inspector form sync helpers', () => {
  it('syncFormValues only writes fields whose value changed', () => {
    const values = { name: 'Main', count: 1, enabled: true };
    const methods = {
      getValues: vi.fn((name: keyof typeof values) => values[name]),
      setValue: vi.fn(),
    };

    syncFormValues(methods as never, { name: 'Main', count: 2, enabled: false });

    expect(methods.getValues).toHaveBeenCalledWith('name');
    expect(methods.getValues).toHaveBeenCalledWith('count');
    expect(methods.getValues).toHaveBeenCalledWith('enabled');
    expect(methods.setValue).toHaveBeenCalledTimes(2);
    expect(methods.setValue).toHaveBeenCalledWith('count', 2, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
    expect(methods.setValue).toHaveBeenCalledWith('enabled', false, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  });

  it('syncFormValues uses Object.is semantics for edge numeric values', () => {
    const methods = {
      getValues: vi.fn((name: string) => (name === 'nan' ? Number.NaN : -0)),
      setValue: vi.fn(),
    };

    syncFormValues(methods as never, { nan: Number.NaN, zero: 0 });

    expect(methods.setValue).toHaveBeenCalledTimes(1);
    expect(methods.setValue).toHaveBeenCalledWith('zero', 0, expect.any(Object));
  });

  it('shouldSkipOptionalEnumWrite handles undefined, unchanged, and fallback writes', () => {
    expect(shouldSkipOptionalEnumWrite(undefined, 'A', 'A')).toBe(true);
    expect(shouldSkipOptionalEnumWrite('A', 'A', 'B')).toBe(true);
    expect(shouldSkipOptionalEnumWrite('UNKNOWN', undefined, 'UNKNOWN')).toBe(true);
    expect(shouldSkipOptionalEnumWrite('B', undefined, 'UNKNOWN')).toBe(false);
    expect(shouldSkipOptionalEnumWrite('B', 'A', 'UNKNOWN')).toBe(false);
  });

  it('arraysShallowEqual compares length and item identity', () => {
    const item = { id: 'same' };
    expect(arraysShallowEqual([item], [item])).toBe(true);
    expect(arraysShallowEqual([item], [{ id: 'same' }])).toBe(false);
    expect(arraysShallowEqual([1, 2], [1])).toBe(false);
    expect(arraysShallowEqual([1, 2], [1, 3])).toBe(false);
  });
});
