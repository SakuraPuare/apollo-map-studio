/**
 * useLicense — keeps the licenseStore in sync with the main process via the
 * preload bridge. Mounts a single subscription so subsequent re-renders are
 * just zustand reads.
 */

import { useEffect } from 'react';
import { licenseBridge } from '@/lib/license-bridge';
import { useLicenseStore } from '@/store/licenseStore';

export function useLicenseSync(): void {
  const hydrate = useLicenseStore((s) => s.hydrate);
  const setState = useLicenseStore((s) => s.setState);

  useEffect(() => {
    void hydrate();
    const unsub = licenseBridge.onChange(setState);
    // Re-poll on focus — covers cases where the tick missed (e.g. laptop
    // wake from sleep).
    const onFocus = () => void hydrate();
    window.addEventListener('focus', onFocus);
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
    };
  }, [hydrate, setState]);
}
