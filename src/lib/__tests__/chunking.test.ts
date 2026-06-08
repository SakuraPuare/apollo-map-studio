import { describe, expect, it } from 'vitest';
import { chunkArray } from '../chunking';

describe('chunkArray', () => {
  it('yields stable chunks with offsets and total size', () => {
    expect([...chunkArray([1, 2, 3, 4, 5], 2)]).toEqual([
      { items: [1, 2], offset: 0, nextOffset: 2, total: 5 },
      { items: [3, 4], offset: 2, nextOffset: 4, total: 5 },
      { items: [5], offset: 4, nextOffset: 5, total: 5 },
    ]);
  });

  it('yields no chunks for empty input', () => {
    expect([...chunkArray([], 2)]).toEqual([]);
  });

  it('rejects non-positive or non-finite chunk sizes', () => {
    expect(() => [...chunkArray([1], 0)]).toThrow('chunkSize must be a positive number; got 0');
    expect(() => [...chunkArray([1], -1)]).toThrow('chunkSize must be a positive number; got -1');
    expect(() => [...chunkArray([1], Number.POSITIVE_INFINITY)]).toThrow(
      'chunkSize must be a positive number; got Infinity',
    );
  });
});
