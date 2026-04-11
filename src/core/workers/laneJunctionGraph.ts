/**
 * Endpoint dependency graph for incremental lane junction stitching.
 *
 * Why: applyLaneJunctions stitches every lane junction every time it runs, and
 * the worker calls it on every entity edit. For an HD map with hundreds of
 * lanes the boundary decoration cost dominates each call (~3ms × N). To
 * cache decoration per-lane and only refresh affected lanes, we need a fast
 * way to ask "which lanes share an endpoint with lane X?".
 *
 * The graph maintains two indexes that together let us answer
 * getDependents(id) in O(K) where K = junction fan-out (typically 2-4):
 *   - laneToKeys: lane id → [startKey, endKey]
 *   - keyToLanes: endpoint key → Set<lane id>
 *
 * Endpoint keys use the same toFixed(6) quantization as the geometric
 * stitcher in laneJunctions.ts so the two stay consistent.
 */

import type { GeoPoint } from '@/types/entities';
import type { LaneEntity } from '@/types/apollo';

export type EndpointKey = string;

export function endpointKeyOf(pt: GeoPoint): EndpointKey {
  return `${pt.x.toFixed(6)},${pt.y.toFixed(6)}`;
}

/** Extract a lane's [startKey, endKey] tuple, or null if the centerline is degenerate. */
export function laneEndpointKeys(lane: LaneEntity): [EndpointKey, EndpointKey] | null {
  const pts = lane.centralCurve.segments[0]?.lineSegment.points ?? [];
  if (pts.length < 2) return null;
  const start = pts[0];
  const end = pts[pts.length - 1];
  return [endpointKeyOf(start), endpointKeyOf(end)];
}

export class LaneJunctionGraph {
  private laneToKeys = new Map<string, [EndpointKey, EndpointKey]>();
  private keyToLanes = new Map<EndpointKey, Set<string>>();

  clear(): void {
    this.laneToKeys.clear();
    this.keyToLanes.clear();
  }

  addLane(id: string, keys: [EndpointKey, EndpointKey]): void {
    // Idempotent: clean up any prior mapping before re-inserting.
    this.removeLane(id);
    this.laneToKeys.set(id, keys);
    for (const key of keys) {
      let bucket = this.keyToLanes.get(key);
      if (!bucket) {
        bucket = new Set();
        this.keyToLanes.set(key, bucket);
      }
      bucket.add(id);
    }
  }

  removeLane(id: string): void {
    const keys = this.laneToKeys.get(id);
    if (!keys) return;
    for (const key of keys) {
      const bucket = this.keyToLanes.get(key);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) this.keyToLanes.delete(key);
    }
    this.laneToKeys.delete(id);
  }

  /** Lanes that share at least one endpoint with `id` (excluding `id` itself). */
  getDependents(id: string): Set<string> {
    const out = new Set<string>();
    const keys = this.laneToKeys.get(id);
    if (!keys) return out;
    for (const key of keys) {
      const bucket = this.keyToLanes.get(key);
      if (!bucket) continue;
      for (const other of bucket) {
        if (other !== id) out.add(other);
      }
    }
    return out;
  }

  has(id: string): boolean {
    return this.laneToKeys.has(id);
  }

  size(): number {
    return this.laneToKeys.size;
  }
}
