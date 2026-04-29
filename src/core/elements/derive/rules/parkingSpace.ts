/**
 * Derivation rules for `ParkingSpaceEntity`.
 *
 *   1. `parkingSpace.heading` — when the entity carries a `_sourceRect`
 *      (drawn via `drawRotatedRect`), its rotation is the canonical
 *      heading. Keeping `heading` in sync after rotate-handle drags
 *      means the inspector and exported proto agree without the user
 *      having to re-enter it.
 */
import type { ParkingSpaceEntity } from '@/types/apollo';
import type { DeriveRule } from '../types';

const headingFromRectRule: DeriveRule<ParkingSpaceEntity> = {
  id: 'parkingSpace.headingFromRect',
  owns: ['heading'],
  apply: (e) => {
    const rect = e._sourceRect;
    if (!rect) return e;
    return rect.rotation === e.heading ? e : { ...e, heading: rect.rotation };
  },
};

export const parkingSpaceRules: DeriveRule<ParkingSpaceEntity>[] = [headingFromRectRule];
