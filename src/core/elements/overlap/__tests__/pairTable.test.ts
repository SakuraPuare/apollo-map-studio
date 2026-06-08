import { describe, expect, it } from 'vitest';
import { detectLaneLanePair, detectPair, emitLaneLaneObjects, findPairRule } from '../pairTable';
import {
  curve,
  makeBarrierGate,
  makeCrosswalk,
  makeJunction,
  makeLane,
  makePolygonEntity,
  makeSignal,
  makeSpeedBump,
  makeStopSign,
  makeYieldSign,
  pt,
} from './testHelpers';

const square = (minX: number, minY: number, maxX: number, maxY: number) => [
  pt(minX, minY),
  pt(maxX, minY),
  pt(maxX, maxY),
  pt(minX, maxY),
];

describe('pairTable rules', () => {
  it('finds configured secondary rules and rejects unsupported types', () => {
    expect(findPairRule('junction')?.geometry).toBe('polygon');
    expect(findPairRule('crosswalk')).toMatchObject({ geometry: 'polygon', computeRegion: true });
    expect(findPairRule('signal')?.geometry).toBe('stopLines');
    expect(findPairRule('stopSign')?.geometry).toBe('stopLines');
    expect(findPairRule('yieldSign')?.geometry).toBe('stopLines');
    expect(findPairRule('barrierGate')?.geometry).toBe('stopLines');
    expect(findPairRule('speedBump')?.geometry).toBe('polylines');
    expect(findPairRule('road')).toBeNull();
    expect(findPairRule('lane')).toBeNull();
  });

  it('emits lane and secondary overlap objects with explicit and derived lane intervals', () => {
    const lane = makeLane('L', [pt(0, 0), pt(1, 0)]);
    const crosswalk = makeCrosswalk('CW', square(0.2, -0.1, 0.3, 0.1));
    const crosswalkRule = findPairRule('crosswalk');
    expect(crosswalkRule).not.toBeNull();

    const objects = crosswalkRule!.emitObjects(
      lane,
      crosswalk,
      { intersects: true, laneInterval: { startS: 2, endS: 5 } },
      { regionId: 'region_1' },
    );

    expect(objects).toEqual([
      {
        objectType: 'lane',
        objectId: 'L',
        laneOverlapInfo: { startS: 2, endS: 5, regionOverlapId: 'region_1' },
      },
      { objectType: 'crosswalk', objectId: 'CW', regionOverlapId: 'region_1' },
    ]);

    const junctionRule = findPairRule('junction');
    expect(junctionRule).not.toBeNull();
    const defaultObjects = junctionRule!.emitObjects(
      lane,
      makeJunction('J', square(0.2, -0.1, 0.3, 0.1)),
      { intersects: true },
    );
    expect(defaultObjects[0]?.objectType).toBe('lane');
    if (defaultObjects[0]?.objectType === 'lane') {
      expect(defaultObjects[0].laneOverlapInfo.startS).toBe(0);
      expect(defaultObjects[0].laneOverlapInfo.endS).toBeGreaterThan(0);
    }
    expect(defaultObjects[1]).toEqual({ objectType: 'junction', objectId: 'J' });
  });

  it('emits every configured secondary object type', () => {
    const lane = makeLane('L', [pt(0, 0), pt(1, 0)]);
    const cases = [
      ['clearArea', makePolygonEntity('clearArea', 'clear_1', square(0, 0, 1, 1))],
      ['parkingSpace', makePolygonEntity('parkingSpace', 'parking_1', square(0, 0, 1, 1))],
      ['pncJunction', makePolygonEntity('pncJunction', 'pnc_1', square(0, 0, 1, 1))],
      ['area', makePolygonEntity('area', 'area_1', square(0, 0, 1, 1))],
      ['signal', makeSignal('signal_1')],
      ['stopSign', makeStopSign('stop_1', [])],
      ['yieldSign', makeYieldSign('yield_1', [])],
      ['barrierGate', makeBarrierGate('gate_1', square(0, 0, 1, 1))],
      ['speedBump', makeSpeedBump('bump_1', [])],
    ] as const;

    for (const [secondaryType, entity] of cases) {
      const rule = findPairRule(secondaryType);
      expect(rule, secondaryType).not.toBeNull();
      const objects = rule!.emitObjects(lane, entity, { intersects: true });
      expect(objects[0]).toMatchObject({ objectType: 'lane', objectId: lane.id });
      expect(objects[1]).toMatchObject({ objectId: entity.id });
      expect(objects[1]!.objectType).toBe(rule!.secondaryType);
    }
  });
});

