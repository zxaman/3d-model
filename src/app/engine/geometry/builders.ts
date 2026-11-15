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
import {
  PRINT_SHAPES,
  type GenerationMode,
  type GenerationPhase,
  type PrintPreset,
} from '../model';
import { MeshBuffers, type Vec2 } from './buffers';
import type { MeshPayload } from './mesh-payload';
import { addHangerTab, addSealedBase } from './solids';

/**
 * Geometry builders — the heart of the image → 3D conversion.
 *
 * All four modes share one height field and one world convention:
 *
 *   • **one world unit is one millimetre.** STL, OBJ and PLY have no unit field,
 *     so every slicer reads whatever numbers it finds as millimetres. Emitting
 *     millimetres directly is the only way a model opens at the size the user
 *     asked for instead of a 2-unit abstract blob;
 *   • Y is up, the model is centred on the origin, and it is
 *     `settings.widthMm` across its longest edge;
 *   • front faces are counter-clockwise (three.js / glTF convention);
 *   • vertex colours are linear-space RGB.
 */

export interface BuilderSettings {
  readonly mode: GenerationMode;
  /** Width of the longest edge, in millimetres. */
  readonly widthMm: number;
  /** Peak height, in millimetres. */
  readonly depth: number;
  readonly smoothing: number;
  readonly detail: number;
  readonly contrast: number;
  readonly invert: boolean;
  readonly depthSource: DepthSource;
  readonly threshold: number;
  readonly base: boolean;
  /** Thickness of the backing slab, in millimetres. */
  readonly baseThickness: number;
  readonly voxelLayers: number;
  readonly pointStride: number;
  /** Physical object to build the image into. */
  readonly printPreset: PrintPreset;
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
  readonly settings: BuilderSettings;
  /** Warped X coordinate of grid point `(i, j)`, in millimetres. */
  readonly xs: Float32Array;
  /** Warped Z coordinate of grid point `(i, j)`, in millimetres. */
  readonly zs: Float32Array;
  readonly planeWidth: number;
  readonly planeDepth: number;
  readonly cellsX: number;
  readonly cellsY: number;
  /** Y coordinate of the bottom of the model (0 for open shells). */
  readonly baseY: number;
  /** Tallest point of the finished surface, in millimetres. */
  readonly topY: number;
}

