import type { Projection } from '@/io/proto/projection';
import type { ScenarioDoc, ScenarioObstacle, WorldPoint } from '@/types/scenario';
import type { PosedScenario } from './scenarioSampler';
import {
  obstacleBoxCorners,
  headingArrowTip,
  worldToLngLat,
  worldPathToLngLat,
  type LngLat,
} from './scenarioProjection';

/**
 * 把一份场景文档编译成分类 GeoJSON FeatureCollection，供 MapLibre 各图层消费。
 * 纯函数：输入 doc + projection，输出 features，便于单测。
 *
 * 传入 `posed`（来自 [[scenarioSampler]] 的某时刻采样）时进入**动态模式**：
 *   障碍框/朝向/标签用该时刻位置，红绿灯用该时刻颜色，并产出 egoCurrent 实时点；
 *   轨迹线/ego 路线/起止点仍画静态全程（作为运动参照）。
 */
export interface ScenarioFeatureCollections {
  obstacleBoxes: GeoJSON.FeatureCollection;
  obstacleHeading: GeoJSON.FeatureCollection;
  obstacleLabels: GeoJSON.FeatureCollection;
  trajectories: GeoJSON.FeatureCollection;
  trajectoryVertices: GeoJSON.FeatureCollection;
  ego: GeoJSON.FeatureCollection;
  egoCurrent: GeoJSON.FeatureCollection;
  trafficLights: GeoJSON.FeatureCollection;
}

const KIND_COLOR: Record<string, string> = {
  vehicle: '#f97316',
  bicycle: '#a3e635',
  pedestrian: '#ec4899',
  staticObstacle: '#94a3b8',
  unknown: '#64748b',
};

export function obstacleColor(kind: string): string {
  return KIND_COLOR[kind] ?? KIND_COLOR.unknown!;
}

const TL_COLOR: Record<string, string> = {
  RED: '#ef4444',
  GREEN: '#22c55e',
  YELLOW: '#eab308',
};

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

export function buildScenarioFeatures(
  proj: Projection,
  doc: ScenarioDoc,
  posed?: PosedScenario | null,
): ScenarioFeatureCollections {
  const boxes: GeoJSON.Feature[] = [];
  const headings: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const trajectories: GeoJSON.Feature[] = [];
  const trajVerts: GeoJSON.Feature[] = [];

  const obPoseByUid = new Map<string, WorldPoint>();
  if (posed) for (const p of posed.obstacles) obPoseByUid.set(p.uid, p.position);

  for (const ob of doc.obstacles) {
    appendObstacle(proj, ob, obPoseByUid.get(ob.uid) ?? ob.position, {
      boxes,
      headings,
      labels,
      trajectories,
      trajVerts,
    });
  }

  return {
    obstacleBoxes: fc(boxes),
    obstacleHeading: fc(headings),
    obstacleLabels: fc(labels),
    trajectories: fc(trajectories),
    trajectoryVertices: fc(trajVerts),
    ego: fc(buildEgoFeatures(proj, doc)),
    egoCurrent: fc(buildEgoCurrentFeatures(proj, posed)),
    trafficLights: fc(buildTrafficLightFeatures(proj, doc, posed)),
  };
}

interface ObstacleSink {
  boxes: GeoJSON.Feature[];
  headings: GeoJSON.Feature[];
  labels: GeoJSON.Feature[];
  trajectories: GeoJSON.Feature[];
  trajVerts: GeoJSON.Feature[];
}

function appendObstacle(
  proj: Projection,
  ob: ScenarioObstacle,
  pose: WorldPoint,
  sink: ObstacleSink,
): void {
  const props = {
    uid: ob.uid,
    name: ob.name,
    kind: ob.kind,
    color: obstacleColor(ob.kind),
  };

  // oriented box polygon — 用采样姿态（动态时是当前时刻位置/朝向）。
  const corners = obstacleBoxCorners(pose, ob.dimensions.length, ob.dimensions.width);
  const ring = corners.map((c) => worldToLngLat(proj, c));
  if (ring.length > 0) ring.push(ring[0]!);
  sink.boxes.push({
    type: 'Feature',
    id: ob.uid,
    properties: props,
    geometry: { type: 'Polygon', coordinates: [ring] },
  });

  // heading arrow (center → tip)
  const center = worldToLngLat(proj, pose);
  const tipLen = Math.max(ob.dimensions.length / 2 + 1, 1.5);
  const tip = worldToLngLat(proj, headingArrowTip(pose, tipLen));
  sink.headings.push({
    type: 'Feature',
    properties: props,
    geometry: { type: 'LineString', coordinates: [center, tip] },
  });

  // label anchor (center point)
  sink.labels.push({
    type: 'Feature',
    properties: { ...props, label: `${ob.name} · ${ob.kind}` },
    geometry: { type: 'Point', coordinates: center },
  });

  // 轨迹线/顶点恒画全程（静态参照），不随时刻变动。
  appendTrajectory(proj, ob, props, sink);
}

function appendTrajectory(
  proj: Projection,
  ob: ScenarioObstacle,
  props: Record<string, unknown>,
  sink: ObstacleSink,
): void {
  if (ob.trajectory.length < 2) return;
  const path = worldPathToLngLat(proj, ob.trajectory);
  sink.trajectories.push({
    type: 'Feature',
    properties: props,
    geometry: { type: 'LineString', coordinates: path },
  });
  path.forEach((c, i) => {
    sink.trajVerts.push({
      type: 'Feature',
      properties: { ...props, role: 'trajVertex', index: i },
      geometry: { type: 'Point', coordinates: c },
    });
  });
}

function buildEgoFeatures(proj: Projection, doc: ScenarioDoc): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const start = worldToLngLat(proj, doc.ego.start);
  const end = worldToLngLat(proj, doc.ego.end);
  features.push(point(start, { role: 'egoStart', label: 'EGO start' }));
  features.push(point(end, { role: 'egoEnd', label: 'EGO end' }));

  const route: LngLat[] = [start, ...worldPathToLngLat(proj, doc.ego.waypoints), end];
  features.push({
    type: 'Feature',
    properties: { role: 'egoRoute' },
    geometry: { type: 'LineString', coordinates: route },
  });
  doc.ego.waypoints.forEach((w, i) => {
    features.push(point(worldToLngLat(proj, w), { role: 'egoWaypoint', index: i }));
  });
  return features;
}

function buildEgoCurrentFeatures(
  proj: Projection,
  posed?: PosedScenario | null,
): GeoJSON.Feature[] {
  if (!posed?.ego) return [];
  return [point(worldToLngLat(proj, posed.ego.position), { role: 'egoCurrent' })];
}

function buildTrafficLightFeatures(
  proj: Projection,
  doc: ScenarioDoc,
  posed?: PosedScenario | null,
): GeoJSON.Feature[] {
  const colorByUid = new Map<string, string>();
  if (posed) for (const p of posed.trafficLights) colorByUid.set(p.uid, p.color);
  return doc.trafficLights.map((tl) => {
    const activeColor = colorByUid.get(tl.uid) ?? tl.initialColor;
    return point(worldToLngLat(proj, tl.location), {
      role: 'trafficLight',
      uid: tl.uid,
      signalId: tl.signalId,
      color: TL_COLOR[activeColor] ?? '#9ca3af',
      initialColor: tl.initialColor,
    });
  });
}

function point(coord: LngLat, props: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coord } };
}
