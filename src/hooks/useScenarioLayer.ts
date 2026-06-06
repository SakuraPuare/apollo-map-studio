import { useEffect, useMemo, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import { useScenarioStore } from '@/store/scenarioStore';
import { useSceneToolStore } from '@/store/sceneToolStore';
import { useUIStore } from '@/store/uiStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { makeProjection } from '@/io/proto/projection';
import { buildScenarioFeatures } from '@/io/scenario/scenarioFeatures';
import { scenarioBoundsLngLat } from '@/io/scenario/scenarioProjection';
import { sampleScenarioAt, scenarioDuration } from '@/io/scenario/scenarioSampler';
import {
  SCENARIO_SOURCE,
  SCENARIO_LAYERS,
  EMPTY_FC,
  type ScenarioSourceId,
} from '@/components/map/scenarioLayerConfig';
import type { Projection } from '@/io/proto/projection';
import type { ScenarioFeatureCollections } from '@/io/scenario/scenarioFeatures';
import type { ScenarioDoc } from '@/types/scenario';

/**
 * 把当前激活场景渲染成独立 MapLibre 覆盖层（障碍框/朝向/轨迹/ego/红绿灯/标签）。
 * 模式与 [[useApolloLayer]] 一致：源先建、层叠在 cold 层之上，数据随 store 更新。
 *
 * 动态播放：useScenarioPlayback 订阅 [[playbackStore]] 的 currentTime，按时刻采样
 * 并**命令式**更新动态 source（不触发 React 重渲染，~60fps 走 store.subscribe）。
 */
export function useScenarioLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
) {
  const activeKey = useScenarioStore((s) => s.activeKey);
  const loaded = useScenarioStore((s) => s.loaded);
  const projString = useScenarioStore((s) => s.projString);
  const selectedUid = useScenarioStore((s) => s.selectedObstacleUid);

  const doc = useMemo(
    () => loaded.find((l) => l.key === activeKey)?.doc ?? null,
    [loaded, activeKey],
  );

  const proj = useMemo(() => {
    if (!projString) return null;
    try {
      return makeProjection(projString);
    } catch {
      return null;
    }
  }, [projString]);

  const collections = useMemo<ScenarioFeatureCollections | null>(() => {
    if (!doc || !proj) return null;
    try {
      return buildScenarioFeatures(proj, doc);
    } catch {
      return null;
    }
  }, [doc, proj]);

  // 激活场景变化时同步播放时钟时长 + 复位。
  useEffect(() => {
    if (doc) usePlaybackStore.getState().reset(scenarioDuration(doc));
  }, [doc]);

  useScenarioRender(mapRef, mapLoadedRef, collections);
  useScenarioPlayback(mapRef, doc, proj);
  useScenarioFitBounds(mapRef, mapLoadedRef, activeKey, doc, projString);
  useObstacleSelection(mapRef, selectedUid);
  useObstacleClickSelect(mapRef);
  useTrafficLightClickSelect(mapRef);
  useEgoClickSelect(mapRef);
}

/**
 * 命令式动态渲染：订阅播放时钟，按当前时刻采样场景并更新动态 source
 * （障碍框/朝向/标签/红绿灯/egoCurrent）。currentTime===0 时回落到静态（由
 * useScenarioRender 负责的初值），避免与静态渲染抢同一帧。
 */
