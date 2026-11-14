import { writeLinearColor } from '../color';
import {
  applyGamma,
  boxBlur,
  extractHeightField,
  normalizeField,
  quantize,
  unsharpMask,
  type DepthSource,
} from '../image/depth-field';
import type { GenerationMode, GenerationPhase } from '../model';
import { PLANE_SIZE } from '../model';
import { MeshBuffers } from './buffers';
import type { MeshPayload } from './mesh-payload';

/**
 * Geometry builders — the heart of the image → 3D conversion.
 *
 * All four modes share one height field and one world convention:
 *
 *   • Y is up, the model is centred on the origin, `PLANE_SIZE` wide on its
 *     longest edge;
 *   • front faces are counter-clockwise (three.js / glTF convention);
 *   • vertex colours are linear-space RGB.
 */

export interface BuilderSettings {
  readonly mode: GenerationMode;
  /** Peak height in world units. */
  readonly depth: number;
  readonly smoothing: number;
  readonly detail: number;
  readonly contrast: number;
  readonly invert: boolean;
  readonly depthSource: DepthSource;
  readonly threshold: number;
  readonly base: boolean;
  readonly baseThickness: number;
  readonly voxelLayers: number;
  readonly pointStride: number;
}

export interface BuildInput {
  /** RGBA samples, already downscaled to the working grid. */
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly settings: BuilderSettings;
  readonly onProgress?: (phase: GenerationPhase, value: number) => void;
}

interface BuildContext {
  readonly field: Float32Array;
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly settings: BuilderSettings;
  readonly planeWidth: number;
  readonly planeDepth: number;
  readonly cellsX: number;
  readonly cellsY: number;
  /** Y coordinate of the bottom of the model (0 for open shells). */
  readonly baseY: number;
}

export function generateMesh(input: BuildInput): MeshPayload {
  const { pixels, width, height, settings, onProgress } = input;
  const cellsX = Math.max(1, width - 1);
  const cellsY = Math.max(1, height - 1);
  const aspect = width / height;

  const planeWidth = aspect >= 1 ? PLANE_SIZE : PLANE_SIZE * aspect;
  const planeDepth = aspect >= 1 ? PLANE_SIZE / aspect : PLANE_SIZE;

  onProgress?.('sampling', 0.1);

  const raw = extractHeightField(pixels, width, height, settings.depthSource, settings.invert);

  onProgress?.('smoothing', 0.3);
  let field = raw;
  if (settings.smoothing > 0) {
    const blurred = boxBlur(raw, width, height, Math.ceil(settings.smoothing), 2);
    field = settings.detail > 0 ? unsharpMask(raw, blurred, settings.detail) : blurred;
  }
  field = normalizeField(field);
  field = applyGamma(field, settings.contrast);

  const context: BuildContext = {
    field,
    pixels,
    width,
    height,
    settings,
    planeWidth,
    planeDepth,
    cellsX,
    cellsY,
    baseY: settings.base ? -settings.baseThickness : 0,
  };

  onProgress?.('meshing', 0.55);

  let payload: MeshPayload;
  switch (settings.mode) {
    case 'relief':
      payload = buildRelief(context);
      break;
    case 'extrude':
      payload = buildExtrude(context);
      break;
    case 'voxel':
      payload = buildVoxel(context);
      break;
    case 'points':
      payload = buildPoints(context);
      break;
  }

  onProgress?.('finishing', 0.95);
  return payload;
}

// ---------------------------------------------------------------------------
// Relief — smooth displaced surface, optionally closed into a solid
// ---------------------------------------------------------------------------

