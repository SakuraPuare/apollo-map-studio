/**
 * enumLabels — i18n-ready enum label registry.
 *
 * Test strategy:
 *   - Verify every registered category resolves known values to the
 *     correct display label (contract with proto enum → UI string).
 *   - Verify the fallback path: unknown values return the raw value.
 *   - Verify withLabels builds {value, label}[] in input order.
 *   - Edge cases: empty options array, value present in one category
 *     but not another, category with UNKNOWN key.
 */
import { describe, it, expect } from 'vitest';
import { getEnumLabel, withLabels } from '../enumLabels';

// ── getEnumLabel ───────────────────────────────────────────────────────────────

describe('getEnumLabel — laneType', () => {
  it('CITY_DRIVING → "City Driving"', () => {
    expect(getEnumLabel('laneType', 'CITY_DRIVING')).toBe('City Driving');
  });

  it('NONE → "None"', () => {
    expect(getEnumLabel('laneType', 'NONE')).toBe('None');
  });

  it('BIKING → "Biking"', () => {
    expect(getEnumLabel('laneType', 'BIKING')).toBe('Biking');
  });

  it('SIDEWALK → "Sidewalk"', () => {
    expect(getEnumLabel('laneType', 'SIDEWALK')).toBe('Sidewalk');
  });

  it('PARKING → "Parking"', () => {
    expect(getEnumLabel('laneType', 'PARKING')).toBe('Parking');
  });

  it('SHOULDER → "Shoulder"', () => {
    expect(getEnumLabel('laneType', 'SHOULDER')).toBe('Shoulder');
  });

  it('SHARED → "Shared"', () => {
    expect(getEnumLabel('laneType', 'SHARED')).toBe('Shared');
  });

  it('unknown value falls back to raw value', () => {
    expect(getEnumLabel('laneType', 'NOT_A_LANE_TYPE')).toBe('NOT_A_LANE_TYPE');
  });
});

describe('getEnumLabel — laneTurn', () => {
  it('NO_TURN → "No Turn"', () => {
    expect(getEnumLabel('laneTurn', 'NO_TURN')).toBe('No Turn');
  });

  it('LEFT_TURN → "Left Turn"', () => {
    expect(getEnumLabel('laneTurn', 'LEFT_TURN')).toBe('Left Turn');
  });

  it('RIGHT_TURN → "Right Turn"', () => {
    expect(getEnumLabel('laneTurn', 'RIGHT_TURN')).toBe('Right Turn');
  });

  it('U_TURN → "U-Turn"', () => {
    expect(getEnumLabel('laneTurn', 'U_TURN')).toBe('U-Turn');
  });

  it('unknown value falls back to raw value', () => {
    expect(getEnumLabel('laneTurn', 'DIAGONAL')).toBe('DIAGONAL');
  });
});

describe('getEnumLabel — laneDirection', () => {
  it('FORWARD → "Forward"', () => {
    expect(getEnumLabel('laneDirection', 'FORWARD')).toBe('Forward');
  });

  it('BACKWARD → "Backward"', () => {
    expect(getEnumLabel('laneDirection', 'BACKWARD')).toBe('Backward');
  });

  it('BIDIRECTION → "Bidirectional"', () => {
    expect(getEnumLabel('laneDirection', 'BIDIRECTION')).toBe('Bidirectional');
  });
});

describe('getEnumLabel — boundaryType', () => {
  it('UNKNOWN → "Unknown"', () => {
    expect(getEnumLabel('boundaryType', 'UNKNOWN')).toBe('Unknown');
  });

  it('DOTTED_YELLOW → "Dotted Yellow"', () => {
    expect(getEnumLabel('boundaryType', 'DOTTED_YELLOW')).toBe('Dotted Yellow');
  });

  it('DOTTED_WHITE → "Dotted White"', () => {
    expect(getEnumLabel('boundaryType', 'DOTTED_WHITE')).toBe('Dotted White');
  });

  it('SOLID_YELLOW → "Solid Yellow"', () => {
    expect(getEnumLabel('boundaryType', 'SOLID_YELLOW')).toBe('Solid Yellow');
  });

  it('SOLID_WHITE → "Solid White"', () => {
    expect(getEnumLabel('boundaryType', 'SOLID_WHITE')).toBe('Solid White');
  });

  it('DOUBLE_YELLOW → "Double Yellow"', () => {
    expect(getEnumLabel('boundaryType', 'DOUBLE_YELLOW')).toBe('Double Yellow');
  });

  it('CURB → "Curb"', () => {
    expect(getEnumLabel('boundaryType', 'CURB')).toBe('Curb');
  });
});