describe('detectPair', () => {
  it('rejects degenerate lanes and degenerate secondary polygons', () => {
    const junctionRule = findPairRule('junction');
    expect(junctionRule).not.toBeNull();

    expect(
      detectPair(makeLane('L', [pt(0, 0)]), makeJunction('J', square(0, 0, 1, 1)), junctionRule!)
        .intersects,
    ).toBe(false);
    expect(
      detectPair(
        makeLane('L', [pt(-1, 0), pt(2, 0)]),
        makeJunction('J', [pt(0, 0), pt(1, 0)]),
        junctionRule!,
      ).intersects,
    ).toBe(false);
  });

  it('detects polygon crossings and lane intervals', () => {
    const lane = makeLane('L', [pt(-1, 0), pt(2, 0)]);
    const junction = makeJunction('J', square(0, -0.5, 1, 0.5));
    const rule = findPairRule('junction');
    expect(rule).not.toBeNull();

    const hit = detectPair(lane, junction, rule!);

    expect(hit.intersects).toBe(true);
    expect(hit.laneInterval?.startS).toBeGreaterThan(0);
    expect(hit.laneInterval?.endS).toBeGreaterThan(hit.laneInterval!.startS);
    expect(hit.regionPolygon).toBeUndefined();
  });

  it('computes a region polygon for crosswalk rules when the lane corridor overlaps', () => {
    const lane = makeLane('L', [pt(116, 39.9), pt(116.001, 39.9)]);
    const crosswalk = makeCrosswalk('CW', square(116.0002, 39.89998, 116.0004, 39.90002));
    const rule = findPairRule('crosswalk');
    expect(rule).not.toBeNull();

    const hit = detectPair(lane, crosswalk, rule!);

    expect(hit.intersects).toBe(true);
    expect(hit.regionPolygon?.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps crosswalk hits when region polygon derivation is degenerate', () => {
    const lane = makeLane('L', [pt(116, 39.9), pt(116.001, 39.9)], {
      leftSamples: [{ s: 0, width: 0 }],
      rightSamples: [{ s: 0, width: 0 }],
    });
    const crosswalk = makeCrosswalk('CW', square(116.0002, 39.89998, 116.0004, 39.90002));
    const rule = findPairRule('crosswalk');
    expect(rule).not.toBeNull();

    const hit = detectPair(lane, crosswalk, rule!);

    expect(hit.intersects).toBe(true);
    expect(hit.regionPolygon).toBeUndefined();
  });

  it('detects stop-line and polyline crossings while ignoring non-crossing groups', () => {
    const lane = makeLane('L', [pt(0, 0), pt(1, 0)]);
    const signal = makeSignal('S', {
      stopLines: [
        curve([pt(0.25, -1), pt(0.25, 1)]),
        curve([pt(0.75, -1), pt(0.75, 1)]),
        curve([pt(2, 2), pt(3, 2)]),
      ],
    });
    const signalRule = findPairRule('signal');
    expect(signalRule).not.toBeNull();

    const signalHit = detectPair(lane, signal, signalRule!);
    expect(signalHit.intersects).toBe(true);
    expect(signalHit.laneInterval?.startS).toBeGreaterThan(0);
    expect(signalHit.laneInterval?.endS).toBeGreaterThan(signalHit.laneInterval!.startS);

    const speedBump = makeSpeedBump('SB', [curve([pt(0.5, -1), pt(0.5, 1)])]);
    const speedBumpRule = findPairRule('speedBump');
    expect(speedBumpRule).not.toBeNull();
    expect(detectPair(lane, speedBump, speedBumpRule!).intersects).toBe(true);

    const farSignal = makeSignal('S_far', { stopLines: [curve([pt(2, 2), pt(3, 2)])] });
    expect(detectPair(lane, farSignal, signalRule!).intersects).toBe(false);
  });
});

describe('detectLaneLanePair', () => {
  it('requires usable centerlines', () => {
    expect(
      detectLaneLanePair(makeLane('A', [pt(0, 0)]), makeLane('B', [pt(0, 0), pt(1, 0)])),
    ).toEqual({ intersects: false });
  });

  it('detects true crossings outside junctions but ignores pure endpoint topology', () => {
    const crossing = detectLaneLanePair(
      makeLane('A', [pt(0, 0), pt(1, 1)]),
      makeLane('B', [pt(0, 1), pt(1, 0)]),
    );
    expect(crossing.intersects).toBe(true);
    expect(crossing.isMerge).toBe(false);
    expect(crossing.laneInterval?.startS).toBeGreaterThan(0);

    const endpointTouch = detectLaneLanePair(
      makeLane('A', [pt(0, 0), pt(1, 0)]),
      makeLane('B', [pt(1, 0), pt(2, 0)]),
    );
    expect(endpointTouch).toEqual({ intersects: false });
  });

  it('counts same-junction endpoint merges and splits with correct merge flag', () => {
    const merge = detectLaneLanePair(
      makeLane('A', [pt(0, 0), pt(1, 0)], { junctionId: 'J' }),
      makeLane('B', [pt(0, 1), pt(1, 0)], { junctionId: 'J' }),
    );
    expect(merge.intersects).toBe(true);
    expect(merge.isMerge).toBe(true);

    const split = detectLaneLanePair(
      makeLane('C', [pt(0, 0), pt(1, 0)], { junctionId: 'J' }),
      makeLane('D', [pt(0, 0), pt(1, 1)], { junctionId: 'J' }),
    );
    expect(split.intersects).toBe(true);
    expect(split.isMerge).toBe(false);
  });

  it('emits lane-lane object pairs from asymmetric hits', () => {
    const objects = emitLaneLaneObjects(
      makeLane('A', [pt(0, 0), pt(1, 0)]),
      makeLane('B', [pt(0, 1), pt(1, 1)]),
      { intersects: true, laneInterval: { startS: 1, endS: 2 }, isMerge: true },
      { intersects: true, laneInterval: { startS: 3, endS: 4 }, isMerge: false },
    );

    expect(objects).toEqual([
      {
        objectType: 'lane',
        objectId: 'A',
        laneOverlapInfo: { startS: 1, endS: 2, isMerge: true },
      },
      {
        objectType: 'lane',
        objectId: 'B',
        laneOverlapInfo: { startS: 3, endS: 4, isMerge: false },
      },
    ]);
  });
});
