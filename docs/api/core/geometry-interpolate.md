# Geometry / interpolate

Source: `src/core/geometry/interpolate.ts`.

This module samples editor draw tools into coordinate arrays.

## Types

```ts
type LngLat = [number, number];

interface BezierAnchor {
  point: LngLat;
  handleIn: LngLat | null;
  handleOut: LngLat | null;
}
```

## Functions

| Function                              | Purpose                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `mirrorPoint(pivot, pt)`              | Mirror a handle around an anchor point.                                            |
| `catmullRom(points, segments, alpha)` | Sample a Catmull-Rom spline through control points.                                |
| `cubicBezier(anchors, segments)`      | Sample multi-segment cubic Bezier curves.                                          |
| `threePointArc(p1, p2, p3, segments)` | Sample an arc through three points; falls back to line-like points when collinear. |
| `rectCorners(p1, p2, rotation)`       | Build a rotated rectangle polygon from two diagonal points and angle.              |

Coordinates are lon/lat; functions use light local projection where needed to
reduce longitude distortion.

## Consumers

- `editorMachine` draw states.
- `useDrawCommit`.
- `entityMutations`.
- `connectLanes` source-aware endpoint movement.
