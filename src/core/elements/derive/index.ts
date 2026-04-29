/**
 * Element derivation engine.
 *
 *   `applyDerive(entity, ctx)`  is the single choke point through which
 * `create` and `editGeometry` events flow. It looks up the registered
 * rules for `entity.entityType`, filters them against the cause and
 * the entity's `_userOverrides` set, and folds them in declaration
 * order.
 *
 *   `markUserOverride(entity, path)` is the helper inspector forms call
 * after writing a field, so subsequent geometry edits don't clobber
 * the manual value.
 *
 * All rules are pure; this engine has no side effects beyond returning
 * a new immutable entity.
 */
import type { MapEntity } from '@/types/entities';
import type { DeriveContext, DeriveCause, DeriveRule } from './types';
import { laneRules } from './rules/lane';
import { parkingSpaceRules } from './rules/parkingSpace';

export type { DeriveCause, DeriveContext, DeriveRule } from './types';

const DEFAULT_TRIGGERS: readonly DeriveCause[] = ['create', 'editGeometry'];

const REGISTRY: Partial<Record<MapEntity['entityType'], DeriveRule<MapEntity>[]>> = {
  lane: laneRules as unknown as DeriveRule<MapEntity>[],
  parkingSpace: parkingSpaceRules as unknown as DeriveRule<MapEntity>[],
};

function readOverrides(entity: MapEntity): ReadonlySet<string> {
  const arr = (entity as { _userOverrides?: readonly string[] })._userOverrides;
  return arr && arr.length > 0 ? new Set(arr) : EMPTY_SET;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Run the registered derive rules for `entity.entityType` and return
 * the folded entity. No-op if no rules are registered.
 */
export function applyDerive<E extends MapEntity>(entity: E, ctx: DeriveContext<E>): E {
  const rules = REGISTRY[entity.entityType];
  if (!rules || rules.length === 0) return entity;

  const overrides = readOverrides(entity);
  let next: MapEntity = entity;

  for (const rule of rules) {
    const triggers = rule.on ?? DEFAULT_TRIGGERS;
    if (!triggers.includes(ctx.cause)) continue;
    if (rule.owns.some((path) => overrides.has(path))) continue;
    next = rule.apply(next, ctx as DeriveContext<MapEntity>);
  }

  return next as E;
}

/**
 * Tag `path` into the entity's `_userOverrides`, idempotently. Inspector
 * forms call this when the user manually sets a field that a rule owns.
 */
export function markUserOverride<E extends MapEntity>(entity: E, path: string): E {
  const arr = (entity as { _userOverrides?: readonly string[] })._userOverrides ?? [];
  if (arr.includes(path)) return entity;
  return { ...entity, _userOverrides: [...arr, path] } as E;
}

/**
 * Remove `path` from `_userOverrides` (used if the user wants to
 * "release" a field back to auto-derivation). Returns the same
 * reference if `path` was absent.
 */
export function clearUserOverride<E extends MapEntity>(entity: E, path: string): E {
  const arr = (entity as { _userOverrides?: readonly string[] })._userOverrides;
  if (!arr || !arr.includes(path)) return entity;
  const next = arr.filter((p) => p !== path);
  return { ...entity, _userOverrides: next.length > 0 ? next : undefined } as E;
}
