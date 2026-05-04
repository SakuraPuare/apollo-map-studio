import type maplibregl from 'maplibre-gl';
import { registerMapIcons } from '@/lib/mapIcons';

export const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'dark-blank',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#1a1a2e' },
    },
  ],
};

function createArrowSDF(size: number = 20): { width: number; height: number; data: Uint8Array } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size * 0.15, size * 0.18);
  ctx.lineTo(size * 0.85, size * 0.5);
  ctx.lineTo(size * 0.15, size * 0.82);
  ctx.closePath();
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(data) };
}

interface StripeImageSpec {
  id: string;
  size: number;
  stripeW: number;
  gap: number;
  color: [number, number, number, number];
  angleDeg: number;
}

function addStripeImage(map: maplibregl.Map, spec: StripeImageSpec) {
  const { id, size, stripeW, gap, color, angleDeg } = spec;
  const [r, g, b, a] = color;
  const data = new Uint8Array(size * size * 4);
  const period = stripeW + gap;
  const normalRad = ((angleDeg + 90) * Math.PI) / 180;
  const nx = Math.cos(normalRad);
  const ny = Math.sin(normalRad);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pos = (((x * nx + y * ny) % period) + period) % period;
      if (pos < stripeW) {
        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      }
    }
  }
  map.addImage(id, { width: size, height: size, data });
}

export function registerRuntimeImages(map: maplibregl.Map) {
  for (const angleDeg of [0, 45, 90, 135]) {
    addStripeImage(map, {
      id: `zebra-stripe-${angleDeg}`,
      size: 16,
      stripeW: 6,
      gap: 2,
      color: [255, 255, 255, 255],
      angleDeg,
    });
  }
  addStripeImage(map, {
    id: 'red-hatch',
    size: 12,
    stripeW: 2,
    gap: 4,
    color: [255, 68, 102, 200],
    angleDeg: 45,
  });
  map.addImage('lane-arrow', createArrowSDF(20), { sdf: true });
  void registerMapIcons(map);
}
