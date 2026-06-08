import { useRef } from 'react';

interface StableRow<T extends object> {
  item: T;
  rowKey: string;
  index: number;
}

interface PreviousRow<T extends object> {
  item: T;
  rowKey: string;
  signature: string;
}

/**
 * Keeps React row identity stable for editable arrays whose persisted model has no row ids.
 */
export function useStableRowKeys<T extends object>(
  items: readonly T[],
  keyPrefix: string,
  getSignature: (item: T) => string,
): StableRow<T>[] {
  const previousRows = useRef<PreviousRow<T>[]>([]);
  const itemKeys = useRef<WeakMap<T, string> | null>(null);
  const keyPrefixRef = useRef(keyPrefix);
  const nextId = useRef(0);

  if (itemKeys.current === null) itemKeys.current = new WeakMap();

  if (keyPrefixRef.current !== keyPrefix) {
    previousRows.current = [];
    itemKeys.current = new WeakMap();
    keyPrefixRef.current = keyPrefix;
    nextId.current = 0;
  }

  const previous = previousRows.current;
  const usedPrevious = new Set<number>();
  const sameLength = previous.length === items.length;

  const rows = items.map((item, index) => {
    const signature = getSignature(item);
    let rowKey = itemKeys.current!.get(item);

    if (rowKey) {
      const matchingPreviousIndex = previous.findIndex(
        (row, rowIndex) => !usedPrevious.has(rowIndex) && row.rowKey === rowKey,
      );
      if (matchingPreviousIndex >= 0) usedPrevious.add(matchingPreviousIndex);
    } else {
      const matchingPreviousIndex = previous.findIndex(
        (row, rowIndex) => !usedPrevious.has(rowIndex) && row.signature === signature,
      );

      if (matchingPreviousIndex >= 0) {
        usedPrevious.add(matchingPreviousIndex);
        rowKey = previous[matchingPreviousIndex]!.rowKey;
      } else if (sameLength && previous[index]) {
        usedPrevious.add(index);
        rowKey = previous[index].rowKey;
      } else {
        rowKey = `${keyPrefix}-${nextId.current}`;
        nextId.current += 1;
      }

      itemKeys.current!.set(item, rowKey);
    }

    return { item, rowKey, index };
  });

  previousRows.current = rows.map(({ item, rowKey }) => ({
    item,
    rowKey,
    signature: getSignature(item),
  }));

  return rows;
}
