# Enum Mappings

Enum mappings live in `src/io/proto/entityBridge/enums.ts` and display labels
live in `src/lib/enumLabels.ts`.

## Purpose

Apollo protobuf stores enum values as integers. The editor uses string literal
types such as `CITY_DRIVING`, `LEFT_TURN` and `DOTTED_WHITE`. The bridge maps
between those representations during import/export.

## UI Labels

Inspector controls should keep raw enum strings in entity state and call
`getEnumLabel(category, value)` only for display. This keeps persistence,
tests and proto conversion independent of UI language.
