# Command Palette

The command palette opens with `⌘K` / `Ctrl+K` or the ToolStrip terminal
button. It is backed by the same action registry as MenuBar and ToolStrip.

## Behavior

- Actions are grouped by category.
- Search filters action labels.
- Toggle actions show their active state.
- Shortcuts are formatted for the current platform.
- Executing an action closes the palette.

## Current Actions

The palette includes import/export, undo/redo, delete, reset layout, grid,
snap, default mode, connect lanes and drawing tool actions. It does not show
the `commandPalette` action itself to avoid a recursive entry.
