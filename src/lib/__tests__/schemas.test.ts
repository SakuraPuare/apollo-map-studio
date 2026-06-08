/**
 * schemas — Zod 表单验证 schema。
 *
 * Inspector form / API 边界都靠这里把住范围检查。一旦 enum / 边界值变更
 * 没同步到这里，ParkingSpace.heading=-200 这种脏数据就会渗到下游。
 */
import { describe, it, expect } from 'vitest';
import {
  laneSchema,
  laneTypeOptions,
  laneTurnOptions,
  laneDirectionOptions,
  boundaryTypeOptions,
  junctionSchema,
  junctionTypeOptions,
  parkingSpaceSchema,
  signalSchema,
  signalTypeOptions,
  signInfoTypeOptions,
  stopSignSchema,
  stopSignTypeOptions,
  roadSchema,
  roadTypeOptions,
  areaSchema,
  areaTypeOptions,
  barrierGateSchema,
  barrierGateTypeOptions,
} from '../schemas';

// ── laneSchema ─────────────────────────────────────────────────

describe('laneSchema', () => {
  const validBase = {
    type: 'CITY_DRIVING' as const,
    turn: 'NO_TURN' as const,
    direction: 'FORWARD' as const,
    speedLimit: 13.9,
    speedLimitKmh: 50,
    leftBoundaryType: 'SOLID_WHITE' as const,
    rightBoundaryType: 'SOLID_WHITE' as const,
  };

  it('合法 lane 通过校验', () => {
    expect(laneSchema.safeParse(validBase).success).toBe(true);
  });

  it('speedLimit 超出 [0, 50] 失败', () => {
    expect(laneSchema.safeParse({ ...validBase, speedLimit: -1 }).success).toBe(false);
    expect(laneSchema.safeParse({ ...validBase, speedLimit: 51 }).success).toBe(false);
  });

  it('speedLimitKmh 超出 [0, 180] 失败', () => {
    expect(laneSchema.safeParse({ ...validBase, speedLimitKmh: -1 }).success).toBe(false);
    expect(laneSchema.safeParse({ ...validBase, speedLimitKmh: 181 }).success).toBe(false);
  });

  it('未知 type 枚举失败', () => {
    expect(laneSchema.safeParse({ ...validBase, type: 'NOT_REAL' }).success).toBe(false);
  });

  it('leftWidth / rightWidth 在 [0.5, 10] 内合法，超出失败', () => {
    expect(laneSchema.safeParse({ ...validBase, leftWidth: 1.5, rightWidth: 1.5 }).success).toBe(
      true,
    );
    expect(laneSchema.safeParse({ ...validBase, leftWidth: 0.1 }).success).toBe(false);
    expect(laneSchema.safeParse({ ...validBase, rightWidth: 11 }).success).toBe(false);
  });

  it('leftBoundaryType / rightBoundaryType 必须是 boundaryTypeOptions 中之一', () => {
    expect(boundaryTypeOptions.length).toBeGreaterThan(0);
    expect(laneSchema.safeParse({ ...validBase, leftBoundaryType: 'NOT_A_TYPE' }).success).toBe(
      false,
    );
  });
});

// ── junctionSchema / parkingSpaceSchema ────────────────────────

describe('junctionSchema', () => {
  it('合法 type 通过', () => {
    for (const t of junctionTypeOptions) {
      expect(junctionSchema.safeParse({ type: t }).success).toBe(true);
    }
  });

  it('未知 type 失败', () => {
    expect(junctionSchema.safeParse({ type: 'BAD' }).success).toBe(false);
  });

  it('缺字段失败', () => {
    expect(junctionSchema.safeParse({}).success).toBe(false);
  });
});

describe('parkingSpaceSchema', () => {
  it('heading ∈ [-180, 180] 合法', () => {
    expect(parkingSpaceSchema.safeParse({ heading: 0 }).success).toBe(true);
    expect(parkingSpaceSchema.safeParse({ heading: -180 }).success).toBe(true);
    expect(parkingSpaceSchema.safeParse({ heading: 180 }).success).toBe(true);
  });

  it('heading 超出范围失败', () => {
    expect(parkingSpaceSchema.safeParse({ heading: -181 }).success).toBe(false);
    expect(parkingSpaceSchema.safeParse({ heading: 181 }).success).toBe(false);
  });

  it('heading 类型错误（字符串）失败', () => {
    expect(parkingSpaceSchema.safeParse({ heading: '0' }).success).toBe(false);
  });
});

// ── signalSchema / stopSignSchema ──────────────────────────────

