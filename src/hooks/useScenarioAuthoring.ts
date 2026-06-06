import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useUIStore } from '@/store/uiStore';
import { useScenarioStore } from '@/store/scenarioStore';
import {
  useSceneToolStore,
  isPlaceTool,
  PLACE_TOOL_KIND,
  type SceneTool,
} from '@/store/sceneToolStore';
import { makeProjection } from '@/io/proto/projection';
import { lngLatToWorld, worldToLngLat } from '@/io/scenario/scenarioProjection';
import { makeObstacle, makeTrafficLight, nextApolloId } from '@/io/scenario/factory';
import {
  SCENARIO_DRAFT_SOURCE,
  SCENARIO_DRAFT_LAYERS,
  EMPTY_FC,
} from '@/components/map/scenarioLayerConfig';
import type { WorldPoint } from '@/types/scenario';

/**
 * 场景编辑（scene 模式）的地图交互。与绘图模式的 XState 路由完全隔离：
 * 直接挂 MapLibre 事件，按 sceneToolStore.tool 分发放置/画轨迹/设 ego。
 *
 * 仅在 appMode==='scene' 且非 select 工具时拦截点击；select 工具下放行给
 * useScenarioLayer 的 obstacle 点选逻辑。坐标经 projString 反投影回世界米。
 */
export function useScenarioAuthoring(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
) {
  const appMode = useUIStore((s) => s.appMode);
  const tool = useSceneToolStore((s) => s.tool);
  const draftVertices = useSceneToolStore((s) => s.draftVertices);

  useDraftPreview(mapRef, mapLoadedRef, draftVertices, appMode);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appMode !== 'scene' || tool === 'select') return;

    const toWorld = (e: maplibregl.MapMouseEvent): WorldPoint | null => {
      const projString = useScenarioStore.getState().projString;
      if (!projString) return null;
      try {
        const proj = makeProjection(projString);
        const { x, y } = lngLatToWorld(proj, e.lngLat.lng, e.lngLat.lat);
        return { x, y };
      } catch {
        return null;
      }
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const p = toWorld(e);
      if (!p) return;
      handleToolClick(tool, p);
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (tool !== 'drawTrajectory') return;
      // 双击结束轨迹：阻止默认缩放，提交草稿。
      e.preventDefault();
      commitTrajectory();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (tool !== 'drawTrajectory') return;
      if (ev.key === 'Enter') commitTrajectory();
      else if (ev.key === 'Escape') useSceneToolStore.getState().clearDraft();
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [appMode, tool, mapRef, mapLoadedRef]);
}

/** 按工具分发单击：放置实体 / 设 ego 点 / 加航点 / 画轨迹顶点。 */
function handleToolClick(tool: SceneTool, p: WorldPoint): void {
  const store = useScenarioStore.getState();
  const doc = store.loaded.find((l) => l.key === store.activeKey)?.doc;
  if (!doc) return;

  if (isPlaceTool(tool)) {
    store.addObstacle(makeObstacle(PLACE_TOOL_KIND[tool], p, nextApolloId(doc)));
    return;
  }
  switch (tool) {
    case 'placeTrafficLight':
      store.addTrafficLight(makeTrafficLight(p));
      break;
    case 'setEgoStart':
      store.setEgoPoint('start', { ...p, h: doc.ego.start.h });
      break;
    case 'setEgoEnd':
      store.setEgoPoint('end', p);
      break;
    case 'addWaypoint':
      store.addEgoWaypoint(p);
      break;
    case 'drawTrajectory':
      useSceneToolStore.getState().pushDraftVertex(p);
      break;
    default:
      break;
  }
}

/** 提交轨迹草稿：附到选中障碍物，或没有选中则新建一辆沿轨迹行驶的车。 */
function commitTrajectory(): void {
  const toolStore = useSceneToolStore.getState();
  // 去重相邻近重合顶点：物理双击会在 dblclick 前压入两个几乎同点的 click 顶点，
  // 否则轨迹末尾会留下一段零长退化线段并 round-trip 进文件。
  const verts = dedupeConsecutive(toolStore.draftVertices);
  if (verts.length < 2) {
    toolStore.clearDraft();
    return;
  }
  const store = useScenarioStore.getState();
  const doc = store.loaded.find((l) => l.key === store.activeKey)?.doc;
  if (!doc) {
    toolStore.clearDraft();
    return;
  }
  const traj = verts.map((v) => ({ x: v.x, y: v.y }));
  const selectedUid = store.selectedObstacleUid;
  const target = selectedUid && doc.obstacles.find((o) => o.uid === selectedUid);
  if (target) {
    store.updateObstacle(target.uid, { trajectory: traj, moving: true, position: traj[0]! });
  } else {
    const ob = makeObstacle('vehicle', traj[0]!, nextApolloId(doc));
    ob.trajectory = traj;
    ob.moving = true;
    store.addObstacle(ob);
  }
  toolStore.clearDraft();
}

/** 丢弃相邻近重合（<~1e-6 米）的顶点。 */
function dedupeConsecutive(verts: WorldPoint[]): WorldPoint[] {
  const out: WorldPoint[] = [];
  for (const v of verts) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - v.x) < 1e-6 && Math.abs(prev.y - v.y) < 1e-6) continue;
    out.push(v);
  }
  return out;
}

/** 草稿轨迹预览：把 draftVertices 投影成 lngLat，喂给独立 draft source。
 *  离开 scene 模式时清空预览并丢弃未提交草稿，避免黄色虚线残留且无从消除。 */
function useDraftPreview(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  draftVertices: WorldPoint[],
  appMode: 'drawing' | 'scene',
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const inScene = appMode === 'scene';
    if (!inScene && useSceneToolStore.getState().draftVertices.length > 0) {
      useSceneToolStore.getState().clearDraft();
    }

    const apply = () => {
      if (!mapLoadedRef.current) return;
      if (!map.getSource(SCENARIO_DRAFT_SOURCE)) {
        map.addSource(SCENARIO_DRAFT_SOURCE, { type: 'geojson', data: EMPTY_FC });
        for (const layer of SCENARIO_DRAFT_LAYERS) {
          if (!map.getLayer(layer.id)) map.addLayer(layer);
        }
      }
      const src = map.getSource(SCENARIO_DRAFT_SOURCE) as maplibregl.GeoJSONSource | undefined;
      src?.setData(inScene ? buildDraftFC(draftVertices) : EMPTY_FC);
    };

    apply();
    if (!mapLoadedRef.current) {
      map.once('load', apply);
      return () => {
        map.off('load', apply);
      };
    }
    return undefined;
  }, [draftVertices, mapRef, mapLoadedRef, appMode]);
}

/** draftVertices → {折线 + 顶点} FeatureCollection（经 projString 投影）。 */
function buildDraftFC(verts: WorldPoint[]): GeoJSON.FeatureCollection {
  const projString = useScenarioStore.getState().projString;
  if (!projString || verts.length === 0) return EMPTY_FC;
  let proj;
  try {
    proj = makeProjection(projString);
  } catch {
    return EMPTY_FC;
  }
  const coords = verts.map((v) => worldToLngLat(proj, v));
  const features: GeoJSON.Feature[] = coords.map((c) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: c },
    properties: {},
  }));
  if (coords.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}
