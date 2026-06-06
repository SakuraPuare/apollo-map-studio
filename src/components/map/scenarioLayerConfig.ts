import type maplibregl from 'maplibre-gl';

/** Scenario 覆盖层的 GeoJSON source id。 */
export const SCENARIO_SOURCE = {
  obstacleBoxes: 'scenario-obstacle-boxes',
  obstacleHeading: 'scenario-obstacle-heading',
  obstacleLabels: 'scenario-obstacle-labels',
  trajectories: 'scenario-trajectories',
  trajectoryVertices: 'scenario-trajectory-vertices',
  ego: 'scenario-ego',
  egoCurrent: 'scenario-ego-current',
  trafficLights: 'scenario-traffic-lights',
} as const;

export type ScenarioSourceId = (typeof SCENARIO_SOURCE)[keyof typeof SCENARIO_SOURCE];

/** 画轨迹时的草稿预览 source（独立于已提交的 scenario 数据）。 */
export const SCENARIO_DRAFT_SOURCE = 'scenario-draft-trajectory';

export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface LayerSpec {
  source: ScenarioSourceId;
  layer: maplibregl.LayerSpecification;
}

/** 自下而上：轨迹 → ego 路线 → 障碍框 → 朝向 → 顶点/端点 → 红绿灯 → 标签。 */
export const SCENARIO_LAYERS: LayerSpec[] = [
  {
    source: SCENARIO_SOURCE.trajectories,
    layer: {
      id: 'scenario-trajectory-line',
      type: 'line',
      source: SCENARIO_SOURCE.trajectories,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1.5,
        'line-opacity': 0.7,
        'line-dasharray': [2, 1.5],
      },
    },
  },
  {
    source: SCENARIO_SOURCE.ego,
    layer: {
      id: 'scenario-ego-route',
      type: 'line',
      source: SCENARIO_SOURCE.ego,
      filter: ['==', ['get', 'role'], 'egoRoute'],
      paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-opacity': 0.85 },
    },
  },
  {
    source: SCENARIO_SOURCE.obstacleBoxes,
    layer: {
      id: 'scenario-obstacle-fill',
      type: 'fill',
      source: SCENARIO_SOURCE.obstacleBoxes,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.55, 0.3],
      },
    },
  },
  {
    source: SCENARIO_SOURCE.obstacleBoxes,
    layer: {
      id: 'scenario-obstacle-outline',
      type: 'line',
      source: SCENARIO_SOURCE.obstacleBoxes,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1.2],
      },
    },
  },
  {
    source: SCENARIO_SOURCE.obstacleHeading,
    layer: {
      id: 'scenario-obstacle-heading-line',
      type: 'line',
      source: SCENARIO_SOURCE.obstacleHeading,
      paint: { 'line-color': '#fafafa', 'line-width': 1.5, 'line-opacity': 0.9 },
    },
  },
  {
    source: SCENARIO_SOURCE.trajectoryVertices,
    layer: {
      id: 'scenario-trajectory-vertex',
      type: 'circle',
      source: SCENARIO_SOURCE.trajectoryVertices,
      paint: {
        'circle-radius': 3,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#0a0a0a',
        'circle-stroke-width': 1,
      },
    },
  },
  {
    source: SCENARIO_SOURCE.ego,
    layer: {
      id: 'scenario-ego-points',
      type: 'circle',
      source: SCENARIO_SOURCE.ego,
      filter: ['in', ['get', 'role'], ['literal', ['egoStart', 'egoEnd', 'egoWaypoint']]],
      paint: {
        'circle-radius': ['match', ['get', 'role'], 'egoWaypoint', 3, 6],
        'circle-color': [
          'match',
          ['get', 'role'],
          'egoStart',
          '#22c55e',
          'egoEnd',
          '#ef4444',
          '#38bdf8',
        ],
        'circle-stroke-color': '#0a0a0a',
        'circle-stroke-width': 1.5,
      },
    },
  },
  {
    source: SCENARIO_SOURCE.trafficLights,
    layer: {
      id: 'scenario-traffic-light',
      type: 'circle',
      source: SCENARIO_SOURCE.trafficLights,
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#0a0a0a',
        'circle-stroke-width': 1.5,
      },
    },
  },
  {
    // 播放时 ego 的实时位置（静态时该 source 为空，图层不可见）。
    source: SCENARIO_SOURCE.egoCurrent,
    layer: {
      id: 'scenario-ego-current',
      type: 'circle',
      source: SCENARIO_SOURCE.egoCurrent,
      paint: {
        'circle-radius': 7,
        'circle-color': '#38bdf8',
        'circle-stroke-color': '#fafafa',
        'circle-stroke-width': 2,
      },
    },
  },
  {
    source: SCENARIO_SOURCE.obstacleLabels,
    layer: {
      id: 'scenario-obstacle-label',
      type: 'symbol',
      source: SCENARIO_SOURCE.obstacleLabels,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-offset': [0, -1.4],
        'text-anchor': 'bottom',
        'text-optional': true,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#e5e7eb',
        'text-halo-color': '#0a0a0a',
        'text-halo-width': 1.2,
      },
    },
  },
];

/** 草稿轨迹预览图层（虚线 + 顶点），叠在最上层。 */
export const SCENARIO_DRAFT_LAYERS: maplibregl.LayerSpecification[] = [
  {
    id: 'scenario-draft-line',
    type: 'line',
    source: SCENARIO_DRAFT_SOURCE,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': '#fbbf24',
      'line-width': 2,
      'line-dasharray': [1.5, 1],
    },
  },
  {
    id: 'scenario-draft-vertex',
    type: 'circle',
    source: SCENARIO_DRAFT_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#fbbf24',
      'circle-stroke-color': '#0a0a0a',
      'circle-stroke-width': 1.5,
    },
  },
];
