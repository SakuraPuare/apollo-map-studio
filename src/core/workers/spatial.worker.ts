/**
 * Spatial Worker
 * Maintains the worker-local spatial index, cold feature cache, lane junction
 * decoration cache, and hit testing protocol.
 */
import type { WorkerRequest, WorkerResponse } from './protocol';
import { handleRequest } from './spatialRequests';
import { createSpatialState } from './spatialState';

const state = createSpatialState();

function respond(msg: WorkerResponse) {
  postMessage(msg);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  handleRequest(state, e.data, respond);
};
