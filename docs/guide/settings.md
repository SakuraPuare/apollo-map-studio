# Settings

Settings are opened from File -> Settings, the Activity Bar gear, or `⌘,`
when focus is not inside an input.

## Current Settings

The panel writes to `settingsStore`:

| Setting            | Range                                 | Effect                                     |
| ------------------ | ------------------------------------- | ------------------------------------------ |
| History limit      | 10-1000                               | zundo history limit on next store creation |
| Map center         | longitude -180..180, latitude -90..90 | initial MapLibre center                    |
| Map zoom           | 1-22                                  | initial MapLibre zoom                      |
| Lane half width    | 0.5-10 m                              | default width for newly created lanes      |
| Lane arrow spacing | 40-500 m                              | MapLibre symbol spacing for lane arrows    |

Settings are persisted to `localStorage` under `apollo-map-studio:*` keys.

## Notes

Changing history limit does not rebuild the current zundo store. Reload the
app if you need the new limit to apply to the current editing session.