function useScenarioPlayback(
  mapRef: React.RefObject<maplibregl.Map | null>,
  doc: ScenarioDoc | null,
  proj: Projection | null,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !doc || !proj) return undefined;

    // 动态会变的 source 子集（轨迹线/ego 路线是静态参照，不在此列）。
    const dynamicSources: ScenarioSourceId[] = [
      SCENARIO_SOURCE.obstacleBoxes,
      SCENARIO_SOURCE.obstacleHeading,
      SCENARIO_SOURCE.obstacleLabels,
      SCENARIO_SOURCE.trafficLights,
      SCENARIO_SOURCE.egoCurrent,
    ];

    const render = (t: number) => {
      const posed = t > 0 ? sampleScenarioAt(doc, t) : null;
      let collections: ScenarioFeatureCollections;
      try {
        collections = buildScenarioFeatures(proj, doc, posed);
      } catch {
        return;
      }
      const data = collectionsBySource(collections);
      for (const sourceId of dynamicSources) {
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        src?.setData(data[sourceId] ?? EMPTY_FC);
      }
    };

    // 初次对齐 + 订阅后续时刻变化。
    render(usePlaybackStore.getState().currentTime);
    let prev = usePlaybackStore.getState().currentTime;
    const unsub = usePlaybackStore.subscribe((s) => {
      if (s.currentTime === prev) return;
      prev = s.currentTime;
      render(s.currentTime);
    });
    return unsub;
  }, [mapRef, doc, proj]);
}

function useScenarioRender(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  collections: ScenarioFeatureCollections | null,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ensureInstalled = () => {
      if (!mapLoadedRef.current) return false;
      for (const sourceId of Object.values(SCENARIO_SOURCE)) {
        if (!map.getSource(sourceId)) {
          // obstacleBoxes 用 promoteId 把 uid 提升为 feature id，供 feature-state 选中高亮。
          map.addSource(sourceId, {
            type: 'geojson',
            data: EMPTY_FC,
            ...(sourceId === SCENARIO_SOURCE.obstacleBoxes ? { promoteId: 'uid' } : {}),
          });
        }
      }
      for (const spec of SCENARIO_LAYERS) {
        if (!map.getLayer(spec.layer.id)) map.addLayer(spec.layer);
      }
      return true;
    };

    const apply = () => {
      if (!ensureInstalled()) return;
      const data = collectionsBySource(collections);
      for (const sourceId of Object.values(SCENARIO_SOURCE)) {
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        src?.setData(data[sourceId] ?? EMPTY_FC);
      }
    };

    apply();
    if (!mapLoadedRef.current) {
      map.once('load', apply);
      return () => {
        map.off('load', apply);
      };
    }
    return undefined;
  }, [collections, mapRef, mapLoadedRef]);
}

// Fit bounds only when the *active scenario* changes — not on every edit,
// so editing an obstacle doesn't yank the camera around.
function useScenarioFitBounds(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  activeKey: string | null,
  doc: ScenarioDoc | null,
  projString: string | null,
) {
  const fittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !doc || !projString) return;
    if (fittedKeyRef.current === activeKey) return;
    try {
      const bounds = scenarioBoundsLngLat(makeProjection(projString), doc);
      if (bounds) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 19, animate: true, duration: 600 });
        fittedKeyRef.current = activeKey;
      }
    } catch {
      /* projection failure — skip fit */
    }
  }, [activeKey, doc, projString, mapRef, mapLoadedRef]);
}

// Highlight the selected obstacle via MapLibre feature-state — no reprojection
// or setData on selection; toggling state repaints only the affected feature.
function useObstacleSelection(
  mapRef: React.RefObject<maplibregl.Map | null>,
  selectedUid: string | null,
) {
  const prevRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = SCENARIO_SOURCE.obstacleBoxes;
    const setState = () => {
      if (!map.getSource(source)) return;
      if (prevRef.current && prevRef.current !== selectedUid) {
        map.setFeatureState({ source, id: prevRef.current }, { selected: false });
      }
      if (selectedUid) {
        map.setFeatureState({ source, id: selectedUid }, { selected: true });
      }
      prevRef.current = selectedUid;
    };
    // 源可能尚未就绪（首帧/样式重载）；用 idle 兜底重试一次。
    setState();
    map.once('idle', setState);
    return () => {
      map.off('idle', setState);
    };
  }, [mapRef, selectedUid]);
}

