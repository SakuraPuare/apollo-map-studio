import type {
  CrosswalkEntity,
  Curve,
  JunctionEntity,
  LaneEntity,
  OverlapEntity,
  RoadEntity,
} from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

const LAT = 39.9;
const LNG = 116.4;
const DEG_PER_M = 1 / 111_320;

function laneCurve(points: { x: number; y: number }[]): Curve {
  const startPosition = points[0] ?? { x: 0, y: 0 };
  return {
    segments: [
      {
        s: 0,
        startPosition,
        heading: 0,
        length: 0,
        lineSegment: { points },
      },
    ],
  };
}

export function makePerfLane(id: string, index: number, pointCount = 2): LaneEntity {
  const row = Math.floor(index / 250);
  const col = index % 250;
  const startX = LNG + col * 35 * DEG_PER_M;
  const y = LAT + row * 14 * DEG_PER_M;
  const points = Array.from({ length: pointCount }, (_, i) => ({
    x: startX + i * 12 * DEG_PER_M,
    y: y + Math.sin((index + i) * 0.17) * 0.35 * DEG_PER_M,
  }));

  return {
    id,
    entityType: 'lane',
    centralCurve: laneCurve(points),
    leftBoundary: { curve: laneCurve(points), length: 0, boundaryType: [] },
    rightBoundary: { curve: laneCurve(points), length: 0, boundaryType: [] },
    length: Math.max(0, pointCount - 1) * 12,
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

function makePerfCrosswalk(id: string, index: number, halfM = 5): CrosswalkEntity {
  const row = Math.floor(index / 100);
  const col = index % 100;
  const cx = LNG + col * 70 * DEG_PER_M;
  const cy = LAT + row * 28 * DEG_PER_M;
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

function makePerfJunction(id: string, index: number, halfM = 12): JunctionEntity {
  const row = Math.floor(index / 100);
  const col = index % 100;
  const cx = LNG + col * 90 * DEG_PER_M;
  const cy = LAT + row * 36 * DEG_PER_M;
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

export function makePerfRoad(id: string, laneIds: string[], sectionSize = 16): RoadEntity {
  const sections = [];
  for (let i = 0; i < laneIds.length; i += sectionSize) {
    sections.push({
      id: `${id}_section_${i / sectionSize}`,
      laneIds: laneIds.slice(i, i + sectionSize),
    });
  }
  return { id, entityType: 'road', sections, junctionId: null, type: 'CITY_ROAD' };
}

export function makePerfOverlap(id: string, laneId: string, crosswalkId: string): OverlapEntity {
  return {
    id,
    entityType: 'overlap',
    objects: [
      {
        objectType: 'lane',
        objectId: laneId,
        laneOverlapInfo: { startS: 0, endS: 4, isMerge: false },
      },
      { objectType: 'crosswalk', objectId: crosswalkId },
    ],
    regionOverlaps: [],
  };
}

export function buildPerfEntityMap(laneCount: number, pointCount = 2): Map<string, MapEntity> {
  const entities = new Map<string, MapEntity>();
  for (let i = 0; i < laneCount; i++) {
    const lane = makePerfLane(`lane_${i}`, i, pointCount);
    entities.set(lane.id, lane);
  }
  const crosswalkCount = Math.max(1, Math.floor(laneCount / 25));
  for (let i = 0; i < crosswalkCount; i++) {
    const crosswalk = makePerfCrosswalk(`crosswalk_${i}`, i);
    entities.set(crosswalk.id, crosswalk);
  }
  const junctionCount = Math.max(1, Math.floor(laneCount / 40));
  for (let i = 0; i < junctionCount; i++) {
    const junction = makePerfJunction(`junction_${i}`, i);
    entities.set(junction.id, junction);
  }
  return entities;
}

export function buildPerfEntities(laneCount: number, pointCount = 2): MapEntity[] {
  return [...buildPerfEntityMap(laneCount, pointCount).values()];
}

export function makeLongLane(id: string, pointCount: number): LaneEntity {
  return makePerfLane(id, 0, pointCount);
}
