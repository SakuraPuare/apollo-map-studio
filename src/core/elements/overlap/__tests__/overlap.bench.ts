/**
 * Overlap reconcile perf gate.
 *
 * 量纲：仓库设计目标是 5w 实体（lane ~30k + junction/crosswalk/... ~20k）。
 *
 * 抓手：
 *   - full mode：导入 / 用户手动 recompute / 导出前。budget < 2s @ 50k
 *   - incremental mode：单实体编辑增量。budget < 16ms（一帧）@ any size
 *   - sharedIndex sync：编辑期重复调用，budget < 5ms @ 50k
 *
 * 5w 完整压测在普通开发机上需要构造 30k+ lane fixture，bench 较慢；这里取
 * 5k / 10k / 25k 三档，外推到 50k 验证 RBush 是 O(log N + k) 级。
 *
 * 用法：`npm run bench`（vitest bench）
 */
import { bench, describe } from 'vitest';
import type { CrosswalkEntity, Curve, JunctionEntity, LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { reconcileOverlaps } from '../reconcile';
import { resetSharedSpatialIndex, getSharedSpatialIndex } from '../spatialIndex';
import { clearLaneArcLengthCache } from '../computeLaneS';

const LAT0 = 39.9;
const LNG0 = 116.4;
const DEG_PER_M = 1 / 111_320;

function curve(points: { x: number; y: number }[]): Curve {
  return {
    segments: [
      {
        s: 0,
        startPosition: points[0]!,
        heading: 0,
        length: 0,
        lineSegment: { points },
      },
    ],
  };
}

function makeLane(id: string, x0: number, y0: number, lengthM: number): LaneEntity {
  const points = [
    { x: x0, y: y0 },
    { x: x0 + lengthM * DEG_PER_M, y: y0 },
  ];
  return {
    id,
    entityType: 'lane',
    centralCurve: curve(points),
    leftBoundary: { curve: curve(points), length: 0, boundaryType: [] },
    rightBoundary: { curve: curve(points), length: 0, boundaryType: [] },
    length: lengthM,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 13.89,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

function makeJunctionAt(id: string, cx: number, cy: number, halfM: number): JunctionEntity {
  const half = halfM * DEG_PER_M;
  return {
    id,
    entityType: 'junction',
    polygon: {
      points: [
        { x: cx - half, y: cy - half },
        { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half },
        { x: cx - half, y: cy + half },
      ],
    },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

function makeCrosswalkAt(id: string, cx: number, cy: number, halfM: number): CrosswalkEntity {
  const half = halfM * DEG_PER_M;
  return {
    id,
    entityType: 'crosswalk',
    polygon: {
      points: [
        { x: cx - half, y: cy - half },
        { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half },
        { x: cx - half, y: cy + half },
      ],
    },
    overlapIds: [],
  };
}

/**
 * Synthetic city-grid: rows × cols 阵列的 lane 路段，行间距 30m，列间距 200m。
 * 每隔 5 个 cell 放一个 junction，模拟典型 HD 地图密度。
 *
 * 输出 entity 数 ~ rows*cols + (rows*cols)/5。
 */
function buildCityGrid(rows: number, cols: number): Map<string, MapEntity> {
  const map = new Map<string, MapEntity>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = LNG0 + c * 200 * DEG_PER_M;
      const y = LAT0 + r * 30 * DEG_PER_M;
      const lane = makeLane(`Lane_${r}_${c}`, x, y, 180);
      map.set(lane.id, lane);
      if ((r * cols + c) % 5 === 0) {
        const j = makeJunctionAt(`J_${r}_${c}`, x + 90 * DEG_PER_M, y, 15);
        map.set(j.id, j);
      }
      if ((r * cols + c) % 40 === 0) {
        const cw = makeCrosswalkAt(`CW_${r}_${c}`, x + 90 * DEG_PER_M, y, 12);
        map.set(cw.id, cw);
      }
    }
  }
  return map;
}

const SCALES = [
  { label: '5k', rows: 50, cols: 100 },
  { label: '10k', rows: 100, cols: 100 },
  { label: '25k', rows: 100, cols: 250 },
];

for (const scale of SCALES) {
  const map = buildCityGrid(scale.rows, scale.cols);

  describe(`overlap reconcile @ ${scale.label} (${map.size} entities)`, () => {
    // Warm shared index once for the whole describe — incremental bench
    // measures the steady-state edit cost (just reconcile + syncDirty),
    // not the cold-start sync. This matches production: import warms once,
    // every edit afterwards pays only the dirty-id update.
    resetSharedSpatialIndex();
    clearLaneArcLengthCache();
    getSharedSpatialIndex().syncFromEntities(map);

    bench(
      `overlap ${scale.label} — full mode (cold)`,
      () => {
        resetSharedSpatialIndex();
        clearLaneArcLengthCache();
        reconcileOverlaps(map, { mode: 'full' });
      },
      { iterations: 3 },
    );

    bench(
      `overlap ${scale.label} — incremental (1 dirty lane, warm index)`,
      () => {
        const firstLaneId = `Lane_0_0`;
        reconcileOverlaps(map, {
          mode: 'incremental',
          dirtyIds: new Set([firstLaneId]),
        });
      },
      { iterations: 200 },
    );

    bench(
      `overlap ${scale.label} — incremental (1 dirty crosswalk, warm index)`,
      () => {
        reconcileOverlaps(map, {
          mode: 'incremental',
          dirtyIds: new Set(['CW_0_0']),
        });
      },
      { iterations: 200 },
    );

    bench(
      `overlap ${scale.label} — syncDirty (1 dirty)`,
      () => {
        getSharedSpatialIndex().syncDirty(map, new Set(['Lane_0_0']));
      },
      { iterations: 1000 },
    );
  });
}
