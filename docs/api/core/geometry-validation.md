# Geometry / validation

Source: `src/core/geometry/validation.ts`.

This module contains small pure validation helpers used by the FSM and entity
mutation paths.

## `segmentsIntersect(a1, a2, b1, b2)`

Returns true when two line segments strictly cross. Endpoint touching and
collinear overlap are not treated as intersections.

## `wouldSelfIntersect(points, newPt)`

Checks whether adding `newPt` to an open polygon draft would make the new edge
cross an earlier edge. Used while drawing polygons.

## `polygonSelfIntersects(points)`

Checks a closed polygon for self intersections, excluding adjacent edges and
the first/last shared endpoint.

## Tests

See `src/core/geometry/__tests__/validation.test.ts`.
