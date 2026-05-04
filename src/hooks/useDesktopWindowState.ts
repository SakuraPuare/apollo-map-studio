import { useEffect, useState } from 'react';
import { appBridge, isDesktopRuntime, type DesktopWindowState } from '@/lib/app-bridge';

function fallbackWindowState(): DesktopWindowState | null {
  if (!isDesktopRuntime()) return null;
  return {
    platform: window.apolloMapStudio?.platform ?? navigator.platform,
    isMaximized: false,
    isFullscreen: false,
    isFocused: true,
  };
}

export function useDesktopWindowState(): DesktopWindowState | null {
  const [state, setState] = useState<DesktopWindowState | null>(() => fallbackWindowState());

  useEffect(() => {
    if (!isDesktopRuntime()) return undefined;

    let mounted = true;
    void appBridge.getWindowState().then((next) => {
      if (mounted && next) setState(next);
    });

    const unsubscribe = appBridge.onWindowStateChange(setState);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return state;
}
