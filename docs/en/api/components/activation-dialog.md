---
title: ActivationDialog
description: Activation modal — surfaces the machine code, accepts an Ed25519-signed activation token, and round-trips through licenseBridge to the Electron main process for verification, replay/binding checks, and persistence.
---

# ActivationDialog

> Source: `src/components/license/ActivationDialog.tsx`

## Purpose & UX role

`ActivationDialog` is the UI side of the offline activation flow:

1. **Show the machine code**: read from `licenseStore.state.machineCode`, with a Copy button (1.5s "Copied" feedback).
2. **Paste the activation token**: textarea accepts the `APMS1.eyJ…` Ed25519-signed token.
3. **Submit**: calls `licenseBridge.activate(trimmed)` → IPC → main process performs:
   - Ed25519 public-key verification
   - Replay detection (machine binding, expiry)
   - Persists `~/.config/apollo-map-studio/license.bin`
   - Returns the new `state` to the renderer
4. **Error display**: rose-toned error box showing the main-process `errorMessage`.
5. **Activated success block**: emerald `Activated · {license.name}` + expiry.
6. **Tampered hint**: amber footer pointing the user to check the system clock.

It **self-registers a global trigger** — on mount it calls `registerPromptActivation(...)`, so anywhere in the app calling `licenseStore.promptActivation()` opens this dialog (e.g. the LicenseBanner button, expiry modal, or a heartbeat from the main process).

## Component API

`ActivationDialog` takes no props:

```ts
export function ActivationDialog(): JSX.Element | null;
```

When `open=false` it returns `null` — the modal is removed from the DOM.

## Internal state

| `useState` / `useRef` | Type / initial    | Purpose                                        |
| --------------------- | ----------------- | ---------------------------------------------- |
| `open`                | `false`           | Visibility                                     |
| `code`                | `''`              | User-entered activation code                   |
| `busy`                | `false`           | Activation in flight — disables close + button |
| `copied`              | `false`           | Copy feedback (auto-resets after 1.5s)         |
| `error`               | `null \| string`  | Submit error                                   |
| `textareaRef`         | `React.RefObject` | Focus on open                                  |

| `useLicenseStore` field    | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `state`                    | Current license state                          |
| `setState`                 | Persist the state returned by the main process |
| `registerPromptActivation` | Register the "open the dialog" callback        |

## Side effects

| When                                    | Behavior                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `useEffect([registerPromptActivation])` | Registers `() => { setOpen(true); setError(null); }` as the global trigger                       |
| `useEffect([open, handleClose])` Esc    | While open, mounts a `keydown` listener; Esc → `handleClose`                                     |
| `useEffect([open])` focus               | After open, `setTimeout(() => textareaRef.current?.focus(), 50)` — wait for the dialog animation |
| `handleCopy`                            | `navigator.clipboard.writeText(state.machineCode)`; failure silently falls back to manual copy   |
| `handleActivate`                        | `licenseBridge.activate(code)` → handles `result.ok` / `result.errorMessage`                     |
| `handleClose`                           | Refuses to close while `busy=true`; otherwise closes and clears `code` / `error`                 |

## Render anatomy

```jsx
<div className="fixed inset-0 z-[100] flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
  <div className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
    <Header title="Apollo Map Studio License" hint={`status: ${status} · ${reason}`} onClose={handleClose} disabled={busy} />
    <div className="px-5 py-4 space-y-5">
      <Section title="This machine's code">
        <code className="…">{state.machineCode}</code>
        <button onClick={handleCopy}>Copy / Copied</button>
      </Section>
      {isActivated && license && (
        <Section emerald>
          <p>Activated · {license.name}</p>
          <p>id: {license.id} · expires: {license.expires === 0 ? 'never' : new Date(license.expires).toLocaleString()}</p>
        </Section>
      )}
      <Section title="Paste activation code">
        <textarea ref={textareaRef} … />
        {error && <ErrorBox icon={FaCircleExclamation}>{error}</ErrorBox>}
      </Section>
      {state.status === 'tampered' && <p className="text-amber">…re-activation required after correcting system clock…</p>}
    </div>
    <Footer onClose={handleClose} onActivate={handleActivate} busy={busy} disabled={code.trim().length === 0} />
  </div>
</div>
```

`z-[100]` matches [TaskProgressOverlay](./task-progress-overlay.md), but the two cannot coexist — ActivationDialog is **user-triggered**, while TaskProgress is a blocking progress bar.

## Performance notes

- **Always-mounted at root**: `WorkspaceLayout.tsx:179` always renders `<ActivationDialog />`, but the component returns `null` while `open=false`. **This is required** — otherwise the `registerPromptActivation` effect would never run and the global trigger would not exist.
- The textarea performs no real-time validation; errors only appear after the main process replies, avoiding false-positive "format wrong" feedback.

## Security notes

- The client does **not** verify the Ed25519 signature — every verification runs in the main process (see v1 commit 142ece9 "feat(license): add offline activation system with machine binding"). The client only does `trim().replace(/\s+/g, '')` cleanup of the input.
- `state.machineCode` is computed and exposed by the main process at startup — renderer tampering cannot change it.

## Known gaps

- No "re-request" flow — the user must rerun "copy code → email vendor → paste new token".
- No expiry/renewal UI — `expired_license` and `expired_trial` go through the same activation flow.
- No localization — every string is English.

## Source map

| Concern                 | File location                  |
| ----------------------- | ------------------------------ |
| Main component          | `ActivationDialog.tsx:15-214`  |
| Global trigger register | `ActivationDialog.tsx:35-40`   |
| Esc listener            | `ActivationDialog.tsx:43-53`   |
| Auto-focus              | `ActivationDialog.tsx:56-62`   |
| `handleCopy`            | `ActivationDialog.tsx:64-72`   |
| `handleActivate`        | `ActivationDialog.tsx:74-96`   |
| Activated state block   | `ActivationDialog.tsx:148-158` |
| Tampered hint           | `ActivationDialog.tsx:184-190` |
| `licenseBridge`         | `src/lib/license-bridge.ts`    |
| Main-process activation | `electron/main/license/*`      |

## Cross-references

- [WorkspaceLayout](./workspace-layout.md) — `<ActivationDialog />` is always mounted at the root
- [LicenseBanner](./license-banner.md) — primary entry point
- [`licenseStore`](/en/api/store/) — state machine
- License IPC contract → [`/en/api/electron`](/en/api/electron)
