import type { GenerationMode, GenerationSettings, PresentationSettings } from './generation.model';

/** Schema version baked into every persisted record — the migration handle. */
export const PROJECT_SCHEMA_VERSION = 1;

/** Trimmed-down record used to render the gallery grid. */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly mode: GenerationMode;
  readonly thumbnail: string;
  readonly width: number;
  readonly height: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Size of the persisted record in bytes (source image included). */
  readonly bytes: number;
}

/**
 * Full project record. Everything needed to rebuild the 3D model deterministically
 * lives here: the source image plus the exact settings that produced it. The
 * generated geometry itself is a cache, never the source of truth.
 */
export interface ProjectRecord extends ProjectSummary {
  /** Data URL of the (downscaled) source image. */
  readonly imageDataUrl: string;
  readonly settings: GenerationSettings;
  readonly presentation: PresentationSettings;
  readonly generationMs: number;
}

export interface ProjectDraft {
  readonly id: string;
  readonly name: string;
  readonly mode: GenerationMode;
  readonly thumbnail: string;
  readonly imageDataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly settings: GenerationSettings;
  readonly presentation: PresentationSettings;
  readonly vertices: number;
  readonly triangles: number;
  readonly generationMs: number;
  readonly bytes: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}
