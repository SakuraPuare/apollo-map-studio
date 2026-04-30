/**
 * geoJsonHelpers — Hot 层 GeoJSON 编译。
 *
 * 这层是 useHotLayer 的纯计算心脏：
 *   - 选中实体 → entityToHotFeatures → src.setData
 *   - useHotLayer 自身只是 RAF 调度 + 选中态比较，真正的 feature 形状全在这里产
 *
 * 测试不 mock interpolate / anchorConvert / coords，跑真实代码——
 * helper 输出的几何形状即业务契约。
 */
import { describe, it, expect } from 'vitest';
import {
  lineFeature,
  pointFeature,
  handleLineFeature,
  polygonFeature,
  entityToHotFeatures,
} from '../geoJsonHelpers';
import type {
  PolylineEntity,
  BezierEntity,
  ArcEntity,
  RectEntity,
  PolygonEntity,
} from '@/types/entities';
import type { LaneEntity, SignalEntity } from '@/types/apollo';
import type { LngLat } from '@/core/geometry/interpolate';

// ── 基础 helper ─────────────────────────────────────────────────

describe('lineFeature / pointFeature / polygonFeature / handleLineFeature', () => {
  it('lineFeature 产出 LineString，properties 透传', () => {
    const f = lineFeature(
      [
        [0, 0],
        [1, 1],
      ],
      { color: 'red', extra: 1 },
    );
    expect(f.type).toBe('Feature');
    expect(f.geometry.type).toBe('LineString');
    expect((f.geometry as GeoJSON.LineString).coordinates).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(f.properties).toEqual({ color: 'red', extra: 1 });
  });

  it('pointFeature 把 role 注入 properties', () => {
    const f = pointFeature([10, 20], 'vertex', { index: 3 });
    expect(f.geometry.type).toBe('Point');
    expect((f.geometry as GeoJSON.Point).coordinates).toEqual([10, 20]);
    expect(f.properties).toEqual({ role: 'vertex', index: 3 });
  });

  it('handleLineFeature 标记为 handleLine', () => {
    const f = handleLineFeature([0, 0], [1, 1]);
    expect(f.geometry.type).toBe('LineString');
    expect(f.properties).toEqual({ role: 'handleLine' });
  });

  it('polygonFeature 自动闭合（首尾不同时补一段）', () => {
    const ring: LngLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const f = polygonFeature(ring);
    const coords = (f.geometry as GeoJSON.Polygon).coordinates[0]!;
    // 自闭合后第 5 个点 == 第 1 个点
    expect(coords.length).toBe(5);
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });

  it('polygonFeature 已闭合的输入不重复加点', () => {
    const closed: LngLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const f = polygonFeature(closed);
    const coords = (f.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(coords.length).toBe(closed.length);
  });
});

// ── entityToHotFeatures ────────────────────────────────────────

describe('entityToHotFeatures — drawing entities', () => {
  it('polyline：1 条 LineString + N 个 vertex point', () => {
    const e: PolylineEntity = {
      id: 'pl',
      entityType: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    };
    const features = entityToHotFeatures(e);
    const lines = features.filter((f) => f.geometry.type === 'LineString');
    const points = features.filter((f) => f.geometry.type === 'Point');
    expect(lines.length).toBe(1);
    expect(points.length).toBe(3);
    expect(points.every((p) => p.properties?.role === 'vertex')).toBe(true);
    // index 字段递增
    const indexes = points.map((p) => p.properties?.index);
    expect(indexes).toEqual([0, 1, 2]);
  });

  it('bezier with handles：line + N anchors + handle lines + handle points', () => {
    const e: BezierEntity = {
      id: 'bz',
      entityType: 'bezier',
      anchors: [
        { point: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 0.5, y: 0.5 } },
        { point: { x: 1, y: 1 }, handleIn: { x: 0.5, y: 1 }, handleOut: null },
      ],
    };
    const features = entityToHotFeatures(e);
    const lines = features.filter((f) => f.geometry.type === 'LineString');
    const handleLines = lines.filter((f) => f.properties?.role === 'handleLine');
    const handlePts = features.filter(
      (f) => f.geometry.type === 'Point' && f.properties?.role === 'handle',
    );
    const vertexPts = features.filter(
      (f) => f.geometry.type === 'Point' && f.properties?.role === 'vertex',
    );
    expect(vertexPts.length).toBe(2); // 两个锚点
    expect(handleLines.length).toBe(2); // 一个 handleOut + 一个 handleIn
    expect(handlePts.length).toBe(2);
    // 至少有 1 条主曲线（cubicBezier 输出）
    expect(lines.length).toBeGreaterThanOrEqual(handleLines.length + 1);
  });

  it('arc：1 条曲线 + 3 个 vertex 点（start/mid/end）', () => {
    const e: ArcEntity = {
      id: 'ar',
      entityType: 'arc',
      start: { x: 0, y: 0 },
      mid: { x: 1, y: 0.5 },
      end: { x: 2, y: 0 },
    };
    const features = entityToHotFeatures(e);
    const points = features.filter((f) => f.geometry.type === 'Point');
    const lines = features.filter((f) => f.geometry.type === 'LineString');
    expect(points.length).toBe(3);
    expect(lines.length).toBe(1);
    // 3 个 vertex 的 index = 0/1/2
    expect(points.map((p) => p.properties?.index)).toEqual([0, 1, 2]);
  });

  it('rect：1 个 Polygon + 4 个 corner vertex + handleLine + rotate handle', () => {
    const e: RectEntity = {
      id: 'rc',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 2, y: 1 },
      rotation: 0,
    };
    const features = entityToHotFeatures(e);
    const polygons = features.filter((f) => f.geometry.type === 'Polygon');
    const cornerPts = features.filter(
      (f) => f.geometry.type === 'Point' && f.properties?.role === 'vertex',
    );
    const handleLines = features.filter(
      (f) => f.geometry.type === 'LineString' && f.properties?.role === 'handleLine',
    );
    const rotateHandle = features.find(
      (f) => f.properties?.role === 'handle' && f.properties?.handleType === 'rotate',
    );
    expect(polygons.length).toBe(1);
    expect(cornerPts.length).toBe(4);
    expect(handleLines.length).toBe(1);
    expect(rotateHandle).toBeDefined();
    expect(rotateHandle!.properties?.index).toBe(-1);
  });

  it('polygon：1 个自闭合 Polygon + N vertex 点', () => {
    const e: PolygonEntity = {
      id: 'pg',
      entityType: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    const features = entityToHotFeatures(e);
    const polygons = features.filter((f) => f.geometry.type === 'Polygon');
    const points = features.filter((f) => f.geometry.type === 'Point');
    expect(polygons.length).toBe(1);
    expect(points.length).toBe(4);
    // ring 自闭合
    const ring = (polygons[0]!.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  // ── 回归：导入态实体不应被闭合 ──────────────────────────────────
  // import 路径不写 _source，热层走分支 ④。lane / signal 的 editPoints 是
  // 中心线 / stopLines（开放折线），曾经被 isAreaEntity(lane)=true 错误地
  // 闭合成 Polygon——导致"导入的车道首尾闭合，自己画的不闭合"的体感差。

  it('imported lane (no _source) → 走 LineString，不被闭合', () => {
    const lane: LaneEntity = {
      id: 'lane_imported',
      entityType: 'lane' as const,
      centralCurve: {
        segments: [
          {
            lineSegment: {
              points: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 2, y: 1 },
              ],
            },
            s: 0,
            startPosition: { x: 0, y: 0 },
            heading: 0,
            length: 0,
          },
        ],
      },
      leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
      rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
      length: 0,
      type: 'CITY_DRIVING' as const,
      turn: 'NO_TURN' as const,
      direction: 'FORWARD' as const,
      speedLimit: 0,
      predecessorIds: [],
      successorIds: [],
      leftNeighborForwardIds: [],
      rightNeighborForwardIds: [],
      leftNeighborReverseIds: [],
      rightNeighborReverseIds: [],
      selfReverseLaneIds: [],
      junctionId: null,
      overlapIds: [],
      leftSamples: [{ s: 0, width: 1.5 }],
      rightSamples: [{ s: 0, width: 1.5 }],
      leftRoadSamples: [],
      rightRoadSamples: [],
    };
    const features = entityToHotFeatures(lane);
    const polygons = features.filter((f) => f.geometry.type === 'Polygon');
    const lines = features.filter((f) => f.geometry.type === 'LineString');
    expect(polygons.length).toBe(0);
    expect(lines.length).toBe(1);
    const ls = lines[0]!.geometry as GeoJSON.LineString;
    // 中心线 3 点，开放——首尾不重合
    expect(ls.coordinates).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
    ]);
  });

  it('imported signal (no _source, stopLines 非空) → 走 LineString，不被闭合', () => {
    const signal: SignalEntity = {
      id: 'signal_imported',
      entityType: 'signal' as const,
      boundary: {
        points: [
          { x: 10, y: 10 },
          { x: 11, y: 10 },
          { x: 11, y: 11 },
          { x: 10, y: 11 },
        ],
      },
      subsignals: [],
      type: 'MIX_3_VERTICAL' as const,
      overlapIds: [],
      stopLines: [
        {
          segments: [
            {
              lineSegment: {
                points: [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                ],
              },
              s: 0,
              startPosition: { x: 0, y: 0 },
              heading: 0,
              length: 0,
            },
          ],
        },
      ],
      signInfo: [],
    };
    const features = entityToHotFeatures(signal);
    const polygons = features.filter((f) => f.geometry.type === 'Polygon');
    const lines = features.filter((f) => f.geometry.type === 'LineString');
    expect(polygons.length).toBe(0);
    expect(lines.length).toBe(1);
  });
});