describe('signalSchema', () => {
  it('合法 enum 全部通过', () => {
    for (const t of signalTypeOptions) {
      expect(signalSchema.safeParse({ type: t, signInfo: [] }).success).toBe(true);
    }
  });

  it('未知 type 失败', () => {
    expect(signalSchema.safeParse({ type: 'BLINKING', signInfo: [] }).success).toBe(false);
  });

  it('signInfo 接受 NO_RIGHT_TURN_ON_RED', () => {
    expect(
      signalSchema.safeParse({ type: 'SINGLE', signInfo: ['NO_RIGHT_TURN_ON_RED'] }).success,
    ).toBe(true);
  });

  it('signInfo 拒绝未知 flag', () => {
    expect(signalSchema.safeParse({ type: 'SINGLE', signInfo: ['BOGUS_FLAG'] }).success).toBe(
      false,
    );
  });

  it('signInfo 是必填数组', () => {
    expect(signalSchema.safeParse({ type: 'SINGLE' }).success).toBe(false);
    expect(
      signalSchema.safeParse({ type: 'SINGLE', signInfo: 'NO_RIGHT_TURN_ON_RED' }).success,
    ).toBe(false);
  });
});

describe('stopSignSchema', () => {
  it('合法 enum 全部通过', () => {
    for (const t of stopSignTypeOptions) {
      expect(stopSignSchema.safeParse({ type: t }).success).toBe(true);
    }
  });

  it('未知 type 失败', () => {
    expect(stopSignSchema.safeParse({ type: 'FIVE_WAY' }).success).toBe(false);
  });
});

// ── roadSchema / areaSchema / barrierGateSchema ─────────────────────

describe('roadSchema', () => {
  it('合法 enum 全部通过', () => {
    for (const t of roadTypeOptions) {
      expect(roadSchema.safeParse({ type: t }).success).toBe(true);
    }
  });

  it('未知 type / 缺字段失败', () => {
    expect(roadSchema.safeParse({ type: 'SERVICE_ROAD' }).success).toBe(false);
    expect(roadSchema.safeParse({}).success).toBe(false);
  });
});

describe('areaSchema', () => {
  it('合法 enum 全部通过，name 可选', () => {
    for (const t of areaTypeOptions) {
      expect(areaSchema.safeParse({ type: t }).success).toBe(true);
    }

    expect(areaSchema.safeParse({ type: 'Driveable', name: 'Loading zone' }).success).toBe(true);
  });

  it('未知 type / 非字符串 name 失败', () => {
    expect(areaSchema.safeParse({ type: 'Walkable' }).success).toBe(false);
    expect(areaSchema.safeParse({ type: 'Driveable', name: 12 }).success).toBe(false);
  });
});

describe('barrierGateSchema', () => {
  it('合法 enum 全部通过', () => {
    for (const t of barrierGateTypeOptions) {
      expect(barrierGateSchema.safeParse({ type: t }).success).toBe(true);
    }
  });

  it('未知 type / 缺字段失败', () => {
    expect(barrierGateSchema.safeParse({ type: 'CHAIN' }).success).toBe(false);
    expect(barrierGateSchema.safeParse({}).success).toBe(false);
  });
});

// ── enum option 静态契约 ───────────────────────────────────────

describe('enum option lists 与 proto 契约', () => {
  it('laneTypeOptions 至少包含 CITY_DRIVING 与 NONE', () => {
    expect(laneTypeOptions).toContain('CITY_DRIVING');
    expect(laneTypeOptions).toContain('NONE');
  });

  it('laneTurnOptions 包含全部 4 种 turn', () => {
    expect(laneTurnOptions).toEqual(['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN']);
  });

  it('laneDirectionOptions 包含 FORWARD/BACKWARD/BIDIRECTION', () => {
    expect(laneDirectionOptions).toEqual(['FORWARD', 'BACKWARD', 'BIDIRECTION']);
  });

  it('signInfoTypeOptions 只暴露正向 inspector flag', () => {
    expect(signInfoTypeOptions).toEqual(['NO_RIGHT_TURN_ON_RED']);
  });

  it('road / area / barrierGate options 与 schema 同步', () => {
    expect(roadTypeOptions).toEqual(['UNKNOWN_ROAD', 'HIGHWAY', 'CITY_ROAD', 'PARK']);
    expect(areaTypeOptions).toEqual(['Driveable', 'UnDriveable', 'Custom1', 'Custom2', 'Custom3']);
    expect(barrierGateTypeOptions).toEqual(['ROD', 'FENCE', 'ADVERTISING', 'TELESCOPIC', 'OTHER']);
  });
});
