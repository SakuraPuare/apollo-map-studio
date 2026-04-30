/**
 * Canonical signal-head geometry templates.
 *
 * Apollo's official `signals_xml_parser.cc` requires every Signal to ship
 * with `boundary` (4-point 3D outline of the signal box) and a non-empty
 * `subsignal[]` (each bulb with `location`). A .bin missing either field
 * is rejected with `HDMAP_DATA_ERROR`. Real Apollo maps populate both —
 * borregas_ave's MIX_3_VERTICAL signals are 0.63m × 1.46m vertical
 * rectangles mounted at z 4.57–6.03m with 3 CIRCLE bulbs at z 4.90 / 5.30
 * / 5.70 (vertical spacing 0.40m, x/y at boundary centroid).
 *
 * When the editor lets the user "draw a signal" they only paint the
 * stop_line (a ground-level polyline). This module synthesises a
 * physically-plausible boundary + subsignals from that stop line + the
 * chosen layout type, so .bin export passes Apollo's parser without the
 * user having to author 3D data they can't even see in the 2D viewport.
 */
import type { GeoPoint } from '@/types/entities';
import type {
  ApolloPolygon,
  SignalEntity,
  SignalType,
  Subsignal,
  SubsignalType,
} from '@/types/apollo';
import { metersToDegLat, metersToDegLng } from '@/lib/geo';

/** Signal-head physical dimensions (meters). Tuned to match borregas_ave. */
const BULB_SPACING_M = 0.4;
/** Box margin on each side beyond the bulb grid. */
const BOX_MARGIN_M = 0.13;
/** Bottom of the box above the road surface. */
const MOUNT_BOTTOM_Z_M = 4.6;

interface Layout {
  cols: number; // bulbs across (perpendicular to traffic heading)
  rows: number; // bulbs vertical
}

const LAYOUTS: Record<SignalType, Layout> = {
  UNKNOWN_SIGNAL: { cols: 1, rows: 1 },
  SINGLE: { cols: 1, rows: 1 },
  MIX_2_HORIZONTAL: { cols: 2, rows: 1 },
  MIX_2_VERTICAL: { cols: 1, rows: 2 },
  MIX_3_HORIZONTAL: { cols: 3, rows: 1 },
  MIX_3_VERTICAL: { cols: 1, rows: 3 },
};

const DEFAULT_SUBSIGNAL_TYPE: SubsignalType = 'CIRCLE';

export interface SignalTemplateInput {
  type: SignalType;
  /** Anchor point in lon/lat — typically the stop line midpoint. */
  anchor: GeoPoint;
  /**
   * Heading of the stop line in radians (atan2-style: 0 = +x/east).
   * The signal box's flat face is set perpendicular to this so the bulbs
   * face oncoming traffic.
   */
  heading: number;
}

export interface SignalTemplateOutput {
  boundary: ApolloPolygon;
  subsignals: Subsignal[];
}

export function buildSignalTemplate(input: SignalTemplateInput): SignalTemplateOutput {
  const { type, anchor, heading } = input;
  const layout = LAYOUTS[type] ?? LAYOUTS.MIX_3_VERTICAL;

  // Physical dimensions in meters
  const horizExtentM = layout.cols * BULB_SPACING_M + BOX_MARGIN_M * 2;
  const vertExtentM = layout.rows * BULB_SPACING_M + BOX_MARGIN_M * 2;
  const halfHorizM = horizExtentM / 2;

  // Convert horizontal half-extent to lon/lat at anchor's latitude.
  // Direction perpendicular to heading: (-sin h, cos h) in local x/y.
  const dxM = -Math.sin(heading) * halfHorizM;
  const dyM = Math.cos(heading) * halfHorizM;
  const dxDeg = dxM * metersToDegLng(anchor.y);
  const dyDeg = dyM * metersToDegLat();

  const A: GeoPoint = { x: anchor.x - dxDeg, y: anchor.y - dyDeg };
  const B: GeoPoint = { x: anchor.x + dxDeg, y: anchor.y + dyDeg };

  const zBottom = MOUNT_BOTTOM_Z_M;
  const zTop = zBottom + vertExtentM;
  const zCenter = (zBottom + zTop) / 2;

  // Boundary: 4-point flat vertical rectangle (top-left → top-right →
  // bottom-right → bottom-left) — matches borregas vertex ordering.
  const boundary: ApolloPolygon = {
    points: [
      { x: A.x, y: A.y, z: zTop },
      { x: B.x, y: B.y, z: zTop },
      { x: B.x, y: B.y, z: zBottom },
      { x: A.x, y: A.y, z: zBottom },
    ],
  };

  // Subsignals: row-major, centered. xy position depends on column;
  // z position depends on row. CIRCLE is the universal default — the
  // user can switch individual bulb types later if a richer editor is
  // built (Apollo data convention: most CN fleet maps use all-CIRCLE).
  const subsignals: Subsignal[] = [];
  for (let row = 0; row < layout.rows; row++) {
    // Top bulb has highest z. row 0 → top.
    const z = zCenter + ((layout.rows - 1) / 2 - row) * BULB_SPACING_M;
    for (let col = 0; col < layout.cols; col++) {
      // col 0 is leftmost (toward A side).
      const colOffsetM = (col - (layout.cols - 1) / 2) * BULB_SPACING_M;
      const offDxDeg = -Math.sin(heading) * colOffsetM * metersToDegLng(anchor.y);
      const offDyDeg = Math.cos(heading) * colOffsetM * metersToDegLat();
      subsignals.push({
        id: String(subsignals.length),
        type: DEFAULT_SUBSIGNAL_TYPE,
        location: {
          x: anchor.x + offDxDeg,
          y: anchor.y + offDyDeg,
          z,
        },
      });
    }
  }

  return { boundary, subsignals };
}

/** Stop-line midpoint + heading; falls back to the entity's boundary
 *  centroid when no stop line exists yet. Returns null if neither is
 *  populated (caller should keep the previous geometry). */
function deriveAnchorAndHeading(
  entity: SignalEntity,
): { anchor: GeoPoint; heading: number } | null {
  const stopPoints = entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
  if (stopPoints.length >= 2) {
    const a = stopPoints[0]!;
    const b = stopPoints[stopPoints.length - 1]!;
    const anchor: GeoPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    return { anchor, heading };
  }
  const bp = entity.boundary.points;
  if (bp.length > 0) {
    const sx = bp.reduce((s, p) => s + p.x, 0) / bp.length;
    const sy = bp.reduce((s, p) => s + p.y, 0) / bp.length;
    return { anchor: { x: sx, y: sy }, heading: 0 };
  }
  return null;
}

/**
 * Recompute boundary + subsignals from the current `type` and stop line.
 * Called from the inspector when the user changes the layout, or from
 * the factory when a brand-new signal is being constructed.
 *
 * Returns the entity unchanged when there's no anchor to base the
 * geometry on (no stop line and no existing boundary).
 */
export function regenerateSignalGeometry(entity: SignalEntity): SignalEntity {
  const ah = deriveAnchorAndHeading(entity);
  if (!ah) return entity;
  const { boundary, subsignals } = buildSignalTemplate({
    type: entity.type,
    anchor: ah.anchor,
    heading: ah.heading,
  });
  return { ...entity, boundary, subsignals };
}
