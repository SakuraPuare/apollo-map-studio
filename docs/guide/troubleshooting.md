# Troubleshooting

Common issues and how to diagnose them. If you don't see your problem
here, the bug template at the [GitHub issues](https://github.com/<owner>/apollo-map-studio/issues)
page captures the right info to file a fresh report.

## Import / Export issues

### Imported map appears at the wrong location

**Cause:** Wrong projection. Either the imported header has a stale or
incorrect `+proj` string, or you picked the wrong UTM zone in the
projection picker.

**Diagnosis:**

1. Hover the apollo info indicator in the StatusBar to see the
   resolved PROJ string.
2. Compare to your fleet's expected projection.
3. Look at the bounds — are they where you expect them on the basemap?

**Fix:** Re-import with the correct projection. Press Cancel on the
picker only if you've reviewed the [Cancel = fallback projection
warning](/guide/coordinate-system#projection-picker-dialog).

### "Failed to parse PROJ.4 string"

**Cause:** The Apollo header's projection string contains characters
proj4 can't handle.

**Fix:** Re-import; the picker should appear. Paste a clean PROJ.4
string. If a clean string doesn't work, the issue may be in
`sanitizeProjString()` (`src/io/proto/projection.ts:10`) — file an
issue with the offending file.

### Import succeeds, but no entities appear

**Cause:** Either the file is a `routing_map` (topology only, no
geometry) or the bounds are far from your viewport.

**Diagnosis:**

1. Check the StatusBar entity count. If it's > 0, the entities are
   loaded but off-screen.
2. Check the Activity bar → Explorer panel. The Apollo HD-Map section
   shows per-type counts. If a type expected to be present (e.g.
   `lane`) shows 0, you imported the wrong file.

**Fix:** Pan/zoom to where the bounds are; or re-import a `base_map`
file.

### Export fails with "Nothing to export"

**Cause:** No imported map; the editor has no projection to use for
the UTM round-trip.

**Fix:** Import a sample Apollo map first (any one with the right
projection). The editor needs the projection in `apolloMapStore.info`
before exporting. Greenfield "draw from blank" is on the roadmap.

### Re-export of the same map produces different bytes

**Expected.** Apollo proto2 serialization is order-sensitive in some
cases, and the timestamp in the filename always changes. For
byte-equivalent diffs, use the `.txt` format instead — text proto is
line-stable.

## Drawing / FSM issues

### Click on the canvas does nothing

**Possible causes:**

1. License is in read-only mode. Check the LicenseBanner.
2. You're in `selected` state and clicked off the entity (which
   deselects but doesn't draw).
3. You clicked while in `Connect Lanes` mode but haven't picked a
   second lane yet.
4. The polygon tool rejected your click as a self-intersection
   (silent rejection — see [Drawing tools / Polygon](/guide/drawing-tools#tool-6-polygon)).

**Fix:** Check the StatusBar's mode indicator. If it doesn't say
"Draw: …", press your tool's shortcut (`B`, `A`, `R`, `G`, `P`).

### Double-click commits but loses my last point

**Was a bug.** The fix is in `src/core/fsm/editorMachine.ts:82-87`: the
input dedup now lives in `useMapEventRouter.isDuplicateInput`, and the
FSM no longer slices `drawPoints` on `DOUBLE_CLICK`. If you still see
this on the latest build, file a regression with the gesture details.

### Bezier handle drag never releases

**Cause:** Mouse-up fired outside the canvas (over the menu bar or a
panel), so the FSM never received `MOUSE_UP`. Subsequent
`MOUSE_MOVE` events keep updating the handle.

**Fix:** Press `Esc` to send `CANCEL`. The lane is discarded. Restart
the draw with the mouse-up inside the canvas.

### Arc commits at the wrong location

**Cause:** Arc geometry uses three points: start, mid, end. The
mid-point must be **inside** the arc (between start and end along the
curve). If you put it on the wrong side, you get the major arc.

**Fix:** Re-draw with the mid-point on the correct side. There's no
flip affordance.

### Polygon won't accept a click

**Cause:** Self-intersection guard. The proposed segment from the last
point to the cursor would cross an existing segment.

**Fix:** Move the cursor and try a different point. The cursor not
advancing is the affordance.

### Snap doesn't engage

**Possible causes:**

1. Snap is disabled (magnet icon in the ToolStrip). Toggle it on.
2. You're not in a draw or `editingPoint` state. Snap only fires in
   those states (see `src/hooks/mapEventRouter/snap.ts:11-13`).
3. The cursor is more than 8 pixels from any candidate. Zoom in to
   reduce the meter-equivalent of the snap radius.

**Fix:** Confirm via the StatusBar — when snap is on, it shows cyan;
off, it's gray. Zoom in past the cluttered region until candidates
are clearly within range.

### Lane endpoints "snap" but pred/succ aren't set

**Cause:** You snapped to a non-endpoint point on the existing lane,
or the snap was a `kind: 'edge'` snap rather than `kind: 'vertex'`.
Topology only writes pred/succ for endpoint-to-endpoint snaps.

**Fix:** Re-draw, ending exactly at the existing lane's start or end.
Or use [Connect Lanes](/guide/topology-and-junctions#a-connect-lanes-c)
to stitch the topology after the fact.

### Connect Lanes "fork" warning never appears

**Expected behavior.** The `AstartToBstart` (fork) and `AendToBend`
(merge) modes silently skip pred/succ writing. There's no UI warning
today. To verify which mode the editor chose, watch the lane's
predecessor / successor in the Inspector after Connect Lanes runs.

## Performance issues

### Drag handle drag is laggy

**Cause:** Cold-layer rebuild on every frame. With ≥ 5k entities, the
naive rebuild costs ~3 ms × N. The Phase E incremental decoration
(`ARCHITECTURE.md:150-164`) keeps this under 50 ms by re-decorating
only affected lanes.

**Diagnose:**

1. Open the dev console.
2. Watch for `[useColdLayer]` log lines reporting incremental vs full.
3. If full sync is firing on drag, file an issue — you've found a
   case where the junction graph isn't reusable.

### Import takes 30+ seconds

**Cause:** A large map (typically 10k+ lanes). Most of the cost is
proj4 transforms.

**Fix:** Check the progress overlay; the "Projecting coordinates"
phase is the dominant one. Wait it out. Long-term: split the map into
sub-maps geographically, or pre-process via Apollo's `dreamview` tools
to a smaller `sim_map`.

### "Failed to construct 'Worker': resource was blocked"

**Cause:** Worker scripts blocked by Content-Security-Policy or by an
unsigned source on Electron.

**Fix on web build:** check your reverse proxy / dev server for CSP
headers; whitelist `worker-src 'self' blob:`.

**Fix on Electron build:** ensure `webPreferences.contextIsolation` is
true and worker scripts ship inside the app bundle (the build
configuration handles this; if you're customizing, check
`electron/main.ts`).

### Memory growing unbounded across edits

**Cause:** Undo history. Every edit pushes a snapshot of
`mapStore.entities`. With `historyLimit = 1000` and a 10k-entity map,
each snapshot is ~10 MB.

**Fix:** Reduce `historyLimit` in [Settings](/guide/settings). The
default of 100 is conservative; 50 is reasonable for huge maps.

## License issues

### Activation succeeds but banner still says "expired"

**Cause:** Race between the renderer state hydration and the dialog
close.

**Fix:** Click another tab in the activity bar (forces a re-render),
or wait 1–2 seconds for `licenseBridge.onChange` to push the new
state.

### "Bound to a different machine"

**Cause:** Your machine code changed since the token was issued.
Common triggers: network card replacement, OS reinstall, container
hash change.

**Fix:** Open the activation dialog, copy the new machine code, send
to your vendor for a re-issued token.

### "Tampering detected"

**Cause:** System clock moved backward, or license files in
`userData/license/` were modified outside the editor.

**Fix:**

1. Correct your system clock to current real-world time.
2. Quit the editor.
3. Remove `userData/license/` (the file path varies by OS — see
   [License activation](/guide/license-activation)).
4. Restart and re-activate with your token.

::: warning Don't use NTP correction during a session
If your clock was off when the editor started, the tampered state
sticks for the session even if NTP corrects it. Restart after the
clock is right.
:::

### Trial expired but I just installed

**Cause:** Clock skew at install time put the trial start in the
future, then NTP correction moved it past the 7-day window in a
single jump.

**Fix:** Remove `userData/license/` and restart. The trial restarts
fresh.

### Banner shows but Activate button does nothing

**Cause:** `promptActivation()` was registered before the dialog
mounted, then the registration didn't take. Should be impossible
given current code in `WorkspaceLayout.tsx`.

**Fix:** File a regression. Capture: license status from StatusBar,
console errors on banner click, and the Electron main-process log
output.

## Electron-specific issues

### White screen on launch

**Cause:** The Electron renderer loaded before Vite was ready (in dev
mode), or before the renderer bundle was unpacked (in production).

**Fix (dev):** Restart `pnpm electron:dev`. The combined script waits
for Vite to be ready before launching Electron.

**Fix (production):** Reinstall the build. If it persists, the asar
unpacking failed — check disk permissions.

### File picker shows no files of expected type

**Cause:** macOS QuickLook may not classify Apollo `.bin` files
correctly. The accept filter is permissive enough to allow
`application/octet-stream`, but the Finder may not show them by
default.

**Fix:** Enable "Show all files" in the file picker, or rename to a
`.txt` if the file is text proto.

### Crash on import of a 50k-lane map

**Cause:** Default heap size insufficient.

**Fix (dev):** Bump the renderer's heap with
`NODE_OPTIONS="--max-old-space-size=4096" pnpm electron:dev`.

**Fix (production):** Bumping the heap requires a custom build
configuration. Pre-decimate the map before importing, or split into
sub-maps.

### Auto-update fails after first run

**Cause:** Code signing certificate revoked or expired.

**Fix:** Manual download of the latest installer from the GitHub
release page.

## Build / dev issues

See [Installation / Common install issues](/guide/installation#common-install-issues)
for `pnpm install`, Vite, and worker-related build issues.

## Diagnostic information to include in bug reports

When filing an issue, capture:

1. **OS and version** (e.g. macOS 15.2, Ubuntu 24.04, Windows 11).
2. **Editor surface** (web `pnpm dev`, or Electron desktop build).
3. **Editor version** (commit hash or release tag).
4. **License status** (from StatusBar / LicenseBanner; redact tokens).
5. **Reproduction steps** — minimum sequence of clicks/keys.
6. **Expected vs actual** behavior.
7. **DevTools console output** — copy stack traces verbatim.
8. **Map file (if relevant)** — small reproducer if the bug is map-data
   driven. Anonymize or sanitize as needed.

## Where to next

- [Architecture overview](/architecture/overview) — design rationale
  for the editor's surfaces.
- [License activation](/guide/license-activation) — full state machine.
- [Installation](/guide/installation) — install-time issues.
