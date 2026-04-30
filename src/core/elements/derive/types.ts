/**
 * Element derivation registry — types.
 *
 * Per-entity rules that recompute "owned" fields (e.g. `lane.turn`,
 * `lane.length`) from the underlying geometry. Rules run on three
 * triggers:
 *
 *   - `create`         : factory just produced a fresh entity
 *   - `editGeometry`   : vertex drag, move, deleteVertex, source-aware edit
 *   - `editAttribute`  : inspector form patch (rare; reserved)
 *
 * Override semantics: if any path in `DeriveRule.owns` appears in the
 * entity's `_userOverrides` array, the rule is skipped — manual edits
 * win over auto-derivation. Inspector writes are responsible for
 * appending to `_userOverrides` (see `applyFormValuesToEntity`).
 */
import type { MapEntity } from '@/types/entities';

export type DeriveCause = 'create' | 'editGeometry' | 'editAttribute';

export interface DeriveContext<E extends MapEntity> {
  cause: DeriveCause;
  /** Entity state before the change that triggered derivation (for diff-based gating). */
  prev?: E;
  /** Field paths the user just patched manually (used for `editAttribute`). */
  changedPaths?: readonly string[];
}

export interface DeriveRule<E extends MapEntity> {
  /** Stable id for debugging and dedup. */
  id: string;
  /** Field paths this rule writes to. Used for `_userOverrides` gating. */
  owns: readonly string[];
  /** Triggers this rule should run on. Default: `['create', 'editGeometry']`. */
  on?: readonly DeriveCause[];
  /** Pure transform; return a new entity (or the same reference if no-op). */
  apply(entity: E, ctx: DeriveContext<E>): E;
}
