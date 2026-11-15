/**
 * Vocabulary shared by the geometry engine.
 *
 * The engine never imports from `core/` — it is a self-contained, framework-free
 * library that happens to live inside the app. `core/models` re-exports these
 * types so application code only ever imports from one place.
 *
 * ## Units
 *
 * **One world unit is one millimetre.** STL, OBJ and PLY carry no unit metadata:
 * every slicer (Cura, PrusaSlicer, Bambu Studio) reads the raw numbers as
 * millimetres. Making the engine speak millimetres natively is what lets a model
 * leave the app at a real, printable size instead of an abstract blob that opens
 * as a 2 mm speck.
 */

/** The four ways the engine can turn pixels into geometry. */
export type GenerationMode = 'relief' | 'extrude' | 'voxel' | 'points';

/** Stages reported by the worker so the UI can show meaningful progress. */
export type GenerationPhase = 'sampling' | 'smoothing' | 'meshing' | 'finishing';

/**
 * Ready-made physical objects the relief can be dressed up as.
 *
 * Each one is a starting point for a real print rather than a look: a keychain
 * gets a hanging loop, a coin gets a rim, a plaque gets a frame. `none` leaves
 * the plain slab the rest of the settings describe.
 */
export type PrintPreset = 'none' | 'keychain' | 'coin' | 'plaque' | 'lithophane';

export const PRINT_PRESETS: readonly PrintPreset[] = [
  'none',
  'keychain',
  'coin',
  'plaque',
  'lithophane',
];

/**
 * How a preset is silhouetted.
 *
 * The outline is a **superellipse**: `|u|^p + |v|^p = 1`. `p = 2` is a circle,
 * larger values square it off, and the rectangular sampling grid is warped onto
 * it. Warping (rather than clipping) matters — it keeps the grid topology
 * intact, so the top surface stays a clean quad mesh and the boundary is exact
 * instead of stair-stepped.
 */
export interface PrintShape {
  /** Superellipse exponent. `0` means "leave the grid rectangular". */
  readonly exponent: number;
  /**
   * Height of the raised rim that fences the image, as a fraction of the peak
   * depth on top of it. `0.5` puts the rim half as tall again as the deepest
   * point of the relief.
   */
  readonly ridge: number;
  /** How far in from the outline the rim starts, in millimetres. */
  readonly ridgeInset: number;
  /** Adds a loop with a hole, so the finished print can hang. */
  readonly hanger: boolean;
}

export const PRINT_SHAPES: Readonly<Record<PrintPreset, PrintShape>> = {
  none: { exponent: 0, ridge: 0, ridgeInset: 0, hanger: false },
  keychain: { exponent: 6, ridge: 0.5, ridgeInset: 1.2, hanger: true },
  coin: { exponent: 2, ridge: 0.7, ridgeInset: 1, hanger: false },
  plaque: { exponent: 14, ridge: 0.4, ridgeInset: 2.5, hanger: false },
  lithophane: { exponent: 16, ridge: 0.9, ridgeInset: 2, hanger: false },
};

export type { DepthSource } from './image/depth-field';
