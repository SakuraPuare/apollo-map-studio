/**
 * Spatial Worker
 * Maintains the worker-local spatial index, cold feature cache, lane junction
 * decoration cache, and hit testing protocol.
 */
import type { WorkerRequest, WorkerResponse } from './protocol';
import { handleRequest } from './spatialRequests';
import { createSpatialState } from './spatialState';

const state = createSpatialState();
const COLD_GROUP_CHUNK_SIZE = 1_000;

function respond(msg: WorkerResponse) {
  postMessage(msg);
}

function respondChunked(msg: WorkerResponse) {
  if (msg.type !== 'COLD_READY' || msg.groups.length <= COLD_GROUP_CHUNK_SIZE) {
    respond(msg);
    return;
  }

  for (let offset = 0; offset < msg.groups.length; offset += COLD_GROUP_CHUNK_SIZE) {
    respond({
      type: 'COLD_GROUPS_CHUNK',
      requestId: msg.requestId,
      groups: msg.groups.slice(offset, offset + COLD_GROUP_CHUNK_SIZE),
      offset,
      total: msg.groups.length,
    });
  }
  respond({ ...msg, groups: [], featureCollection: undefined });
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  handleRequest(state, e.data, respondChunked);
};