function buildRelief(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, planeWidth, planeDepth, cellsX, cellsY, baseY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];
  const uv: number[] = [0, 0];
  const position: number[] = [0, 0, 0];

  const xAt = (i: number): number => (i / cellsX - 0.5) * planeWidth;
  const zAt = (j: number): number => (j / cellsY - 0.5) * planeDepth;
  const uAt = (i: number): number => i / cellsX;
  const vAt = (j: number): number => 1 - j / cellsY;

  for (let j = 0; j <= cellsY; j++) {
    const z = zAt(j);
    const v = vAt(j);

    for (let i = 0; i <= cellsX; i++) {
      const index = j * width + i;
      writeLinearColor(pixels, index, color);

      position[0] = xAt(i);
      position[1] = (field[index] ?? 0) * settings.depth;
      position[2] = z;
      uv[0] = uAt(i);
      uv[1] = v;

      buffers.vertex(position, uv, color);
    }
  }

  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const a = j * width + i;
      const b = (j + 1) * width + i;
      const c = (j + 1) * width + i + 1;
      const d = j * width + i + 1;
      buffers.quad(a, b, c, d);
    }
  }

  if (settings.base) {
    addSkirt(buffers, context, baseY);
    addBottomCap(buffers, context, baseY);
  }

  buffers.computeSmoothNormals();

  return buffers.toPayload({
    mode: 'relief',
    gridWidth: cellsX,
    gridHeight: cellsY,
    watertight: settings.base,
  });
}

/**
 * Vertical walls around the border, from the surface edge down to the base.
 *
 * The top corners are duplicates of the surface vertices rather than shared
 * indices, which keeps the rim crisp: sharing would average the wall and surface
 * normals into a soft, rounded lip.
 */
function addSkirt(buffers: MeshBuffers, context: BuildContext, baseY: number): void {
  const { field, pixels, width, settings, planeWidth, planeDepth, cellsX, cellsY } = context;
  const color: number[] = [0, 0, 0];
  const uv: number[] = [0, 0];
  const position: number[] = [0, 0, 0];

  const xAt = (i: number): number => (i / cellsX - 0.5) * planeWidth;
  const zAt = (j: number): number => (j / cellsY - 0.5) * planeDepth;
  const uAt = (i: number): number => i / cellsX;
  const vAt = (j: number): number => 1 - j / cellsY;

  const emitPair = (
    index: number,
    x: number,
    z: number,
    u: number,
    v: number,
  ): [number, number] => {
    writeLinearColor(pixels, index, color);
    uv[0] = u;
    uv[1] = v;

    position[0] = x;
    position[1] = (field[index] ?? 0) * settings.depth;
    position[2] = z;
    const top = buffers.vertex(position, uv, color);

    position[1] = baseY;
    const bottom = buffers.vertex(position, uv, color);

    return [top, bottom];
  };

  // z = -depth/2 edge (outward −Z): walking +i, wind (topA, topB, botB, botA).
  for (let i = 0; i < cellsX; i++) {
    const z = zAt(0);
    const v = vAt(0);
    const [topA, botA] = emitPair(0 * width + i, xAt(i), z, uAt(i), v);
    const [topB, botB] = emitPair(0 * width + i + 1, xAt(i + 1), z, uAt(i + 1), v);
    buffers.quad(topA, topB, botB, botA);
  }

  // z = +depth/2 edge (outward +Z): reverse the winding.
  for (let i = 0; i < cellsX; i++) {
    const z = zAt(cellsY);
    const v = vAt(cellsY);
    const [topA, botA] = emitPair(cellsY * width + i, xAt(i), z, uAt(i), v);
    const [topB, botB] = emitPair(cellsY * width + i + 1, xAt(i + 1), z, uAt(i + 1), v);
    buffers.quad(topA, botA, botB, topB);
  }

  // x = −width/2 edge (outward −X): walking +j, wind (topA, botA, botB, topB).
  for (let j = 0; j < cellsY; j++) {
    const x = xAt(0);
    const u = uAt(0);
    const [topA, botA] = emitPair(j * width + 0, x, zAt(j), u, vAt(j));
    const [topB, botB] = emitPair((j + 1) * width + 0, x, zAt(j + 1), u, vAt(j + 1));
    buffers.quad(topA, botA, botB, topB);
  }

  // x = +width/2 edge (outward +X): reverse the winding.
  for (let j = 0; j < cellsY; j++) {
    const x = xAt(cellsX);
    const u = uAt(cellsX);
    const [topA, botA] = emitPair(j * width + cellsX, x, zAt(j), u, vAt(j));
    const [topB, botB] = emitPair((j + 1) * width + cellsX, x, zAt(j + 1), u, vAt(j + 1));
    buffers.quad(topA, topB, botB, botA);
  }
}

