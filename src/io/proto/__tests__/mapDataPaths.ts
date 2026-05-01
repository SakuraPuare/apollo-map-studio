/**
 * Centralised path resolution for the (gitignored) Apollo `map_data/`
 * reference corpus.
 *
 * `map_data/` ships ~2GB of upstream Apollo .bin fixtures used by fidelity
 * tests. It is intentionally *not* committed (see .gitignore). On machines
 * without it, every test below must skip gracefully — never fail.
 *
 * Usage in a fidelity test:
 *
 *   import { resolveMapBin } from './mapDataPaths';
 *   const APOLLO_BIN = resolveMapBin('sunnyvale_loop');
 *   it.runIf(existsSync(APOLLO_BIN))('...', () => { ... });
 *
 * If you need to add a new sample, drop the directory under `map_data/`
 * (anywhere on disk works) and reference it by basename — no path edits.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Root of the Apollo reference corpus, resolved from this file's location. */
export const MAP_DATA_ROOT = path.resolve(import.meta.dirname, '../../../../map_data');

/**
 * Resolve `<MAP_DATA_ROOT>/<sample>/base_map.bin`. Does not check existence —
 * pair with `existsSync` in `it.runIf` so missing fixtures skip, not fail.
 */
export function resolveMapBin(sample: string, file = 'base_map.bin'): string {
  return path.join(MAP_DATA_ROOT, sample, file);
}

/** True when the corpus root and the given sample's base_map.bin both exist. */
export function hasMapBin(sample: string, file = 'base_map.bin'): boolean {
  return existsSync(MAP_DATA_ROOT) && existsSync(resolveMapBin(sample, file));
}
