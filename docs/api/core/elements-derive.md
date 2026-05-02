# Elements: derive

> Source: `src/core/elements/derive/{index,types}.ts` + `derive/rules/{lane,parkingSpace}.ts`

## Overview

The derive engine recomputes editor-side fields from the underlying
geometry whenever an entity is created or its geometry edited. It runs
_after_ the factory or vertex move, _before_ the mutation is committed
to `mapStore`. The motivating example: when a user drags a lane
endpoint, `lane.length` (the proto-level cached arc length) and
`lane.turn` should update without forcing the user to re-enter them via
the inspector.

The pipeline is a tiny rule registry:

1. `applyDerive(entity, ctx)` looks up rules registered for
   `entity.entityType`.
2. Each rule declares `owns: string[]` — paths it writes to.
3. If any owned path appears in the entity's `_userOverrides[]` array,
   the rule is **skipped** — manual edits trump auto-derivation.
4. Surviving rules are folded in declaration order; each is a pure
   `(entity, ctx) => entity` transform.

`markUserOverride(entity, path)` and `clearUserOverride(entity, path)`
are the helpers Inspector forms call when the user manually patches a
field that a rule owns.

::: info Why a registry instead of inlined factory code
The same pipeline runs on `create` and on every `editGeometry`. Factories
already ship correct values, but vertex drags do not — without `derive`,
`lane.length` would silently desync from `centralCurve` until the next
import/export round-trip, and `lane.turn` would freeze on its initial
value forever.
:::

## Exports

### Types

#### `DeriveCause`

```ts
type DeriveCause = 'create' | 'editGeometry' | 'editAttribute';
```

- `create` — factory just produced a fresh entity.
- `editGeometry` — vertex drag, move, deleteVertex, source-aware edit.
- `editAttribute` — inspector form patch (rare; reserved).

#### `DeriveContext<E>`

```ts
interface DeriveContext<E extends MapEntity> {
  cause: DeriveCause;
  prev?: E; // entity state before the change
  changedPaths?: readonly string[]; // for editAttribute (rare)
}
```

#### `DeriveRule<E>`

```ts
interface DeriveRule<E extends MapEntity> {
  id: string; // stable id for debugging
  owns: readonly string[]; // field paths this rule writes
  on?: readonly DeriveCause[]; // default: ['create', 'editGeometry']
  apply(entity: E, ctx: DeriveContext<E>): E; // pure
}
```

### Functions

#### `applyDerive<E>(entity: E, ctx: DeriveContext<E>): E`

Run the registered rules for `entity.entityType` and return the folded
entity. No-op if no rules are registered.

#### `markUserOverride<E>(entity: E, path: string): E`

Append `path` to the entity's `_userOverrides` (idempotent). Returns the
same reference if the path was already present.

#### `clearUserOverride<E>(entity: E, path: string): E`

Remove `path` from `_userOverrides`. Returns the same reference if the
path was absent. Used when the user wants to release a field back to
auto-derivation.

## Behavior

- All rules are pure; the engine has no side effects beyond returning a
  new immutable entity.
- Default trigger set is `['create', 'editGeometry']`. A rule that opts
  in to `editAttribute` (none today) would also fire on inspector
  patches — useful for cross-field invariants but rare.
- Rule order matters within a single `entityType` — they are folded
  left-to-right in array order.
- Override gating is _path-prefix exact_ — `_userOverrides` must contain
  the literal path string declared in `rule.owns` for the rule to skip.
  Sub-path overrides (e.g. overriding `'leftBoundary.boundaryType'`
  while the rule owns the broader `'leftBoundary'`) are not currently
  supported; pin the exact path the rule names.

::: warning Overrides are append-only by Inspector convention
Inspector forms append paths via `markUserOverride` after the user
manually sets a field. The engine never adds them. If you bypass the
Inspector pipeline and write a field directly, derivation will continue
overwriting it on the next geometry edit.
:::

## Rule registry

Currently registered:

```ts
const REGISTRY = {
  lane: laneRules,
  parkingSpace: parkingSpaceRules,
};
```

### Lane rules

Three rules in declaration order:

#### `lane.length`

- **Owns**: `['length']`
- **Triggers**: default (`create`, `editGeometry`)
- **Computes**: `polylineLengthMeters(centralCurve)` — haversine-summed
  metres along the centerline.
- **Skips work**: if the new value equals `e.length`, returns the same
  reference (downstream `===` checks treat as no-op).

#### `lane.turn`

- **Owns**: `['turn']`
- **Computes**: `inferLaneTurn(centerPts)` — start/end heading delta
  classifier.
  - `< TURN_INFER_NO_TURN_RAD` → `'NO_TURN'`
  - `>= TURN_INFER_U_TURN_RAD` → `'U_TURN'`
  - positive delta → `'LEFT_TURN'`
  - negative delta → `'RIGHT_TURN'`

#### `lane.boundarySeed`

- **Owns**: `['leftBoundary.boundaryType', 'rightBoundary.boundaryType']`
- **Triggers**: `['create']` only
- **Why create-only**: vertex drags shouldn't rewrite the
  `boundaryType` array the user may have populated via inspector — but
  fresh lanes need a sensible default at `s = 0` instead of `'UNKNOWN'`.
- **Computes**: seeds each empty side's `boundaryType` array with
  `[{ s: 0, types: [DEFAULT_LANE_BOUNDARY_TYPE] }]`. Idempotent on
  re-run.

### ParkingSpace rules

#### `parkingSpace.headingFromRect`

- **Owns**: `['heading']`
- **Triggers**: default
- **Why**: `ParkingSpaceEntity` drawn via `drawRotatedRect` carries a
  `_sourceRect: { p1, p2, rotation }` provenance. After a rotate-handle
  drag the rect's `rotation` is the canonical heading, so the inspector
  and exported proto agree without the user re-entering it.
- **Computes**: copies `_sourceRect.rotation` into `heading` (skipped if
  already equal, or if `_sourceRect` is absent).

## Examples

After a lane vertex drag (excerpt from `connectLanes.ts`):

```ts
import { applyDerive } from '@/core/elements/derive';

const next = writeCenterline(lane, newPoints, source);
return applyDerive(next, { cause: 'editGeometry', prev: lane }) as LaneEntity;
```

Inspector form pinning a manual override on lane.turn:

```ts
import { markUserOverride } from '@/core/elements/derive';

function onTurnChange(entity: LaneEntity, value: LaneTurn) {
  let next = { ...entity, turn: value };
  next = markUserOverride(next, 'turn');
  store.updateEntity(next);
}
```

Subsequent vertex drags will then skip the `lane.turn` rule because
`'turn'` is in `_userOverrides`. The inspector can later expose a
"Reset" button that calls `clearUserOverride(entity, 'turn')` to hand
the field back to derivation.

## Related

- [Geometry: connectLanes](/api/core/geometry-connect-lanes) — calls `applyDerive` after each endpoint move
- [Apollo compile factory](/api/core/geometry-apollo-compile) — `inferLaneTurn` lives here
- [lib/entityOps](/api/lib/entity-ops) — the proto-aware adapter that wraps create/update flows
