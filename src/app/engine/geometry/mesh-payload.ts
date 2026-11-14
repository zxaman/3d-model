import type { GenerationMode } from '../model';

/** Axis-aligned bounds in world units. */
export interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface MeshStats {
  readonly vertices: number;
  readonly triangles: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
}

/**
 * Raw geometry produced by the mesh worker.
 *
 * Typed arrays are *transferred* across the worker boundary (zero copy) and are
 * handed straight to a `THREE.BufferGeometry`, so the layout matches three.js
 * conventions: Y-up, counter-clockwise front faces, linear-space vertex colours.
 */
export interface MeshPayload {
  readonly mode: GenerationMode;
  readonly positions: Float32Array;
  /** `null` for point clouds. */
  readonly normals: Float32Array | null;
  /** Linear-space RGB triplets. */
  readonly colors: Float32Array | null;
  readonly uvs: Float32Array | null;
  /** `null` for non-indexed geometry (flat-shaded surfaces, point clouds). */
  readonly indices: Uint32Array | null;
  readonly stats: MeshStats;
  readonly bounds: Bounds;
  /** Closed volume — matters for slicers and for watertight export validation. */
  readonly watertight: boolean;
}
