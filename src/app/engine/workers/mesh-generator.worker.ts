/// <reference lib="webworker" />

import { generateMesh } from '../geometry/builders';
import type { WorkerRequest, WorkerResponse } from './mesh-worker.contract';

/**
 * Mesh generation worker.
 *
 * Geometry building is CPU-bound and can allocate tens of megabytes, so it never
 * runs on the main thread — dragging a slider stays smooth even when a 500 × 500
 * grid is being rebuilt four times a second.
 *
 * `self` is typed as a `Worker` (the DOM handle) rather than
 * `DedicatedWorkerGlobalScope`, which keeps the file type-checkable under the
 * app's DOM `lib` without a second tsconfig.
 */
const ctx = self as unknown as Worker;

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (!request || request.kind !== 'generate') {
    return;
  }

  const started = performance.now();

  try {
    const payload = generateMesh({
      pixels: request.pixels,
      width: request.width,
      height: request.height,
      settings: request.settings,
      onProgress: (phase, value) => {
        post({ kind: 'progress', requestId: request.requestId, phase, value });
      },
    });

    const transfer: Transferable[] = [payload.positions.buffer];
    if (payload.normals) transfer.push(payload.normals.buffer);
    if (payload.colors) transfer.push(payload.colors.buffer);
    if (payload.uvs) transfer.push(payload.uvs.buffer);
    if (payload.indices) transfer.push(payload.indices.buffer);

    post(
      {
        kind: 'result',
        requestId: request.requestId,
        payload,
        durationMs: performance.now() - started,
      },
      transfer,
    );
  } catch (error) {
    post({
      kind: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

function post(message: WorkerResponse, transfer: readonly Transferable[] = []): void {
  ctx.postMessage(message, [...transfer]);
}
