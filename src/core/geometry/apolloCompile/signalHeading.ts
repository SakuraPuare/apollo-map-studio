/**
 * Signal facing direction.
 *
 * Direct port of Apollo Dreamview's
 * `frontend/src/renderer/traffic_controls/traffic_signals.js`
 * (`getHeadingFromStopLineAndTrafficLightBoundary`) +
 * `traffic_controls_base.js` (`getHeadingFromStopLine`).
 *
 * Dreamview treats `boundary` as metadata, not as drawable geometry:
 * the 4-point 3D outline defines a plane; that plane's xy-projected
 * normal — disambiguated by which side of the stop line it points
 * toward — gives the direction the signal box is facing (i.e., the
 * direction oncoming traffic is coming from).
 *
 * Returns radians counter-clockwise from +x (east) — matching the
 * `direction` value Dreamview feeds to `mesh.rotation.y`. Returns
 * `null` if neither algorithm can produce a value (no stop line and
 * degenerate boundary).
 */
import type { SignalEntity } from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';

const EPSILON = 1e-9;

function stopLinePoints(entity: SignalEntity): GeoPoint[] {
  return entity.stopLines[0]?.segments[0]?.lineSegment.points ?? [];
}

/** Fallback when boundary is degenerate: derive heading from the stop
 *  line direction itself. Dreamview adds 1.5π so the signal faces
 *  perpendicular to the line (i.e. across the road, toward incoming
 *  traffic) rather than along it. */
function headingFromStopLine(entity: SignalEntity): number | null {
  const sl = stopLinePoints(entity);
  if (sl.length < 2) return null;
  const a = sl[0]!;
  const b = sl[sl.length - 1]!;
  const stopLineDir = Math.atan2(b.y - a.y, b.x - a.x);
  return Math.PI * 1.5 + stopLineDir;
}

/**
 * Compute signal facing direction in radians (CCW from east). Uses
 * Dreamview's algorithm verbatim; falls back to stop-line-only when
 * boundary has fewer than 3 points or is parallel to the stop line.
 */
export function computeSignalHeading(entity: SignalEntity): number | null {
  const bp = entity.boundary.points;
  if (bp.length < 3) return headingFromStopLine(entity);

  const b1 = bp[0]!;
  const b2 = bp[1]!;
  const b3 = bp[2]!;
  const b1z = b1.z ?? 0;
  const b2z = b2.z ?? 0;
  const b3z = b3.z ?? 0;

  // Plane orthogonal projected to xy. Construct
  //   ax * x + ay * y + ac = 0  through (b1.x, b1.y).
  const orthoX = (b2.x - b1.x) * (b3z - b1z) - (b3.x - b1.x) * (b2z - b1z);
  const orthoY = (b2.y - b1.y) * (b3z - b1z) - (b3.y - b1.y) * (b2z - b1z);
  const orthoConst = -orthoX * b1.x - orthoY * b1.y;

  const sl = stopLinePoints(entity);
  if (sl.length < 2) return null;

  const slStart = sl[0]!;
  const slEnd = sl[sl.length - 1]!;

  // Stop line in implicit form: slX * x + slY * y + slConst = 0.
  const slX = slEnd.y - slStart.y;
  const slY = slStart.x - slEnd.x;
  const slConst = -slX * slStart.x - slY * slStart.y;

  // Parallel? Fall back.
  const denom = slX * orthoY - orthoX * slY;
  if (Math.abs(denom) < EPSILON) return headingFromStopLine(entity);

  const intersectX = (slY * orthoConst - orthoY * slConst) / denom;
  const intersectY =
    slY !== 0 ? (-slX * intersectX - slConst) / slY : (-orthoX * intersectX - orthoConst) / orthoY;

  let direction = Math.atan2(-orthoX, orthoY);

  // Flip if the orthogonal points away from the stop line intersection
  // — the signal head must face oncoming traffic, not its own back.
  if ((direction < 0 && intersectY > b1.y) || (direction > 0 && intersectY < b1.y)) {
    direction += Math.PI;
  }
  return direction;
}

/**
 * Convert a heading in math convention (radians CCW from +x / east)
 * into maplibre's `icon-rotate` convention (degrees CW from north).
 *
 *   mathRad = 0       (east)  → 90°  (CW from north → east)
 *   mathRad = π/2     (north) → 0°
 *   mathRad = π       (west)  → 270° (or -90°)
 *   mathRad = -π/2    (south) → 180°
 */
export function headingToIconRotate(headingRad: number): number {
  return 90 - (headingRad * 180) / Math.PI;
}