export function generateMesh(input: BuildInput): MeshPayload {
  const { pixels, width, height, settings, onProgress } = input;
  const cellsX = Math.max(1, width - 1);
  const cellsY = Math.max(1, height - 1);
  const aspect = width / height;
  const shape = PRINT_SHAPES[settings.printPreset];

  const planeWidth = aspect >= 1 ? settings.widthMm : settings.widthMm * aspect;
  const planeDepth = aspect >= 1 ? settings.widthMm / aspect : settings.widthMm;

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

  const { xs, zs } = warpGrid(cellsX, cellsY, planeWidth, planeDepth, shape.exponent);
  applyRim(field, width, height, shape.ridge, shape.ridgeInset, planeWidth, planeDepth);

  const context: BuildContext = {
    field,
    pixels,
    width,
    settings,
    xs,
    zs,
    planeWidth,
    planeDepth,
    cellsX,
    cellsY,
    baseY: settings.base ? -settings.baseThickness : 0,
    topY: settings.depth * (1 + shape.ridge),
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
// Outline warping
// ---------------------------------------------------------------------------

/**
 * Bends the rectangular sampling grid onto the preset's outline.
 *
 * Every grid point outside the outline is pushed radially inwards until it sits
 * *on* it, which maps the grid's outer ring exactly onto the curve. The image is
 * still sampled at the original grid position, so the picture is never stretched
 * — only the coordinates it is drawn at move. Keeping the grid topology intact
 * is what makes the result printable: the boundary needs no stitching, and the
 * top surface stays a clean quad mesh the seal can share vertices with.
 */
function warpGrid(
  cellsX: number,
  cellsY: number,
  planeWidth: number,
  planeDepth: number,
  exponent: number,
): { xs: Float32Array; zs: Float32Array } {
  const size = (cellsX + 1) * (cellsY + 1);
  const xs = new Float32Array(size);
  const zs = new Float32Array(size);

  if (exponent <= 0) {
    for (let j = 0; j <= cellsY; j++) {
      const z = (j / cellsY - 0.5) * planeDepth;
      for (let i = 0; i <= cellsX; i++) {
        const index = j * (cellsX + 1) + i;
        xs[index] = (i / cellsX - 0.5) * planeWidth;
        zs[index] = z;
      }
    }
    return { xs, zs };
  }

  const halfWidth = planeWidth / 2;
  const halfDepth = planeDepth / 2;

  for (let j = 0; j <= cellsY; j++) {
    const v = (j / cellsY) * 2 - 1;
    for (let i = 0; i <= cellsX; i++) {
      const u = (i / cellsX) * 2 - 1;
      const radius = shapeRadius(u, v, exponent);
      // Points inside the outline are left alone, so the middle of the image
      // keeps its true proportions and only the margins compress.
      const scale = radius > 1 ? 1 / radius : 1;
      const index = j * (cellsX + 1) + i;
      xs[index] = u * scale * halfWidth;
      zs[index] = v * scale * halfDepth;
    }
  }

  return { xs, zs };
}

function shapeRadius(u: number, v: number, exponent: number): number {
  const a = Math.abs(u);
  const b = Math.abs(v);
  return exponent === 2
    ? Math.hypot(a, b)
    : Math.pow(Math.pow(a, exponent) + Math.pow(b, exponent), 1 / exponent);
}

/**
 * Raises a rim around the edge of the model.
 *
 * Written back into the height field rather than added as separate geometry, so
 * every mode inherits it: the relief gets a border wall, Extrude turns the rim
 * solid, and the voxel stack tops out there.
 */
function applyRim(
  field: Float32Array,
  width: number,
  height: number,
  ridge: number,
  inset: number,
  planeWidth: number,
  planeDepth: number,
): void {
  if (ridge <= 0) {
    return;
  }

  const cellsX = Math.max(1, width - 1);
  const cellsY = Math.max(1, height - 1);
  const rimHeight = 1 + ridge;
  const insetFraction = Math.min(
    0.45,
    Math.max(0.02, inset / Math.max(1, Math.min(planeWidth, planeDepth) / 2)),
  );
  const start = 1 - insetFraction;

  for (let j = 0; j <= cellsY; j++) {
    const v = (j / cellsY) * 2 - 1;
    for (let i = 0; i <= cellsX; i++) {
      const u = (i / cellsX) * 2 - 1;
      const radius = Math.max(Math.abs(u), Math.abs(v));
      const t = Math.min(1, Math.max(0, (radius - start) / insetFraction));
      if (t <= 0) {
        continue;
      }
      const blend = t * t * (3 - 2 * t);
      const index = j * width + i;
      field[index] = (field[index] ?? 0) * (1 - blend) + rimHeight * blend;
    }
  }
}

// ---------------------------------------------------------------------------
// Relief — smooth displaced surface, closed into a solid
// ---------------------------------------------------------------------------

function buildRelief(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, xs, zs, cellsX, cellsY, topY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];
  const uv: number[] = [0, 0];
  const position: number[] = [0, 0, 0];

  for (let j = 0; j <= cellsY; j++) {
    for (let i = 0; i <= cellsX; i++) {
      const index = j * width + i;
      writeLinearColor(pixels, index, color);

      position[0] = xs[index] ?? 0;
      position[1] = (field[index] ?? 0) * settings.depth;
      position[2] = zs[index] ?? 0;
      uv[0] = i / cellsX;
      uv[1] = 1 - j / cellsY;

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
    addSealedBase(buffers, context);
  }

  if (PRINT_SHAPES[settings.printPreset].hanger) {
    addHanger(context, buffers, topY);
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
 * A hanging loop, sized in millimetres so it survives being printed.
 *
 * It overlaps the body slightly on purpose: two closed solids that interpenetrate
 * union cleanly in every slicer, whereas two that merely touch leave a seam.
 */
function addHanger(context: BuildContext, buffers: MeshBuffers, topY: number): void {
  const { planeWidth, planeDepth, baseY, pixels } = context;
  const color: number[] = [0, 0, 0];
  writeLinearColor(pixels, 0, color);

  addHangerTab(buffers, {
    centreX: 0,
    zOuter: -planeDepth / 2 - Math.min(12, Math.max(5, planeDepth * 0.14)),
    zInner: -planeDepth / 2 + 1.2,
    halfWidth: Math.min(8, Math.max(3, planeWidth * 0.09)),
    yBottom: baseY,
    yTop: topY,
    holeRadius: Math.min(8, Math.max(3, planeWidth * 0.09)) * 0.42,
    color,
  });
}

// ---------------------------------------------------------------------------
// Extrude — flat-topped silhouette with straight walls
// ---------------------------------------------------------------------------

function buildExtrude(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, xs, zs, cellsX, cellsY, baseY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];
  const topY = settings.depth;

  const xAt = (i: number, j: number): number => xs[gridIndex(i, j, cellsX, cellsY)] ?? 0;
  const zAt = (i: number, j: number): number => zs[gridIndex(i, j, cellsX, cellsY)] ?? 0;

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

      const x0 = xAt(i, j);
      const x1 = xAt(i + 1, j);
      const x2 = xAt(i + 1, j + 1);
      const x3 = xAt(i, j + 1);
      const z0 = zAt(i, j);
      const z1 = zAt(i + 1, j);
      const z2 = zAt(i + 1, j + 1);
      const z3 = zAt(i, j + 1);

      const u0 = i / cellsX;
      const u1 = (i + 1) / cellsX;
      const v0 = 1 - j / cellsY;
      const v1 = 1 - (j + 1) / cellsY;

      // Top face (+Y).
      buffers.flatQuad([x3, topY, z3], [x2, topY, z2], [x1, topY, z1], [x0, topY, z0], color, [
        [u0, v1],
        [u1, v1],
        [u1, v0],
        [u0, v0],
      ]);

      // Side walls, emitted only where the neighbour is empty — which is also
      // what keeps each cell a closed box, and so the whole model a union of
      // closed volumes a slicer can trust.
      if (!isSolid(i - 1, j)) {
        buffers.flatQuad([x0, baseY, z0], [x0, baseY, z3], [x0, topY, z3], [x0, topY, z0], color);
      }
      if (!isSolid(i + 1, j)) {
        buffers.flatQuad([x2, baseY, z2], [x1, baseY, z1], [x1, topY, z1], [x2, topY, z2], color);
      }
      if (!isSolid(i, j - 1)) {
        buffers.flatQuad([x1, baseY, z1], [x0, baseY, z0], [x0, topY, z0], [x1, topY, z1], color);
      }
      if (!isSolid(i, j + 1)) {
        buffers.flatQuad([x3, baseY, z3], [x2, baseY, z2], [x2, topY, z2], [x3, topY, z3], color);
      }

      if (settings.base) {
        buffers.flatQuad([x0, baseY, z0], [x1, baseY, z1], [x2, baseY, z2], [x3, baseY, z3], color);
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

/** Clamps a grid lookup to the surface, so boundary cells see their own edge. */
function gridIndex(i: number, j: number, cellsX: number, cellsY: number): number {
  const column = Math.min(cellsX, Math.max(0, i));
  const row = Math.min(cellsY, Math.max(0, j));
  return row * (cellsX + 1) + column;
}

// ---------------------------------------------------------------------------
// Voxel — stack of coloured boxes
// ---------------------------------------------------------------------------

function buildVoxel(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, xs, zs, cellsX, cellsY, baseY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];

  const levels = Math.max(1, Math.round(settings.voxelLayers));
  const heights = quantize(field, levels);

  const stepY = settings.depth / levels;
  const halfY = stepY / 2;

  const heightAt = (i: number, j: number): number =>
    i < 0 || j < 0 || i >= cellsX || j >= cellsY ? 0 : (heights[j * width + i] ?? 0);

  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const columnHeight = heightAt(i, j);
      if (columnHeight <= 0) {
        continue;
      }

      // Every level is considered, not only the visible ones: a box that is
      // skipped because its sides are hidden still has to be there, or the
      // stack above it leaves a hole where the floor should be.
      const neighbourPx = heightAt(i + 1, j);
      const neighbourNx = heightAt(i - 1, j);
      const neighbourPz = heightAt(i, j + 1);
      const neighbourNz = heightAt(i, j - 1);

      // Cell extents come from the (possibly warped) outline, so cubes stay
      // flush with their neighbours even where the grid is compressed.
      const xa = xs[gridIndex(i, j, cellsX, cellsY)] ?? 0;
      const xb = xs[gridIndex(i + 1, j, cellsX, cellsY)] ?? 0;
      const xc = xs[gridIndex(i, j + 1, cellsX, cellsY)] ?? 0;
      const xd = xs[gridIndex(i + 1, j + 1, cellsX, cellsY)] ?? 0;
      const za = zs[gridIndex(i, j, cellsX, cellsY)] ?? 0;
      const zb = zs[gridIndex(i + 1, j, cellsX, cellsY)] ?? 0;
      const zc = zs[gridIndex(i, j + 1, cellsX, cellsY)] ?? 0;
      const zd = zs[gridIndex(i + 1, j + 1, cellsX, cellsY)] ?? 0;

      const minX = Math.min(xa, xb, xc, xd);
      const maxX = Math.max(xa, xb, xc, xd);
      const minZ = Math.min(za, zb, zc, zd);
      const maxZ = Math.max(za, zb, zc, zd);
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const hx = Math.max(1e-4, (maxX - minX) / 2);
      const hz = Math.max(1e-4, (maxZ - minZ) / 2);

      writeLinearColor(pixels, j * width + i, color);

      // Same convention as the relief surface: u runs with i, v is flipped.
      const uv: Vec2 = [(i + 0.5) / cellsX, 1 - (j + 0.5) / cellsY];

      for (let level = 1; level <= columnHeight; level++) {
        emitBox(
          buffers,
          cx,
          baseY + (level - 1) * stepY + halfY,
          cz,
          hx,
          halfY,
          hz,
          color,
          {
            px: neighbourPx < level,
            nx: neighbourNx < level,
            pz: neighbourPz < level,
            nz: neighbourNz < level,
            // Only the top of the stack and the bottom of the model close it;
            // the faces between one cube and the next are interior.
            py: level === columnHeight,
            ny: level === 1,
          },
          uv,
        );
      }
    }
  }

  return buffers.toPayload({
    mode: 'voxel',
    gridWidth: cellsX,
    gridHeight: cellsY,
    // Each column is a closed stack of boxes and neighbouring columns share a
    // boundary only where their heights differ, so the union is watertight.
    watertight: true,
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
 * Emits the visible faces of one box.
 *
 * Every corner of every face shares a single UV, so a cube takes the flat colour
 * of the source pixel it stands on — the pixel-art look people expect from a
 * voxel build, and the reason the faces must not be UV-mapped individually (that
 * would smear the image across each cube).
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
  uv: Vec2,
): void {
  const corners: readonly Vec2[] = [uv, uv, uv, uv];

  if (faces.px) {
    buffers.flatQuad(
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz + hz],
      color,
      corners,
    );
  }
  if (faces.nx) {
    buffers.flatQuad(
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz - hz],
      color,
      corners,
    );
  }
  if (faces.py) {
    buffers.flatQuad(
      [cx - hx, cy + hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx + hx, cy + hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      color,
      corners,
    );
  }
  if (faces.ny) {
    buffers.flatQuad(
      [cx - hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz + hz],
      [cx - hx, cy - hy, cz + hz],
      color,
      corners,
    );
  }
  if (faces.pz) {
    buffers.flatQuad(
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      color,
      corners,
    );
  }
  if (faces.nz) {
    buffers.flatQuad(
      [cx + hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      color,
      corners,
    );
  }
}

// ---------------------------------------------------------------------------
// Point cloud
// ---------------------------------------------------------------------------

function buildPoints(context: BuildContext): MeshPayload {
  const { field, pixels, width, settings, xs, zs, cellsX, cellsY } = context;
  const buffers = new MeshBuffers();
  const color: number[] = [0, 0, 0];
  const stride = Math.max(1, Math.round(settings.pointStride));

  for (let j = 0; j <= cellsY; j += stride) {
    for (let i = 0; i <= cellsX; i += stride) {
      const index = j * width + i;
      writeLinearColor(pixels, index, color);
      buffers.point(xs[index] ?? 0, (field[index] ?? 0) * settings.depth, zs[index] ?? 0, color);
    }
  }

  return buffers.toPayload({
    mode: 'points',
    gridWidth: cellsX,
    gridHeight: cellsY,
    watertight: false,
  });
}
