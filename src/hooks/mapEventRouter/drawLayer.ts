import type { MapElementType } from '@/core/elements';

const DRAW_STATE_ENTITY_TYPES: Record<string, string> = {
  drawPolyline: 'polyline',
  drawCatmullRom: 'catmullRom',
  drawBezier: 'bezier',
  drawArc: 'arc',
  drawRotatedRect: 'rect',
  drawPolygon: 'polygon',
};

export function entityTypeForDrawState(
  state: string,
  activeElement: MapElementType | null,
): string | null {
  return activeElement ?? DRAW_STATE_ENTITY_TYPES[state] ?? null;
}
