# Geometry / apolloCompile

Sources:

- `src/core/geometry/apolloCompile.ts`
- `src/core/geometry/apolloCompile/*`

`apolloCompile` converts Apollo editor entities into renderable GeoJSON and
derived lane geometry. It is used by entity operations, cold-layer feature
generation and tests.

## Main Responsibilities

- Convert lane centerline curves into sampled points.
- Build lane left/right boundary geometry.
- Generate lane polygons from centerline and width samples.
- Infer lane turn type from geometry.
- Maintain source draw info for Bezier and arc lanes.
- Compute signal stop-line heading and templates.

## Important Submodules

| File                               | Responsibility                                             |
| ---------------------------------- | ---------------------------------------------------------- |
| `factory.ts`                       | create lane and simple Apollo entities from drawn geometry |
| `features.ts`                      | compile Apollo entities into GeoJSON features              |
| `laneBoundaryGeometry.ts`          | convert curves and boundaries to point arrays              |
| `offsetPolyline.ts`                | robust centerline offset for lane boundaries               |
| `editPoints.ts`                    | expose editable points for entityOps                       |
| `signalHeading.ts`                 | derive signal icon rotation                                |
| `signalTemplate.ts`                | default signal geometry                                    |
| `projection.ts` / `conversions.ts` | coordinate helpers inside compile path                     |

## Public Usage

Most UI code should not import this module directly. Use
`src/lib/entityOps.ts` for edit/read operations so Apollo-specific geometry
details stay behind the anti-corruption layer.

## Tests

See the `src/core/geometry/__tests__/apolloCompile*.test.ts` family plus
`offsetPolyline`, `signalFactory`, `signalHeading` and `signalTemplate` tests.
