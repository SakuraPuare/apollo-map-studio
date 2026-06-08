import { describe, expect, it } from 'vitest';
import type { ObjectOverlapInfo, OverlapEntity } from '@/types/apollo';
import { entityToRawOverlap, rawOverlapToEntity } from '../overlap';

describe('overlap bridge', () => {
  it('drops raw overlaps without a usable id', () => {
    expect(rawOverlapToEntity({})).toBeNull();
    expect(rawOverlapToEntity({ id: {} })).toBeNull();
  });

  it('imports lane, crosswalk, unknown, and simple overlap objects', () => {
    const entity = rawOverlapToEntity({
      id: { id: 'overlap_1' },
      object: [
        {
          id: { id: 'lane_1' },
          lane_overlap_info: {
            start_s: 0,
            end_s: 12.5,
            is_merge: false,
            region_overlap_id: { id: 'region_1' },
          },
        },
        {
          id: { id: 'crosswalk_1' },
          crosswalk_overlap_info: { region_overlap_id: { id: 'region_2' } },
        },
        { id: { id: 'signal_1' }, signal_overlap_info: {} },
        { id: { id: 'stop_1' }, stop_sign_overlap_info: {} },
        { id: { id: 'id_only_1' } },
        { id: {} },
      ],
      region_overlap: [
        {
          id: { id: 'region_1' },
          polygon: [{ point: [{ x: 1, y: 2, z: 3 }, { x: 4 }] }],
        },
      ],
    });

    expect(entity).toEqual({
      id: 'overlap_1',
      entityType: 'overlap',
      objects: [
        {
          objectType: 'lane',
          objectId: 'lane_1',
          laneOverlapInfo: {
            startS: 0,
            endS: 12.5,
            isMerge: false,
            regionOverlapId: 'region_1',
          },
        },
        {
          objectType: 'crosswalk',
          objectId: 'crosswalk_1',
          regionOverlapId: 'region_2',
        },
        { objectType: 'signal', objectId: 'signal_1' },
        { objectType: 'stopSign', objectId: 'stop_1' },
        { objectType: 'unknown', objectId: 'id_only_1' },
      ],
      regionOverlaps: [
        {
          id: 'region_1',
          polygons: [
            {
              points: [
                { x: 1, y: 2, z: 3 },
                { x: 4, y: 0 },
              ],
            },
          ],
        },
      ],
    });
  });

  it('preserves absent optional lane/crosswalk overlap scalars on import', () => {
    const entity = rawOverlapToEntity({
      id: { id: 'overlap_sparse' },
      object: [
        { id: { id: 'lane_sparse' }, lane_overlap_info: {} },
        { id: { id: 'crosswalk_sparse' }, crosswalk_overlap_info: {} },
      ],
      region_overlap: [{ id: {}, polygon: [{}] }],
    })!;

    expect(entity.objects).toEqual([
      { objectType: 'lane', objectId: 'lane_sparse', laneOverlapInfo: {} },
      { objectType: 'crosswalk', objectId: 'crosswalk_sparse' },
    ]);
    expect(entity.regionOverlaps).toEqual([{ id: '', polygons: [{ points: [] }] }]);
  });

  it('exports every overlap object variant to the matching proto oneof field', () => {
    const simpleObjects: ObjectOverlapInfo[] = [
      { objectType: 'signal', objectId: 'signal_1' },
      { objectType: 'stopSign', objectId: 'stop_1' },
      { objectType: 'junction', objectId: 'junction_1' },
      { objectType: 'yieldSign', objectId: 'yield_1' },
      { objectType: 'clearArea', objectId: 'clear_1' },
      { objectType: 'speedBump', objectId: 'bump_1' },
      { objectType: 'parkingSpace', objectId: 'parking_1' },
      { objectType: 'pncJunction', objectId: 'pnc_1' },
      { objectType: 'rsu', objectId: 'rsu_1' },
      { objectType: 'area', objectId: 'area_1' },
      { objectType: 'barrierGate', objectId: 'gate_1' },
    ];
    const raw = entityToRawOverlap({
      id: 'overlap_2',
      entityType: 'overlap',
      objects: [
        {
          objectType: 'lane',
          objectId: 'lane_1',
          laneOverlapInfo: {
            startS: 0,
            endS: 20,
            isMerge: false,
            regionOverlapId: 'region_1',
          },
        },
        {
          objectType: 'crosswalk',
          objectId: 'crosswalk_1',
          regionOverlapId: 'region_2',
        },
        { objectType: 'unknown', objectId: 'id_only_1' },
        ...simpleObjects,
      ],
      regionOverlaps: [
        {
          id: 'region_1',
          polygons: [
            {
              points: [
                { x: 1, y: 2, z: 3 },
                { x: 4, y: 5 },
              ],
            },
          ],
        },
      ],
    });

    expect(raw).toEqual({
      id: { id: 'overlap_2' },
      object: [
        {
          id: { id: 'lane_1' },
          lane_overlap_info: {
            start_s: 0,
            end_s: 20,
            is_merge: false,
            region_overlap_id: { id: 'region_1' },
          },
        },
        {
          id: { id: 'crosswalk_1' },
          crosswalk_overlap_info: { region_overlap_id: { id: 'region_2' } },
        },
        { id: { id: 'id_only_1' } },
        { id: { id: 'signal_1' }, signal_overlap_info: {} },
        { id: { id: 'stop_1' }, stop_sign_overlap_info: {} },
        { id: { id: 'junction_1' }, junction_overlap_info: {} },
        { id: { id: 'yield_1' }, yield_sign_overlap_info: {} },
        { id: { id: 'clear_1' }, clear_area_overlap_info: {} },
        { id: { id: 'bump_1' }, speed_bump_overlap_info: {} },
        { id: { id: 'parking_1' }, parking_space_overlap_info: {} },
        { id: { id: 'pnc_1' }, pnc_junction_overlap_info: {} },
        { id: { id: 'rsu_1' }, rsu_overlap_info: {} },
        { id: { id: 'area_1' }, area_overlap_info: {} },
        { id: { id: 'gate_1' }, barrier_gate_overlap_info: {} },
      ],
      region_overlap: [
        {
          id: { id: 'region_1' },
          polygon: [
            {
              point: [
                { x: 1, y: 2, z: 3 },
                { x: 4, y: 5 },
              ],
            },
          ],
        },
      ],
    });
  });

  it('omits absent lane and crosswalk optionals on export', () => {
    const raw = entityToRawOverlap({
      id: 'overlap_sparse',
      entityType: 'overlap',
      objects: [
        { objectType: 'lane', objectId: 'lane_sparse', laneOverlapInfo: {} },
        { objectType: 'crosswalk', objectId: 'crosswalk_sparse' },
      ],
      regionOverlaps: [],
    });

    expect(raw).toEqual({
      id: { id: 'overlap_sparse' },
      object: [
        { id: { id: 'lane_sparse' }, lane_overlap_info: {} },
        { id: { id: 'crosswalk_sparse' }, crosswalk_overlap_info: {} },
      ],
      region_overlap: [],
    });
  });

  it('round-trips imported overlap data through the entity shape', () => {
    const entity: OverlapEntity = {
      id: 'overlap_roundtrip',
      entityType: 'overlap',
      objects: [
        {
          objectType: 'lane',
          objectId: 'lane_1',
          laneOverlapInfo: { startS: 1, endS: 2, isMerge: true },
        },
        { objectType: 'unknown', objectId: 'legacy_id_only' },
      ],
      regionOverlaps: [
        {
          id: 'region_roundtrip',
          polygons: [
            {
              points: [
                { x: 0, y: 1 },
                { x: 2, y: 3, z: 4 },
              ],
            },
          ],
        },
      ],
    };

    expect(rawOverlapToEntity(entityToRawOverlap(entity))).toEqual(entity);
  });
});
