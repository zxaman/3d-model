import type { GenerationSettings } from './generation.model';

export interface ComplexityEstimate {
  readonly vertices: number;
  readonly triangles: number;
  readonly heavy: boolean;
}

/** Above this, generation is still possible but the viewport may drop frames. */
const HEAVY_TRIANGLE_BUDGET = 350_000;

/**
 * Cheap closed-form estimate of how big a model will get, used to warn the user
 * *before* the worker spends a second building it.
 */
export function estimateComplexity(
  settings: GenerationSettings,
  aspectRatio: number,
): ComplexityEstimate {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const longest = Math.max(1, Math.round(settings.resolution));

  // The grid follows the image aspect: the longest edge gets `resolution` cells.
  const gridWidth = ratio >= 1 ? longest : Math.max(2, Math.round(longest * ratio));
  const gridHeight = ratio >= 1 ? Math.max(2, Math.round(longest / ratio)) : longest;

  let vertices: number;
  let triangles: number;

  switch (settings.mode) {
    case 'relief': {
      vertices = (gridWidth + 1) * (gridHeight + 1);
      triangles = gridWidth * gridHeight * 2;
      if (settings.base) {
        // Skirt + back face: one quad per border cell, plus two triangles for the cap.
        const border = (gridWidth + gridHeight) * 2;
        vertices += border * 4 + 4;
        triangles += border * 2 + 2;
      }
      break;
    }
    case 'extrude': {
      // Roughly half the surface survives the threshold, walls dominate the rest.
      const fill = 1 - Math.min(0.95, Math.max(0.05, settings.threshold));
      vertices = Math.round(gridWidth * gridHeight * 4 * (fill + 0.35));
      triangles = Math.round(gridWidth * gridHeight * 2 * (fill + 0.35));
      break;
    }
    case 'voxel': {
      // A shell: one exposed cube per column, plus a few side cubes per step.
      const columns = gridWidth * gridHeight;
      const cubes = Math.round(columns * Math.min(settings.voxelLayers, 4) * 0.7);
      vertices = cubes * 24;
      triangles = cubes * 10;
      break;
    }
    case 'points': {
      const stride = Math.max(1, Math.round(settings.pointStride));
      vertices = Math.ceil(gridWidth / stride) * Math.ceil(gridHeight / stride);
      triangles = 0;
      break;
    }
  }

  return {
    vertices: Math.max(0, Math.round(vertices)),
    triangles: Math.max(0, Math.round(triangles)),
    heavy: triangles > HEAVY_TRIANGLE_BUDGET,
  };
}
