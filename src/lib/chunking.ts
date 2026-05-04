export interface ArrayChunk<T> {
  items: T[];
  offset: number;
  nextOffset: number;
  total: number;
}

export function* chunkArray<T>(
  items: readonly T[],
  chunkSize: number,
): IterableIterator<ArrayChunk<T>> {
  if (!Number.isFinite(chunkSize) || chunkSize < 1) {
    throw new Error(`chunkSize must be a positive number; got ${chunkSize}`);
  }
  const total = items.length;
  for (let offset = 0; offset < total; offset += chunkSize) {
    const nextOffset = Math.min(offset + chunkSize, total);
    yield {
      items: items.slice(offset, nextOffset),
      offset,
      nextOffset,
      total,
    };
  }
}
