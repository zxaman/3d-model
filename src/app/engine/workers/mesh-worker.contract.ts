import type { BuilderSettings } from '../geometry/builders';
import type { MeshPayload } from '../geometry/mesh-payload';
import type { GenerationPhase } from '../model';

/**
 * Message contract between the main thread and the mesh worker.
 *
 * The request carries the (already downscaled) pixel buffer and transfers its
 * `ArrayBuffer`, so there is no copy of the image data crossing the boundary.
 */
export interface GenerateRequest {
  readonly kind: 'generate';
  readonly requestId: number;
  readonly settings: BuilderSettings;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export interface ProgressMessage {
  readonly kind: 'progress';
  readonly requestId: number;
  readonly phase: GenerationPhase;
  /** 0…1 within the current generation run. */
  readonly value: number;
}

export interface ResultMessage {
  readonly kind: 'result';
  readonly requestId: number;
  readonly payload: MeshPayload;
  readonly durationMs: number;
}

export interface ErrorMessage {
  readonly kind: 'error';
  readonly requestId: number;
  readonly message: string;
}

export type WorkerRequest = GenerateRequest;
export type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;

export const PHASE_LABELS: Readonly<Record<GenerationPhase, string>> = {
  sampling: 'Reading pixels',
  smoothing: 'Building height field',
  meshing: 'Generating geometry',
  finishing: 'Finishing',
};