// ── isPolygonEditEntity 直接测 ─────────────────────────────────────

import { isPolygonEditEntity } from '../entityOps';

describe('isPolygonEditEntity', () => {
  it('lane 是 area（hitTest 用）但 editPoints 是折线 → false', () => {
    expect(isPolygonEditEntity({ entityType: 'lane' })).toBe(false);
  });

  it.each(['signal', 'stopSign', 'yieldSign', 'speedBump', 'barrierGate'] as const)(
    '%s 的 editPoints 来自 stop_line / position 折线 → false',
    (t) => {
      expect(isPolygonEditEntity({ entityType: t })).toBe(false);
    },
  );

  it.each(['junction', 'pncJunction', 'parkingSpace', 'crosswalk', 'clearArea', 'area'] as const)(
    '%s 的 editPoints 是多边形环 → true',
    (t) => {
      expect(isPolygonEditEntity({ entityType: t })).toBe(true);
    },
  );

  it('drawing rect / polygon → true', () => {
    expect(isPolygonEditEntity({ entityType: 'rect' })).toBe(true);
    expect(isPolygonEditEntity({ entityType: 'polygon' })).toBe(true);
  });

  it('drawing polyline / catmullRom / bezier / arc → false', () => {
    expect(isPolygonEditEntity({ entityType: 'polyline' })).toBe(false);
    expect(isPolygonEditEntity({ entityType: 'catmullRom' })).toBe(false);
    expect(isPolygonEditEntity({ entityType: 'bezier' })).toBe(false);
    expect(isPolygonEditEntity({ entityType: 'arc' })).toBe(false);
  });
});
