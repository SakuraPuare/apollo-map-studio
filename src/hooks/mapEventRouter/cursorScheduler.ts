import type { LngLat } from '@/core/geometry/interpolate';
import { useUIStore } from '@/store/uiStore';

export function createCursorScheduler() {
  let pendingCursorLngLat: LngLat | null = null;
  let cursorRafId: number | null = null;

  const flushCursor = () => {
    if (pendingCursorLngLat) {
      useUIStore.getState().setCursorLngLat(pendingCursorLngLat);
      pendingCursorLngLat = null;
    }
    cursorRafId = null;
  };

  return {
    schedule(point: LngLat) {
      pendingCursorLngLat = point;
      if (cursorRafId === null) {
        cursorRafId = requestAnimationFrame(flushCursor);
      }
    },
    dispose() {
      if (cursorRafId !== null) {
        cancelAnimationFrame(cursorRafId);
        cursorRafId = null;
      }
      pendingCursorLngLat = null;
    },
  };
}