describe('getEnumLabel — junctionType', () => {
  it('UNKNOWN → "Unknown"', () => {
    expect(getEnumLabel('junctionType', 'UNKNOWN')).toBe('Unknown');
  });

  it('IN_ROAD → "In-Road"', () => {
    expect(getEnumLabel('junctionType', 'IN_ROAD')).toBe('In-Road');
  });

  it('CROSS_ROAD → "Crossroad"', () => {
    expect(getEnumLabel('junctionType', 'CROSS_ROAD')).toBe('Crossroad');
  });

  it('FORK_ROAD → "Fork"', () => {
    expect(getEnumLabel('junctionType', 'FORK_ROAD')).toBe('Fork');
  });

  it('MAIN_SIDE → "Main / Side"', () => {
    expect(getEnumLabel('junctionType', 'MAIN_SIDE')).toBe('Main / Side');
  });

  it('DEAD_END → "Dead End"', () => {
    expect(getEnumLabel('junctionType', 'DEAD_END')).toBe('Dead End');
  });
});

describe('getEnumLabel — signalType', () => {
  it('UNKNOWN_SIGNAL → "Unknown"', () => {
    expect(getEnumLabel('signalType', 'UNKNOWN_SIGNAL')).toBe('Unknown');
  });

  it('MIX_2_HORIZONTAL → "2-Light Horizontal"', () => {
    expect(getEnumLabel('signalType', 'MIX_2_HORIZONTAL')).toBe('2-Light Horizontal');
  });

  it('MIX_2_VERTICAL → "2-Light Vertical"', () => {
    expect(getEnumLabel('signalType', 'MIX_2_VERTICAL')).toBe('2-Light Vertical');
  });

  it('MIX_3_HORIZONTAL → "3-Light Horizontal"', () => {
    expect(getEnumLabel('signalType', 'MIX_3_HORIZONTAL')).toBe('3-Light Horizontal');
  });

  it('MIX_3_VERTICAL → "3-Light Vertical"', () => {
    expect(getEnumLabel('signalType', 'MIX_3_VERTICAL')).toBe('3-Light Vertical');
  });

  it('SINGLE → "Single"', () => {
    expect(getEnumLabel('signalType', 'SINGLE')).toBe('Single');
  });
});

describe('getEnumLabel — stopSignType', () => {
  it('UNKNOWN_STOP_SIGN → "Unknown"', () => {
    expect(getEnumLabel('stopSignType', 'UNKNOWN_STOP_SIGN')).toBe('Unknown');
  });

  it('ONE_WAY → "One-Way"', () => {
    expect(getEnumLabel('stopSignType', 'ONE_WAY')).toBe('One-Way');
  });

  it('TWO_WAY → "Two-Way"', () => {
    expect(getEnumLabel('stopSignType', 'TWO_WAY')).toBe('Two-Way');
  });

  it('THREE_WAY → "Three-Way"', () => {
    expect(getEnumLabel('stopSignType', 'THREE_WAY')).toBe('Three-Way');
  });

  it('FOUR_WAY → "Four-Way"', () => {
    expect(getEnumLabel('stopSignType', 'FOUR_WAY')).toBe('Four-Way');
  });

  it('ALL_WAY → "All-Way"', () => {
    expect(getEnumLabel('stopSignType', 'ALL_WAY')).toBe('All-Way');
  });
});

