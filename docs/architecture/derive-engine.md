# Derive Engine

Source: `src/core/elements/derive`.

The derive engine updates computed fields after geometry or inspector edits.
It owns field paths such as lane length, turn, boundary samples and related
derived values. Manual inspector edits can mark `_userOverrides` so future
geometry edits do not clobber user-controlled fields.

See [Elements / derive](/api/core/elements-derive) and
[Inspector System](/architecture/inspector-system).
