/**
 * Vocabulary shared by the geometry engine.
 *
 * The engine never imports from `core/` — it is a self-contained, framework-free
 * library that happens to live inside the app. `core/models` re-exports these
 * types so application code only ever imports from one place.
 */

/** The four ways the engine can turn pixels into geometry. */
export type GenerationMode = 'relief' | 'extrude' | 'voxel' | 'points';

/** Stages reported by the worker so the UI can show meaningful progress. */
export type GenerationPhase = 'sampling' | 'smoothing' | 'meshing' | 'finishing';

/** Longest edge of a generated model, in world units. */
export const PLANE_SIZE = 2;

export type { DepthSource } from './image/depth-field';
