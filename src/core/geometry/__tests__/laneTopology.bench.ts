/**
 * Benchmark for `reconcileLaneTopology` / `reconcileLaneTopologyIncremental`.
 *
 * The full path rebuilds topology indices from the whole entity map and then
 * derives pred/succ/neighbour/junction state. The incremental path still
 * builds indices, but the affected set should stay local to the dirty lanes.
 */
import { bench, describe } from 'vitest';
import { reconcileLaneTopology, reconcileLaneTopologyIncremental } from '../laneTopology';
import type { LaneEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';

const LAT = 30;
const DEG_TO_M = 111320;
const mPerLng = Math.cos((LAT * Math.PI) / 180) * DEG_TO_M;

function makeLane(id: string, startX: number, endX: number): LaneEntity {
  return {
    id,
    entityType: 'lane',
    centralCurve: {
      segments: [
        {
          s: 0,
          startPosition: { x: startX, y: LAT },
          heading: 0,
          length: 0,
          lineSegment: {
            points: [
              { x: startX, y: LAT },
              { x: endX, y: LAT },
            ],
          },
        },
      ],
    },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: (endX - startX) * mPerLng,
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

function buildLinearChain(count: number, spacingM = 100): LaneEntity[] {
  const lanes: LaneEntity[] = [];
  for (let i = 0; i < count; i++) {
    const startX = 116 + (i * spacingM) / mPerLng;
    const endX = 116 + ((i + 1) * spacingM) / mPerLng;
    lanes.push(makeLane(`lane_${i}`, startX, endX));
  }
  return lanes;
}

function makeMap(lanes: LaneEntity[]): Map<string, MapEntity> {
  const m = new Map<string, MapEntity>();
  for (const lane of lanes) m.set(lane.id, lane);
  return m;
}

function makeIncrementalMaps(count: number) {
  const before = buildLinearChain(count);
  const after = buildLinearChain(count);
  const dirtyIndex = Math.floor(count / 2);
  const dirtyLane = after[dirtyIndex]!;
  after[dirtyIndex] = makeLane(
    dirtyLane.id,
    dirtyLane.centralCurve.segments[0]!.lineSegment.points[0]!.x + 0.000002,
    dirtyLane.centralCurve.segments[0]!.lineSegment.points[1]!.x + 0.000002,
  );
  return {
    current: makeMap(after),
    previous: new Map(before.map((lane) => [lane.id, lane])),
    dirtyIds: new Set([`lane_${dirtyIndex}`]),
  };
}

const SCALES = [
  { label: '100 lanes', count: 100 },
  { label: '500 lanes', count: 500 },
  { label: '1000 lanes', count: 1000 },
];

for (const scale of SCALES) {
  describe(`lane topology @ ${scale.label}`, () => {
    const lanes = buildLinearChain(scale.count);
    const map = makeMap(lanes);

    bench(`topology ${scale.label} — full reconcile`, () => {
      reconcileLaneTopology(map);
    });

    const incremental = makeIncrementalMaps(scale.count);
    bench(`topology ${scale.label} — incremental (1 dirty lane)`, () => {
      reconcileLaneTopologyIncremental(incremental.current, {
        dirtyIds: incremental.dirtyIds,
        previousEntities: incremental.previous,
      });
    });
  });
}