// Click an obstacle box → select it (drives the inspector); hover → pointer.
// 点选只在 scene 模式 + select 工具下生效：drawing 模式默认工具也是 'select'，
// 故必须同时判 appMode，否则会在绘图模式下抢点选场景实体（与绘图 FSM 串扰）。
function canClickSelect(): boolean {
  return (
    useUIStore.getState().appMode === 'scene' && useSceneToolStore.getState().tool === 'select'
  );
}

function useObstacleClickSelect(mapRef: React.RefObject<maplibregl.Map | null>) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layerId = 'scenario-obstacle-fill';
    const select = useScenarioStore.getState().select;

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      // 放置/画线等工具进行中时不抢点选（交给 useScenarioAuthoring）。
      if (!canClickSelect()) return;
      const uid = e.features?.[0]?.properties?.uid;
      if (typeof uid === 'string') {
        select(uid);
        e.originalEvent.stopPropagation();
      }
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', layerId, onClick);
    map.on('mouseenter', layerId, onEnter);
    map.on('mouseleave', layerId, onLeave);
    return () => {
      map.off('click', layerId, onClick);
      map.off('mouseenter', layerId, onEnter);
      map.off('mouseleave', layerId, onLeave);
    };
  }, [mapRef]);
}

// Click a traffic-light circle → select it (drives the inspector).
function useTrafficLightClickSelect(mapRef: React.RefObject<maplibregl.Map | null>) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layerId = 'scenario-traffic-light';
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!canClickSelect()) return;
      const uid = e.features?.[0]?.properties?.uid;
      if (typeof uid === 'string') {
        useScenarioStore.getState().selectTrafficLight(uid);
        e.originalEvent.stopPropagation();
      }
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', layerId, onClick);
    map.on('mouseenter', layerId, onEnter);
    map.on('mouseleave', layerId, onLeave);
    return () => {
      map.off('click', layerId, onClick);
      map.off('mouseenter', layerId, onEnter);
      map.off('mouseleave', layerId, onLeave);
    };
  }, [mapRef]);
}

// Click an ego start/end/waypoint dot → select ego (drives the inspector).
function useEgoClickSelect(mapRef: React.RefObject<maplibregl.Map | null>) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layerId = 'scenario-ego-points';
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!canClickSelect()) return;
      if (e.features?.length) {
        useScenarioStore.getState().selectEgo();
        e.originalEvent.stopPropagation();
      }
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', layerId, onClick);
    map.on('mouseenter', layerId, onEnter);
    map.on('mouseleave', layerId, onLeave);
    return () => {
      map.off('click', layerId, onClick);
      map.off('mouseenter', layerId, onEnter);
      map.off('mouseleave', layerId, onLeave);
    };
  }, [mapRef]);
}

/** ScenarioSourceId → ScenarioFeatureCollections 字段名映射。 */
const SOURCE_TO_FIELD: Record<ScenarioSourceId, keyof ScenarioFeatureCollections> = {
  [SCENARIO_SOURCE.obstacleBoxes]: 'obstacleBoxes',
  [SCENARIO_SOURCE.obstacleHeading]: 'obstacleHeading',
  [SCENARIO_SOURCE.obstacleLabels]: 'obstacleLabels',
  [SCENARIO_SOURCE.trajectories]: 'trajectories',
  [SCENARIO_SOURCE.trajectoryVertices]: 'trajectoryVertices',
  [SCENARIO_SOURCE.ego]: 'ego',
  [SCENARIO_SOURCE.egoCurrent]: 'egoCurrent',
  [SCENARIO_SOURCE.trafficLights]: 'trafficLights',
};

function collectionsBySource(
  c: ScenarioFeatureCollections | null,
): Record<ScenarioSourceId, GeoJSON.FeatureCollection> {
  const out = {} as Record<ScenarioSourceId, GeoJSON.FeatureCollection>;
  for (const [sourceId, field] of Object.entries(SOURCE_TO_FIELD)) {
    out[sourceId as ScenarioSourceId] = c?.[field] ?? EMPTY_FC;
  }
  return out;
}
