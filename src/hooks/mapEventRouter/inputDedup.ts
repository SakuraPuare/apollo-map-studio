import type maplibregl from 'maplibre-gl';

const DBLCLICK_PX_TOLERANCE = 4;
const DBLCLICK_MS_WINDOW = 350;

export type InputSample = { x: number; y: number; ts: number };

export function sampleInput(e: maplibregl.MapMouseEvent): InputSample {
  return {
    x: e.point.x,
    y: e.point.y,
    ts: e.originalEvent.timeStamp,
  };
}

export function isDuplicateInput(prev: InputSample | null, next: InputSample): boolean {
  if (!prev) return false;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return Math.hypot(dx, dy) < DBLCLICK_PX_TOLERANCE && next.ts - prev.ts < DBLCLICK_MS_WINDOW;
}
