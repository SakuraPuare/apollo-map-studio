# Types / Apollo

Source: `src/types/apollo.ts`.

This file defines TypeScript mirrors for the Apollo HD map protobuf messages
that the editor supports.

## Main Entity Types

- `LaneEntity`
- `RoadEntity`
- `JunctionEntity`
- `PNCJunctionEntity`
- `ParkingSpaceEntity`
- `CrosswalkEntity`
- `SignalEntity`
- `StopSignEntity`
- `YieldSignEntity`
- `SpeedBumpEntity`
- `ClearAreaEntity`
- `RSUEntity`
- `AreaEntity`
- `BarrierGateEntity`
- `OverlapEntity`

## Editor Extensions

Some entities carry editor-only metadata:

- `_source` preserves Bezier/arc draw anchors so curves remain editable.
- `_sourceRect` preserves rotated rectangle parameters.
- `_userOverrides` marks fields manually edited in Inspector so derive rules
  do not overwrite them on later geometry edits.

## Coordinate Convention

Inside the editor, `PointENU` is an alias for `GeoPoint`, and `x/y` mean
longitude/latitude. File import/export converts to Apollo projected meters at
the IO boundary.