function addBottomCap(buffers: MeshBuffers, context: BuildContext, baseY: number): void {
  const { pixels, width, planeWidth, planeDepth, cellsX, cellsY } = context;
  const color: number[] = [0, 0, 0];

  const halfWidth = planeWidth / 2;
  const halfDepth = planeDepth / 2;

  // Corner order gives a −Y normal: (0,+D) → (0,−D) → (+W,−D) → (+W,+D).
  const corners: readonly [number, number, number, number][] = [
    [-halfWidth, baseY, halfDepth, cellsY * width],
    [-halfWidth, baseY, -halfDepth, 0],
    [halfWidth, baseY, -halfDepth, cellsX],
    [halfWidth, baseY, halfDepth, cellsY * width + cellsX],
  ];
  const cornerUvs: readonly [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];

  const indices: number[] = [];
  corners.forEach(([x, y, z, pixelIndex], corner) => {
    writeLinearColor(pixels, pixelIndex, color);
    indices.push(buffers.vertex([x, y, z], cornerUvs[corner] ?? [0, 0], color));
  });

  buffers.quad(indices[0] ?? 0, indices[1] ?? 0, indices[2] ?? 0, indices[3] ?? 0);
}

// ---------------------------------------------------------------------------
// Extrude — flat-topped silhouette with straight walls
// ---------------------------------------------------------------------------

function buildExtrude(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, planeWidth, planeDepth, cellsX, cellsY, baseY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];
  const topY = settings.depth;

  const xAt = (i: number): number => (i / cellsX - 0.5) * planeWidth;
  const zAt = (j: number): number => (j / cellsY - 0.5) * planeDepth;

  // A cell is solid when the average height of its four corners clears the cut-off.
  const solid = new Uint8Array(cellsX * cellsY);
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const average =
        ((field[j * width + i] ?? 0) +
          (field[j * width + i + 1] ?? 0) +
          (field[(j + 1) * width + i] ?? 0) +
          (field[(j + 1) * width + i + 1] ?? 0)) /
        4;
      solid[j * cellsX + i] = average >= settings.threshold ? 1 : 0;
    }
  }

  const isSolid = (i: number, j: number): boolean =>
    i >= 0 && j >= 0 && i < cellsX && j < cellsY && solid[j * cellsX + i] === 1;

  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      if (solid[j * cellsX + i] !== 1) {
        continue;
      }

      writeLinearColor(pixels, j * width + i, color);
      const x0 = xAt(i);
      const x1 = xAt(i + 1);
      const z0 = zAt(j);
      const z1 = zAt(j + 1);

      const u0 = i / cellsX;
      const u1 = (i + 1) / cellsX;
      const v0 = 1 - j / cellsY;
      const v1 = 1 - (j + 1) / cellsY;

      // Top face (+Y).
      buffers.flatQuad([x0, topY, z1], [x1, topY, z1], [x1, topY, z0], [x0, topY, z0], color, [
        [u0, v1],
        [u1, v1],
        [u1, v0],
        [u0, v0],
      ]);

      // Side walls, emitted only where the neighbour is empty.
      if (!isSolid(i - 1, j)) {
        buffers.flatQuad([x0, baseY, z0], [x0, baseY, z1], [x0, topY, z1], [x0, topY, z0], color);
      }
      if (!isSolid(i + 1, j)) {
        buffers.flatQuad([x1, baseY, z1], [x1, baseY, z0], [x1, topY, z0], [x1, topY, z1], color);
      }
      if (!isSolid(i, j - 1)) {
        buffers.flatQuad([x1, baseY, z0], [x0, baseY, z0], [x0, topY, z0], [x1, topY, z0], color);
      }
      if (!isSolid(i, j + 1)) {
        buffers.flatQuad([x0, baseY, z1], [x1, baseY, z1], [x1, topY, z1], [x0, topY, z1], color);
      }

      if (settings.base) {
        buffers.flatQuad([x0, baseY, z0], [x1, baseY, z0], [x1, baseY, z1], [x0, baseY, z1], color);
      }
    }
  }

  return buffers.toPayload({
    mode: 'extrude',
    gridWidth: cellsX,
    gridHeight: cellsY,
    watertight: settings.base,
  });
}

// ---------------------------------------------------------------------------
// Voxel — shell of coloured boxes
// ---------------------------------------------------------------------------

