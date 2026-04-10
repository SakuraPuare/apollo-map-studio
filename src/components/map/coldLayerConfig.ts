import type maplibregl from 'maplibre-gl';

export type ColdLayerId =
  | 'cold-fill'
  | 'cold-fill-crosswalk'
  | 'cold-fill-cleararea'
  | 'cold-line'
  | 'cold-line-dotted'
  | 'cold-line-dashed'
  | 'cold-labels'
  | 'cold-lane-arrows';

export const COLD_LAYER_IDS: ColdLayerId[] = [
  'cold-fill',
  'cold-fill-crosswalk',
  'cold-fill-cleararea',
  'cold-line',
  'cold-line-dotted',
  'cold-line-dashed',
  'cold-labels',
  'cold-lane-arrows',
];

export const COLD_LAYER_FILTERS: Record<ColdLayerId, maplibregl.FilterSpecification> = {
  'cold-fill': ['==', '$type', 'Polygon'],
  'cold-fill-crosswalk': ['all', ['==', '$type', 'Polygon'], ['==', 'entityType', 'crosswalk']],
  'cold-fill-cleararea': ['all', ['==', '$type', 'Polygon'], ['==', 'entityType', 'clearArea']],
  'cold-line': ['all',
    ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    ['!has', 'dashed'],
    ['!has', 'noStroke'],
  ],
  'cold-line-dotted': ['all',
    ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    ['has', 'dashed'],
    ['has', 'dotted'],
  ],
  'cold-line-dashed': ['all',
    ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    ['has', 'dashed'],
    ['!has', 'dotted'],
  ],
  'cold-labels': ['==', 'role', 'label'],
  'cold-lane-arrows': ['all', ['==', '$type', 'LineString'], ['==', 'role', 'laneCenter']],
};

export function buildColdLayerFilter(
  layerId: ColdLayerId,
  hiddenEntityId: string | null,
): maplibregl.FilterSpecification {
  const baseFilter = COLD_LAYER_FILTERS[layerId];
  if (!hiddenEntityId) return baseFilter;
  return ['all', baseFilter, ['!=', ['get', 'id'], hiddenEntityId]];
}
