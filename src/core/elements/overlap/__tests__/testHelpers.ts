import type {
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  Curve,
  JunctionEntity,
  LaneEntity,
  ParkingLotEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  SignalEntity,
  SpeedBumpEntity,
  SpeedControlEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { GeoPoint, MapEntity, PolylineEntity } from '@/types/entities';

export function pt(x: number, y: number, z?: number): GeoPoint {
  return z === undefined ? { x, y } : { x, y, z };
}

export function curveFromSegments(...segments: GeoPoint[][]): Curve {
  return {
    segments: segments.map((points) => {
      const segment: Curve['segments'][number] = { lineSegment: { points } };
      if (points[0]) {
        segment.s = 0;
        segment.startPosition = points[0];
        segment.heading = 0;
        segment.length = 0;
      }
      return segment;
    }),
  };
}

export function curve(points: GeoPoint[]): Curve {
  return curveFromSegments(points);
}

export function makeLane(
  id: string,
  points: GeoPoint[],
  opts: {
    junctionId?: string | null;
    centralSegments?: GeoPoint[][];
    leftSamples?: LaneEntity['leftSamples'];
    rightSamples?: LaneEntity['rightSamples'];
    overlapIds?: string[];
  } = {},
): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: opts.centralSegments ? curveFromSegments(...opts.centralSegments) : curve(points),
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
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
    junctionId: opts.junctionId ?? null,
    overlapIds: opts.overlapIds ?? [],
    leftSamples: opts.leftSamples ?? [{ s: 0, width: 1.5 }],
    rightSamples: opts.rightSamples ?? [{ s: 0, width: 1.5 }],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
}

export function makeJunction(id: string, points: GeoPoint[]): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: { points },
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

export function makeCrosswalk(id: string, points: GeoPoint[]): CrosswalkEntity {
  return {
    id,
    entityType: 'crosswalk',
    polygon: { points },
    overlapIds: [],
  };
}

export function makeSignal(
  id: string,
  opts: { boundary?: GeoPoint[]; stopLines?: Curve[] } = {},
): SignalEntity {
  return {
    id,
    entityType: 'signal',
    boundary: { points: opts.boundary ?? [] },
    subsignals: [],
    type: 'UNKNOWN_SIGNAL',
    overlapIds: [],
    stopLines: opts.stopLines ?? [],
    signInfo: [],
  };
}

export function makeStopSign(id: string, stopLines: Curve[]): StopSignEntity {
  return {
    id,
    entityType: 'stopSign',
    stopLines,
    overlapIds: [],
  };
}

export function makeYieldSign(id: string, stopLines: Curve[]): YieldSignEntity {
  return {
    id,
    entityType: 'yieldSign',
    stopLines,
    overlapIds: [],
  };
}

export function makeSpeedBump(id: string, position: Curve[]): SpeedBumpEntity {
  return {
    id,
    entityType: 'speedBump',
    position,
    overlapIds: [],
  };
}

export function makeBarrierGate(
  id: string,
  polygon: GeoPoint[],
  stopLines: Curve[] = [],
): BarrierGateEntity {
  return {
    id,
    entityType: 'barrierGate',
    type: 'ROD',
    polygon: { points: polygon },
    stopLines,
    overlapIds: [],
  };
}

export function makePolyline(id: string, points: GeoPoint[]): PolylineEntity {
  return { id, entityType: 'polyline', points };
}

export function makePolygonEntity(
  entityType: 'clearArea' | 'parkingSpace' | 'parkingLot' | 'pncJunction' | 'area' | 'speedControl',
  id: string,
  points: GeoPoint[],
): MapEntity {
  switch (entityType) {
    case 'clearArea': {
      const entity: ClearAreaEntity = { id, entityType, polygon: { points }, overlapIds: [] };
      return entity;
    }
    case 'parkingSpace': {
      const entity: ParkingSpaceEntity = {
        id,
        entityType,
        polygon: { points },
        heading: 0,
        overlapIds: [],
      };
      return entity;
    }
    case 'parkingLot': {
      const entity: ParkingLotEntity = { id, entityType, polygon: { points }, overlapIds: [] };
      return entity;
    }
    case 'pncJunction': {
      const entity: PNCJunctionEntity = {
        id,
        entityType,
        polygon: { points },
        overlapIds: [],
        passageGroups: [],
      };
      return entity;
    }
    case 'area': {
      const entity: AreaEntity = {
        id,
        entityType,
        type: 'Driveable',
        polygon: { points },
        overlapIds: [],
      };
      return entity;
    }
    case 'speedControl': {
      const entity: SpeedControlEntity = {
        id,
        entityType,
        name: id,
        polygon: { points },
        speedLimit: 12,
      };
      return entity;
    }
  }
}

export function entityMap(...entities: MapEntity[]): Map<string, MapEntity> {
  const out = new Map<string, MapEntity>();
  for (const entity of entities) out.set(entity.id, entity);
  return out;
}