function buildVoxel(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, planeWidth, planeDepth, cellsX, cellsY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];

  const levels = Math.max(1, Math.round(settings.voxelLayers));
  const heights = quantize(field, levels);

  const halfX = planeWidth / cellsX / 2;
  const halfZ = planeDepth / cellsY / 2;
  const halfY = settings.depth / levels / 2;
  const stepY = settings.depth / levels;

  const heightAt = (i: number, j: number): number =>
    i < 0 || j < 0 || i >= cellsX || j >= cellsY ? 0 : (heights[j * width + i] ?? 0);

  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const columnHeight = heightAt(i, j);
      if (columnHeight <= 0) {
        continue;
      }

      const neighbours = [
        heightAt(i - 1, j),
        heightAt(i + 1, j),
        heightAt(i, j - 1),
        heightAt(i, j + 1),
      ];
      const lowestNeighbour = Math.min(...neighbours);
      const cx = ((i + 0.5) / cellsX) * planeWidth - planeWidth / 2;
      const cz = ((j + 0.5) / cellsY) * planeDepth - planeDepth / 2;

      writeLinearColor(pixels, j * width + i, color);

      let previousEmitted = false;
      for (let level = 1; level <= columnHeight; level++) {
        // Emit only what can be seen: the top of the stack and any cube whose
        // side is exposed because a neighbour is shorter.
        const exposed = level === columnHeight || lowestNeighbour < level;
        if (!exposed) {
          previousEmitted = false;
          continue;
        }

        const cy = (level - 1) * stepY + halfY;
        emitBox(buffers, cx, cy, cz, halfX, halfY, halfZ, color, {
          px: heightAt(i + 1, j) < level,
          nx: heightAt(i - 1, j) < level,
          pz: heightAt(i, j + 1) < level,
          nz: heightAt(i, j - 1) < level,
          py: level === columnHeight,
          ny: level === 1 || !previousEmitted,
        });

        previousEmitted = true;
      }
    }
  }

  return buffers.toPayload({
    mode: 'voxel',
    gridWidth: cellsX,
    gridHeight: cellsY,
    watertight: false,
  });
}

interface BoxFaces {
  readonly px: boolean;
  readonly nx: boolean;
  readonly py: boolean;
  readonly ny: boolean;
  readonly pz: boolean;
  readonly nz: boolean;
}

/**
 * Emits the visible faces of an axis-aligned box.
 *
 * Corner orders follow the right-hand rule so normals point outwards; interior
 * faces are skipped, which typically halves the triangle count of a voxel model.
 */
function emitBox(
  buffers: MeshBuffers,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  color: number[],
  faces: BoxFaces,
): void {
  if (faces.px) {
    buffers.flatQuad(
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz + hz],
      color,
    );
  }
  if (faces.nx) {
    buffers.flatQuad(
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz - hz],
      color,
    );
  }
  if (faces.py) {
    buffers.flatQuad(
      [cx - hx, cy + hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx + hx, cy + hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      color,
    );
  }
  if (faces.ny) {
    buffers.flatQuad(
      [cx - hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz + hz],
      [cx - hx, cy - hy, cz + hz],
      color,
    );
  }
  if (faces.pz) {
    buffers.flatQuad(
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      color,
    );
  }
  if (faces.nz) {
    buffers.flatQuad(
      [cx + hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      color,
    );
  }
}

// ---------------------------------------------------------------------------
// Point cloud
// ---------------------------------------------------------------------------

function buildPoints(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, planeWidth, planeDepth, cellsX, cellsY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];
  const stride = Math.max(1, Math.round(settings.pointStride));

  for (let j = 0; j <= cellsY; j += stride) {
    for (let i = 0; i <= cellsX; i += stride) {
      const index = j * width + i;
      writeLinearColor(pixels, index, color);
      buffers.point(
        (i / cellsX - 0.5) * planeWidth,
        (field[index] ?? 0) * settings.depth,
        (j / cellsY - 0.5) * planeDepth,
        color,
      );
    }
  }

  return buffers.toPayload({
    mode: 'points',
    gridWidth: cellsX,
    gridHeight: cellsY,
    watertight: false,
  });
}
