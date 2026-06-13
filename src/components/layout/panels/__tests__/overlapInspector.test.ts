/**
 * Inspector pin contract — pure transforms.
 *
 * 这层和 reconcile.test.ts 的 "honors `_userOverrides: ['regionOverlaps']`"
 * 配合形成端到端闭环：
 *   - 这里测 UI 写出的 _userOverrides 形状（withOverride / clearOverride）
 *   - reconcile 那边测被钉住后 polygon / regionOverlapId 不被覆盖
 * 路径常量 REGION_OVERLAPS_OVERRIDE_PATH 是两端的合同。
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  addPassageGroup,
  addPassageToGroup,
  makeBlankPassage,
  removePassageFromGroup,
  removePassageGroup,
  updatePassageInGroup,
} from '../InspectorForms/pncJunction';
import {
  applyLaneMergeOverride,
  describeObject,
  pinRegionOverlaps,
  releaseLaneMergeOverride,
  releaseRegionOverlaps,
} from '../InspectorForms/overlap';
import {
  withOverride,
  clearOverride,
  REGION_OVERLAPS_OVERRIDE_PATH,
} from '../InspectorForms/overlapOverrides';
import { laneIsMergeOverridePath } from '@/core/elements/overlap/overridePaths';
import { useLicenseStore } from '@/store/licenseStore';
import { useMapStore } from '@/store/mapStore';
import type { LicenseState } from '@/lib/license-bridge';
import type { ObjectOverlapInfo, OverlapEntity, PassageGroup } from '@/types/apollo';

const editableLicenseState: LicenseState = {
  status: 'trial',
  canEdit: true,
  machineCode: '',
  trialStart: 0,
  trialEnd: 0,
  daysRemaining: 7,
  hoursRemaining: 7 * 24,
  license: null,
  checkedAt: 0,
  reason: '',
};

const readOnlyLicenseState: LicenseState = {
  ...editableLicenseState,
  status: 'expired_trial',
  canEdit: false,
  daysRemaining: 0,
  hoursRemaining: 0,
  reason: 'expired',
};

function makeOverlap(overrides: Partial<OverlapEntity> = {}): OverlapEntity {
  return {
    id: 'Overlap_test',
    entityType: 'overlap',
    objects: [],
    regionOverlaps: [],
    ...overrides,
  };
}

function laneObject(
  objectId: string,
  laneOverlapInfo: Extract<ObjectOverlapInfo, { objectType: 'lane' }>['laneOverlapInfo'] = {},
): ObjectOverlapInfo {
  return { objectType: 'lane', objectId, laneOverlapInfo };
}

function passageGroups(): PassageGroup[] {
  return [
    {
      id: 'passagegroup_1',
      passages: [
        {
          id: 'passage_1',
          laneIds: ['lane_a'],
          signalIds: [],
          stopSignIds: [],
          yieldIds: [],
          type: 'ENTRANCE',
        },
      ],
    },
    {
      id: 'passagegroup_3',
      passages: [],
    },
  ];
}

beforeEach(() => {
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: vi.fn(),
  });
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  useLicenseStore.setState({
    state: editableLicenseState,
    initialized: true,
    promptActivation: vi.fn(),
  });
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
});

describe('overlap inspector pin transforms', () => {
  it('withOverride adds the path on a fresh entity', () => {
    const e = makeOverlap();
    const next = withOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toEqual(['regionOverlaps']);
  });

  it('withOverride is idempotent — adding twice is a no-op (same reference)', () => {
    const e = makeOverlap({ _userOverrides: ['regionOverlaps'] });
    const next = withOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next).toBe(e);
  });

  it('withOverride preserves other paths (e.g. an isMerge pin) when adding region pin', () => {
    const e = makeOverlap({
      _userOverrides: ['objects.0.laneOverlapInfo.isMerge'],
    });
    const next = withOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toEqual(['objects.0.laneOverlapInfo.isMerge', 'regionOverlaps']);
  });

  it('clearOverride removes the path', () => {
    const e = makeOverlap({ _userOverrides: ['regionOverlaps'] });
    const next = clearOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toBeUndefined();
  });

  it('clearOverride preserves sibling pins', () => {
    const e = makeOverlap({
      _userOverrides: ['objects.0.laneOverlapInfo.isMerge', 'regionOverlaps'],
    });
    const next = clearOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next._userOverrides).toEqual(['objects.0.laneOverlapInfo.isMerge']);
  });

  it('clearOverride is a no-op when the path is not present', () => {
    const e = makeOverlap({
      _userOverrides: ['objects.0.laneOverlapInfo.isMerge'],
    });
    const next = clearOverride(e, REGION_OVERLAPS_OVERRIDE_PATH);
    expect(next).toBe(e);
  });

  it('REGION_OVERLAPS_OVERRIDE_PATH matches the literal string consumed by reconcile', () => {
    // Hard contract — if reconcile changes the path, both ends must move.
    expect(REGION_OVERLAPS_OVERRIDE_PATH).toBe('regionOverlaps');
  });

  it('applyLaneMergeOverride writes isMerge and pins the lane object path', () => {
    const e = makeOverlap({
      objects: [
        laneObject('lane_a', {
          startS: 1,
          endS: 4,
          isMerge: false,
          regionOverlapId: 'region_a',
        }),
        { objectType: 'signal', objectId: 'signal_a' },
      ],
    });

    const next = applyLaneMergeOverride(e, 0, true);

    expect(next).not.toBe(e);
    expect(next.objects[0]).toEqual(
      laneObject('lane_a', {
        startS: 1,
        endS: 4,
        isMerge: true,
        regionOverlapId: 'region_a',
      }),
    );
    expect(next.objects[1]).toBe(e.objects[1]);
    expect(next._userOverrides).toEqual([laneIsMergeOverridePath(0)]);
  });

  it('applyLaneMergeOverride preserves sibling pins and ignores non-lane indexes', () => {
    const e = makeOverlap({
      objects: [laneObject('lane_a'), { objectType: 'signal', objectId: 'signal_a' }],
      _userOverrides: [REGION_OVERLAPS_OVERRIDE_PATH],
    });

    expect(applyLaneMergeOverride(e, 1, true)).toBe(e);
    expect(applyLaneMergeOverride(e, 99, true)).toBe(e);
    expect(applyLaneMergeOverride(e, 0, true)._userOverrides).toEqual([
      REGION_OVERLAPS_OVERRIDE_PATH,
      laneIsMergeOverridePath(0),
    ]);
  });

  it('release helpers remove only the requested lane or region pin', () => {
    const e = makeOverlap({
      _userOverrides: [laneIsMergeOverridePath(0), REGION_OVERLAPS_OVERRIDE_PATH],
    });

    expect(releaseLaneMergeOverride(e, 0)._userOverrides).toEqual([REGION_OVERLAPS_OVERRIDE_PATH]);
    expect(releaseRegionOverlaps(e)._userOverrides).toEqual([laneIsMergeOverridePath(0)]);
  });

  it('pinRegionOverlaps adds the region override without duplicating it', () => {
    const e = makeOverlap({ _userOverrides: [laneIsMergeOverridePath(0)] });
    const pinned = pinRegionOverlaps(e);

    expect(pinned._userOverrides).toEqual([
      laneIsMergeOverridePath(0),
      REGION_OVERLAPS_OVERRIDE_PATH,
    ]);
    expect(pinRegionOverlaps(pinned)).toBe(pinned);
  });

  it('describes overlap participants including lane ranges and missing ranges', () => {
    expect(
      describeObject(laneObject('lane_0000000001', { startS: 1, endS: 4, isMerge: true })),
    ).toContain('s=1.0~4.0m');
    expect(describeObject(laneObject('lane_0000000002'))).toContain('s=—');
    expect(describeObject({ objectType: 'pncJunction', objectId: 'pnc_junction_1' })).toContain(
      'pncJunction',
    );
  });

  it('store read-only mode blocks inspector-derived overlap mutations', () => {
    const promptActivation = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = makeOverlap({ objects: [laneObject('lane_a', { isMerge: false })] });
    useMapStore.setState({ entities: new Map([[e.id, e]]) });
    useLicenseStore.setState({
      state: readOnlyLicenseState,
      initialized: true,
      promptActivation,
    });

    useMapStore.getState().updateEntity(e.id, applyLaneMergeOverride(e, 0, true));

    expect(useMapStore.getState().entities.get(e.id)).toBe(e);
    expect(promptActivation).toHaveBeenCalledTimes(1);
  });
});

describe('PNC junction passage group transforms', () => {
  it('creates blank passages with stable defaults and the next sub-id', () => {
    expect(makeBlankPassage(['passage_1', 'passage_7'])).toEqual({
      id: 'passage_8',
      laneIds: [],
      signalIds: [],
      stopSignIds: [],
      yieldIds: [],
      type: 'UNKNOWN_PASSAGE',
    });
  });

  it('adds and removes passage groups without mutating siblings', () => {
    const groups = passageGroups();
    const added = addPassageGroup(groups);

    expect(added.map((g) => g.id)).toEqual(['passagegroup_1', 'passagegroup_3', 'passagegroup_4']);
    expect(added[0]).toBe(groups[0]);
    expect(removePassageGroup(added, 'passagegroup_3').map((g) => g.id)).toEqual([
      'passagegroup_1',
      'passagegroup_4',
    ]);
  });

  it('adds passages with ids unique across all groups', () => {
    const groups = passageGroups();
    const next = addPassageToGroup(groups, 'passagegroup_3');

    expect(next[1]?.passages).toHaveLength(1);
    expect(next[1]?.passages[0]?.id).toBe('passage_2');
    expect(next[0]).toBe(groups[0]);
  });

  it('updates passage lane refs and preserves other passage refs', () => {
    const groups = passageGroups();
    const original = groups[0]!.passages[0]!;
    const next = updatePassageInGroup(groups, 'passagegroup_1', {
      ...original,
      laneIds: ['lane_b', 'lane_c'],
      signalIds: ['signal_a'],
      stopSignIds: ['stop_a'],
      yieldIds: ['yield_a'],
      type: 'EXIT',
    });

    expect(next[0]?.passages[0]).toMatchObject({
      laneIds: ['lane_b', 'lane_c'],
      signalIds: ['signal_a'],
      stopSignIds: ['stop_a'],
      yieldIds: ['yield_a'],
      type: 'EXIT',
    });
    expect(next[1]).toBe(groups[1]);
  });

  it('removes a passage from its group and leaves other groups untouched', () => {
    const groups = addPassageToGroup(passageGroups(), 'passagegroup_3');
    const next = removePassageFromGroup(groups, 'passagegroup_1', 'passage_1');

    expect(next[0]?.passages).toEqual([]);
    expect(next[1]).toBe(groups[1]);
  });
});
