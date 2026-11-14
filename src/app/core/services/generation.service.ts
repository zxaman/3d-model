import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import type { BuilderSettings } from '@engine/geometry/builders';
import type { MeshPayload } from '@engine/geometry/mesh-payload';
import type { GenerationPhase } from '@engine/model';
import type { WorkerResponse } from '@engine/workers/mesh-worker.contract';

export interface PixelBuffer {
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface GenerationProgress {
  readonly kind: 'progress';
  readonly phase: GenerationPhase;
  readonly value: number;
}

export interface GenerationComplete {
  readonly kind: 'result';
  readonly payload: MeshPayload;
  readonly durationMs: number;
}

export type GenerationEvent = GenerationProgress | GenerationComplete;

/**
 * Owns the mesh worker.
 *
 * The worker is created lazily and torn down whenever a run is cancelled or
 * completes, which is the only reliable way to interrupt a synchronous
 * `postMessage` handler — and cancellation matters, because slider drags fire
 * faster than a heavy mesh can be rebuilt.
 */
@Injectable({ providedIn: 'root' })
export class GenerationService implements OnDestroy {
  #worker: Worker | null = null;
  #nextRequestId = 1;

  generate(input: PixelBuffer & { settings: BuilderSettings }): Observable<GenerationEvent> {
    return new Observable<GenerationEvent>((subscriber) => {
      let worker: Worker;
      try {
        worker = this.#spawn();
      } catch (error) {
        subscriber.error(
          new Error(
            `Web workers are unavailable in this browser (${error instanceof Error ? error.message : String(error)}).`,
          ),
        );
        return;
      }

      const requestId = this.#nextRequestId++;

      const onMessage = (event: MessageEvent<WorkerResponse>): void => {
        const message = event.data;
        if (message.requestId !== requestId) {
          return; // stale reply from a cancelled run
        }

        switch (message.kind) {
          case 'progress':
            subscriber.next({ kind: 'progress', phase: message.phase, value: message.value });
            break;
          case 'result':
            subscriber.next({
              kind: 'result',
              payload: message.payload,
              durationMs: message.durationMs,
            });
            subscriber.complete();
            break;
          case 'error':
            subscriber.error(new Error(message.message));
            break;
        }
      };

      const onError = (event: ErrorEvent): void => {
        subscriber.error(new Error(event.message || 'The mesh worker stopped unexpectedly.'));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);

      const request = {
        kind: 'generate',
        requestId,
        settings: input.settings,
        width: input.width,
        height: input.height,
        pixels: input.pixels,
      } as const;

      worker.postMessage(request, [input.pixels.buffer]);

      return () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        this.#terminate();
      };
    });
  }

  ngOnDestroy(): void {
    this.#terminate();
  }

  #spawn(): Worker {
    if (this.#worker === null) {
      this.#worker = new Worker(
        new URL('../../engine/workers/mesh-generator.worker', import.meta.url),
        { type: 'module', name: 'i3d-mesh-generator' },
      );
    }
    return this.#worker;
  }

  #terminate(): void {
    this.#worker?.terminate();
    this.#worker = null;
  }
}
