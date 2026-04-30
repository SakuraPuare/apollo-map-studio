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

function addStripeImage(
  map: maplibregl.Map,
  id: string,
  size: number,
  stripeW: number,
  gap: number,
  r: number,
  g: number,
  b: number,
  a: number,
  diagonal: boolean,
) {
  const data = new Uint8Array(size * size * 4);
  const period = stripeW + gap;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pos = diagonal
        ? (((x + y) % period) + period) % period
        : ((y % period) + period) % period;
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
  addStripeImage(map, 'zebra-stripe', 16, 4, 4, 255, 255, 255, 255, false);
  addStripeImage(map, 'red-hatch', 12, 2, 4, 255, 68, 102, 200, true);
  map.addImage('lane-arrow', createArrowSDF(20), { sdf: true });
  void registerMapIcons(map);
}
