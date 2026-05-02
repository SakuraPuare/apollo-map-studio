/**
 * Cross-cutting "is this app currently editable?" guard. Used by the map
 * store mutators and the action dispatcher to short-circuit any state
 * change attempted while the license is in a read-only state (expired
 * trial, expired license, tampered, etc.).
 *
 * Uses zustand's `getState()` rather than a hook so the same code path
 * works inside event handlers, store actions, and IPC callbacks.
 */

import { useLicenseStore } from '@/store/licenseStore';

let lastWarn = 0;
const WARN_INTERVAL = 5 * 1000;

/**
 * Returns true if editing is currently allowed. When false, the caller
 * should bail out — the guard already surfaces a single warn-throttled
 * console message and (when wired) opens the activation prompt.
 */
export function assertEditable(action = 'edit'): boolean {
  const { state, promptActivation } = useLicenseStore.getState();
  if (state.canEdit) return true;

  const now = Date.now();
  if (now - lastWarn > WARN_INTERVAL) {
    lastWarn = now;
    console.warn(`[license] Blocked ${action}: status=${state.status}. ${state.reason}`);
    try {
      promptActivation();
    } catch {
      // promptActivation may not be wired before the dialog mounts.
    }
  }
  return false;
}

/**
 * Synchronous read of `canEdit` without side effects — used by component
 * render paths that need to disable buttons.
 */
export function isEditable(): boolean {
  return useLicenseStore.getState().state.canEdit;
}
