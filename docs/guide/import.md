# Import

Apollo Map Studio can load an existing `base_map.bin` file and restore it as an editable map.

## Import a map

1. Click **Import** in the top-right toolbar
2. Either drag and drop a `.bin` file onto the drop zone, or click to open the file picker
3. The parser decodes the binary, converts all ENU coordinates back to WGS84, and populates the editor state

After import, the map behaves identically to one drawn from scratch — all elements are selectable, editable, and re-exportable.

## What gets restored

| Element            | Restored fields                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lanes**          | centerline geometry, width (estimated from samples), speed limit, type, turn, direction, boundary types, predecessor/successor/neighbor IDs, junction ID |
| **Junctions**      | polygon geometry                                                                                                                                         |
| **Crosswalks**     | polygon geometry                                                                                                                                         |
| **Stop signs**     | stop line geometry, type                                                                                                                                 |
| **Clear areas**    | polygon geometry                                                                                                                                         |
| **Speed bumps**    | position line geometry                                                                                                                                   |
| **Parking spaces** | polygon geometry, heading                                                                                                                                |
| **Signals**        | stop line geometry, signal type, position (midpoint of stop line)                                                                                        |

::: info Overlap objects
`Overlap` objects from the binary are **not** restored to the editor state — they are recomputed from scratch at export time. This ensures consistency if you modify any element after import.
:::

## Coordinate recovery

The import parser extracts the ENU origin from the map's `header.projection.proj` string:

```
+proj=tmerc +lat_0=<originLat> +lon_0=<originLon> +k=1 +ellps=WGS84 +no_defs
```

If the projection string is absent or malformed, the origin defaults to `(0, 0)`. In that case, re-open **Project Settings** and correct the origin before exporting.

## Width estimation

Apollo's `base_map.bin` stores `left_sample` and `right_sample` arrays (per-meter distances from centerline to each boundary). The import parser estimates the lane width as:

```
width = mean(left_sample[i].width + right_sample[i].width)
```

This gives an approximate uniform width. For lanes with varying width, the exported `base_map.bin` will use the constant estimated width for sampling.

## Limitations

- **Road proto is not restored** — lane-to-road grouping (`roadId`) is lost on import. Lanes re-export each as their own road unless you manually set `roadId` in the Properties panel after import.
- **sim_map.bin and routing_map.bin are not parsed** — only `base_map.bin` is supported as import source.
- **Subsignal geometry** — the `Subsignal` locations within a signal are not restored (Apollo Map Studio treats a signal as a single point + stop line).
