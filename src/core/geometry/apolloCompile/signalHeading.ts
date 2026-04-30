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
 * Coordinate-space adjustment vs. Dreamview: Dreamview operates in
 * local Cartesian meters, so x and y differences are directly metric.
 * This codebase passes `boundary.points` as `GeoPoint{x: longitude,
 * y: latitude}` (degrees) with `z` in meters. Mixing lng-deg and
 * lat-deg in a cross product or implicit-line equation produces a
 * non-metric bearing because at non-equatorial latitudes one degree
 * of longitude is shorter than one degree of latitude (factor =
 * cos(lat)). To recover a true metric-space bearing we scale every
 * x-difference (lng-diff) by `cosLat` before the cross product /
 * line equation. Lat-differences and the y-axis disambiguation
 * comparison are unaffected. The cosLat factor itself is unitless,
 * so we don't need METERS_PER_DEGREE here — we only need the two
 * axes to share the same scale before atan2.
 *
 * Returns radians counter-clockwise from +x (east) — matching the
 * `direction` value Dreamview feeds to `mesh.rotation.y`, in metric
 * space so that `headingToIconRotate` produces correct maplibre
 * `icon-rotate` degrees. Returns `null` if neither algorithm can
 * produce a value (no stop line and degenerate boundary).
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
 *  traffic) rather than along it.
 *
 *  cosLat scaling: the stop line is given in (lng, lat); to compute
 *  a metric-space bearing we scale the lng-difference by cos(meanLat)
 *  before atan2. */
function headingFromStopLine(entity: SignalEntity): number | null {
  const sl = stopLinePoints(entity);
  if (sl.length < 2) return null;
  const a = sl[0]!;
  const b = sl[sl.length - 1]!;
  const cosLat = Math.cos(((a.y + b.y) / 2) * (Math.PI / 180));
  const stopLineDir = Math.atan2(b.y - a.y, (b.x - a.x) * cosLat);
  return Math.PI * 1.5 + stopLineDir;
}

/**
 * Compute signal facing direction in radians (CCW from east). Uses
 * Dreamview's algorithm verbatim (with cosLat scaling on every
 * lng-difference so the cross product and implicit stop-line equation
 * are evaluated in metric space); falls back to stop-line-only when
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

  // Mean-latitude cosine — used to scale every lng-difference into
  // the same units as lat-differences before the cross product /
  // implicit-line equation. Boundary points typically span a few
  // meters, so a single cosLat is more than accurate enough.
  const meanLat = (b1.y + b2.y + b3.y) / 3;
  const cosLat = Math.cos(meanLat * (Math.PI / 180));

  // Plane orthogonal projected to xy. Construct
  //   ax * x + ay * y + ac = 0  through (b1.x, b1.y).
  // x-differences (lng-diffs) are scaled by cosLat so the cross
  // product is evaluated in a consistent (metric) basis.
  const dx21 = (b2.x - b1.x) * cosLat;
  const dx31 = (b3.x - b1.x) * cosLat;
  const orthoX = dx21 * (b3z - b1z) - dx31 * (b2z - b1z);
  const orthoY = (b2.y - b1.y) * (b3z - b1z) - (b3.y - b1.y) * (b2z - b1z);
  // orthoConst is only used together with the (already metric-scaled)
  // line equation below, so b1.x must enter scaled too.
  const orthoConst = -orthoX * (b1.x * cosLat) - orthoY * b1.y;

  const sl = stopLinePoints(entity);
  if (sl.length < 2) return null;

  const slStart = sl[0]!;
  const slEnd = sl[sl.length - 1]!;

  // Stop line in implicit form: slX * x + slY * y + slConst = 0.
  // slY's contribution is to the x-axis (lng), so it gets scaled by
  // cosLat. slX is a lat-diff and stays as-is.
  const slX = slEnd.y - slStart.y;
  const slY = (slStart.x - slEnd.x) * cosLat;
  const slConst = -slX * (slStart.x * cosLat) - slY * slStart.y;

  // Parallel? Fall back.
  const denom = slX * orthoY - orthoX * slY;
  if (Math.abs(denom) < EPSILON) return headingFromStopLine(entity);

  const intersectX = (slY * orthoConst - orthoY * slConst) / denom;
  const intersectY =
    slY !== 0 ? (-slX * intersectX - slConst) / slY : (-orthoX * intersectX - orthoConst) / orthoY;

  // Both orthoX and orthoY are now in the same metric basis, so
  // atan2 returns a true metric-space bearing CCW from east.
  let direction = Math.atan2(-orthoX, orthoY);

  // Flip if the orthogonal points away from the stop line intersection
  // — the signal head must face oncoming traffic, not its own back.
  // The disambiguation is on the y-axis (lat), unitless under the
  // monotonic cosLat scaling we did to the x-axis, so b1.y stays raw.
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
