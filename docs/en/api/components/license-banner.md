---
title: LicenseBanner
description: Top-of-window license banner — picks color and copy from licenseStore (status / daysRemaining / hoursRemaining) and exposes an activation button when needed.
---

# LicenseBanner

> Source: `src/components/license/LicenseBanner.tsx`

## Purpose & UX role

`LicenseBanner` is the slim strip between MenuBar and ToolStrip. It reads `useLicenseStore.state` and decides **whether** and **how** to show itself:

- `activated` + perpetual (`expires === 0`) → hidden
- `activated` + ≤14 days remaining → cyan/green "Manage license"
- `activated` + >14 days remaining → hidden
- `trial` + >3 days remaining → hidden
- `trial` + ≤3 days remaining → cyan; under 24h shows "Trial ends in Nh"
- `expired_trial` / `expired_license` → amber warning + Activate button
- `tampered` / `machine_mismatch` / `invalid` → rose blocking + escalated copy
- `not_started` → grey pending notice

Button copy varies: `Manage license` (activated but expiring) vs. `Activate` (everything else). Clicking calls `licenseStore.promptActivation()`, which ultimately opens [ActivationDialog](./activation-dialog.md).

## Component API

`LicenseBanner` takes no props — state comes entirely from `useLicenseStore`:

```ts
export function LicenseBanner(): JSX.Element | null;
```

## STATUS_TONE map

```ts
const STATUS_TONE: Record<string, { bg, border, text, icon }> = {
  activated: { … emerald …, icon: FaShield },
  trial: { … cyan …, icon: FaClock },
  expired_trial: { … amber …, icon: FaTriangleExclamation },
  expired_license: { … amber …, icon: FaTriangleExclamation },
  tampered: { … rose …, icon: FaTriangleExclamation },
  machine_mismatch: { … rose …, icon: FaTriangleExclamation },
  invalid: { … rose …, icon: FaTriangleExclamation },
  not_started: { … zinc …, icon: FaClock },
};
```

Unknown statuses fall back to the `trial` palette.

## Internal state

| Hook                                  | Purpose                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `useLicenseStore(s.state)`            | Whole license state object (status + license + daysRemaining + …) |
| `useLicenseStore(s.promptActivation)` | Triggers `ActivationDialog`                                       |

No `useEffect`.

## Side effects

None. Clicking the button calls `promptActivation`, a global callback that `ActivationDialog` registers via `registerPromptActivation` on mount.

## Visibility logic

```ts
if (state.status === 'activated' && state.license?.expires === 0) return null;
if (state.status === 'trial' && state.daysRemaining !== null && state.daysRemaining > 3)
  return null;
if (state.status === 'activated') {
  if (state.daysRemaining === null || state.daysRemaining > 14) return null;
}
```

Button visibility (`LicenseBanner.tsx:114-118`):

```ts
!state.canEdit ||
  state.status === 'trial' ||
  (state.status === 'activated' && state.daysRemaining !== null && state.daysRemaining <= 14);
```

## Message derivation

```ts
switch (state.status) {
  case 'trial':
    return state.hoursRemaining <= 24
      ? `Trial ends in ${state.hoursRemaining}h — activate to keep editing`
      : `Trial: ${state.daysRemaining}d remaining`;
  case 'activated':
    return state.daysRemaining
      ? `Licensed · ${state.daysRemaining}d remaining`
      : 'Licensed · perpetual';
  // … other statuses each have bespoke copy
  default:
    return state.reason; // raw reason from licenseStore
}
```

## Render anatomy

```jsx
<div
  className={`flex items-center justify-between px-4 py-1.5 border-b ${tone.bg} ${tone.border} ${tone.text}`}
>
  <div className="flex items-center gap-2 text-xs">
    <Icon className="w-3.5 h-3.5" />
    <span>{message}</span>
  </div>
  {showButton && (
    <button onClick={() => promptActivation()} className="…">
      <FaKey /> {state.status === 'activated' ? 'Manage license' : 'Activate'}
    </button>
  )}
</div>
```

## Performance notes

- Does not subscribe to high-frequency fields (e.g. `entities`); only `state` and `promptActivation` — these change a few times per day at most.
- Returns `null` most of the time — zero DOM cost when idle.

## Known gaps

- Does not display the exact expiry timestamp (only days/hours); users must open ActivationDialog to see the precise time.
- Network jitter is not distinguished — `tampered` and `machine_mismatch` both show as a rose blocker; users in a flaky-network scenario might mistakenly think they have been locked out.

## Source map

| Concern                  | File location               |
| ------------------------ | --------------------------- |
| Main component           | `LicenseBanner.tsx:63-130`  |
| `STATUS_TONE` map        | `LicenseBanner.tsx:5-56`    |
| Visibility early-returns | `LicenseBanner.tsx:67-74`   |
| Message derivation       | `LicenseBanner.tsx:79-105`  |
| Button visibility        | `LicenseBanner.tsx:114-118` |
| `licenseStore`           | `src/store/licenseStore.ts` |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — parent
- [ActivationDialog](./activation-dialog.md) — actual activation flow
- [`licenseStore`](/en/api/store) — state machine
- `useLicenseSync` → `src/hooks/useLicense.ts`