describe('getEnumLabel — roadType', () => {
  it('UNKNOWN_ROAD → "Unknown"', () => {
    expect(getEnumLabel('roadType', 'UNKNOWN_ROAD')).toBe('Unknown');
  });

  it('HIGHWAY → "Highway"', () => {
    expect(getEnumLabel('roadType', 'HIGHWAY')).toBe('Highway');
  });

  it('CITY_ROAD → "City Road"', () => {
    expect(getEnumLabel('roadType', 'CITY_ROAD')).toBe('City Road');
  });

  it('PARK → "Park"', () => {
    expect(getEnumLabel('roadType', 'PARK')).toBe('Park');
  });

  it('unknown value falls back to raw value', () => {
    expect(getEnumLabel('roadType', 'RURAL')).toBe('RURAL');
  });
});

describe('getEnumLabel — cross-category isolation', () => {
  it('UNKNOWN key in boundaryType does not bleed into junctionType lookup', () => {
    // Both have UNKNOWN but via separate dict objects
    expect(getEnumLabel('boundaryType', 'UNKNOWN')).toBe('Unknown');
    expect(getEnumLabel('junctionType', 'UNKNOWN')).toBe('Unknown');
  });

  it('UNKNOWN_SIGNAL is not a valid boundaryType key — returns raw fallback', () => {
    expect(getEnumLabel('boundaryType', 'UNKNOWN_SIGNAL')).toBe('UNKNOWN_SIGNAL');
  });

  it('CITY_DRIVING is not a valid roadType key — returns raw fallback', () => {
    expect(getEnumLabel('roadType', 'CITY_DRIVING')).toBe('CITY_DRIVING');
  });
});

// ── withLabels ─────────────────────────────────────────────────────────────────

describe('withLabels', () => {
  it('maps a list of known values to {value, label}[] preserving order', () => {
    const result = withLabels('laneTurn', ['NO_TURN', 'LEFT_TURN', 'RIGHT_TURN', 'U_TURN']);
    expect(result).toEqual([
      { value: 'NO_TURN', label: 'No Turn' },
      { value: 'LEFT_TURN', label: 'Left Turn' },
      { value: 'RIGHT_TURN', label: 'Right Turn' },
      { value: 'U_TURN', label: 'U-Turn' },
    ]);
  });

  it('returns an empty array when options is empty', () => {
    const result = withLabels('laneType', []);
    expect(result).toEqual([]);
  });

  it('single option resolves correctly', () => {
    const result = withLabels('signalType', ['MIX_3_VERTICAL']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ value: 'MIX_3_VERTICAL', label: '3-Light Vertical' });
  });

  it('unknown values in options fall back to raw value as label', () => {
    const result = withLabels('laneType', ['CITY_DRIVING', 'GHOST_LANE']);
    expect(result[0]).toEqual({ value: 'CITY_DRIVING', label: 'City Driving' });
    expect(result[1]).toEqual({ value: 'GHOST_LANE', label: 'GHOST_LANE' });
  });

  it('result is readonly (value and label fields are present on every item)', () => {
    const result = withLabels('roadType', ['HIGHWAY', 'PARK']);
    for (const item of result) {
      expect(typeof item.value).toBe('string');
      expect(typeof item.label).toBe('string');
    }
  });

  it('preserves the exact T type on the value field (not widened to string)', () => {
    // TypeScript-level test — at runtime the values match what we passed in
    const options = ['FORWARD', 'BACKWARD'] as const;
    const result = withLabels('laneDirection', options);
    expect(result.map((r) => r.value)).toEqual(['FORWARD', 'BACKWARD']);
  });

  it('all 7 laneType options resolve to non-empty labels', () => {
    const options = [
      'NONE',
      'CITY_DRIVING',
      'BIKING',
      'SIDEWALK',
      'PARKING',
      'SHOULDER',
      'SHARED',
    ] as const;
    const result = withLabels('laneType', options);
    expect(result).toHaveLength(7);
    for (const item of result) {
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});
