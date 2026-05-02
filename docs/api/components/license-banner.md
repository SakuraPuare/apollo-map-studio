# LicenseBanner

> Source: `src/components/license/LicenseBanner.tsx`

## Overview

`LicenseBanner` is the read-only horizontal strip mounted between the
menu bar and the tool strip. It surfaces license / trial state when
the user needs to see it and stays out of the way otherwise. The
banner reads `licenseStore.state` and decides whether to render based
on remaining time, status, and a small built-in heuristic for "quiet
during long-running activations".

Activation itself is delegated to
[`ActivationDialog`](/api/components/activation-dialog) — clicking
the banner's button calls `licenseStore.promptActivation()`.

## Component props

```ts
export function LicenseBanner(): JSX.Element | null;
```

No props. Self-subscribes to `useLicenseStore`.

## Behavior

### Visibility heuristic

```ts
if (state.status === 'activated' && state.license?.expires === 0) return null;
if (state.status === 'trial' && state.daysRemaining > 3) return null;
if (state.status === 'activated' && (state.daysRemaining === null || state.daysRemaining > 14)) {
  return null;
}
```

| Status                  | Banner shows when                        |
| ----------------------- | ---------------------------------------- |
| `activated` (perpetual) | never                                    |
| `activated` (expiring)  | when `daysRemaining ≤ 14`                |
| `trial`                 | when `daysRemaining ≤ 3` (or hours mode) |
| `expired_trial`         | always                                   |
| `expired_license`       | always                                   |
| `tampered`              | always                                   |
| `machine_mismatch`      | always                                   |
| `invalid`               | always                                   |
| `not_started`           | always                                   |

This keeps the banner quiet during a healthy long-license install and
loud when something needs the user's attention.

### Tone palette

```ts
const STATUS_TONE: Record<string, { bg, border, text, icon }> = {
  activated: { bg: emerald, icon: FaShield },
  trial:     { bg: cyan,    icon: FaClock },
  expired_*: { bg: amber,   icon: FaTriangleExclamation },
  tampered:  { bg: rose,    icon: FaTriangleExclamation },
  // ...
};
```

Three tone groups:

- **Green** (emerald) — activated.
- **Cyan / amber** — informational / expiring soon.
- **Rose** — must act now (tampered, machine mismatch, invalid sig).

### Message resolution

```ts
const message = (() => {
  switch (state.status) {
    case 'trial':
      return state.hoursRemaining <= 24
        ? `Trial ends in ${state.hoursRemaining}h — activate to keep editing`
        : `Trial: ${state.daysRemaining}d remaining`;
    case 'activated':
      return state.daysRemaining !== null
        ? `Licensed · ${state.daysRemaining}d remaining`
        : 'Licensed · perpetual';
    case 'expired_trial':
      return 'Trial expired — read-only mode. Activate to continue editing.';
    case 'expired_license':
      return 'License expired — read-only mode. Renew to continue editing.';
    case 'machine_mismatch':
      return 'License is bound to a different machine — read-only mode.';
    case 'tampered':
      return 'Tampering detected — read-only mode. Re-activation required.';
    case 'invalid':
      return 'License signature failed verification — read-only mode.';
    case 'not_started':
      return 'License pending — read-only mode.';
    default:
      return state.reason;
  }
})();
```

The hours-based message only kicks in for trial mode under 24h
remaining — fine-grained countdown so the user notices.

### Activate / Manage button

```tsx
{
  !state.canEdit ||
  state.status === 'trial' ||
  (state.status === 'activated' && state.daysRemaining <= 14) ? (
    <button onClick={() => promptActivation()}>
      <FaKey /> {state.status === 'activated' ? 'Manage license' : 'Activate'}
    </button>
  ) : null;
}
```

Three cases render the button:

- `!canEdit` — anything that requires action.
- `trial` — even with plenty of time, let the user pre-activate.
- `activated` with ≤14 days — renewal nudge.

### Read-only fallback integration

The banner doesn't enforce read-only itself — that's
[`assertEditable`](/api/lib/editable-guard) inside the action
dispatcher's `execute(...)`. The banner is purely a status surface;
it simply makes the read-only state hard to miss.

## Examples

### Mounting

```tsx
<LicenseBanner />
```

The banner reads `useLicenseStore` directly; `useLicenseSync` keeps
the store fresh.

### Forcing activation flow in tests

```ts
import { useLicenseStore } from '@/store/licenseStore';

useLicenseStore.getState().setState({
  ...defaultState,
  status: 'expired_trial',
  canEdit: false,
});
// Banner now renders amber strip with "Activate" button.
```

## Related

- [ActivationDialog](/api/components/activation-dialog)
- [licenseStore](/api/store/license-store)
- [useLicenseSync](/api/hooks/use-license)
- [editable-guard](/api/lib/editable-guard)
- [License manager](/api/electron/license-manager)
