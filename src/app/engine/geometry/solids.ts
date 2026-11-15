import { MeshBuffers } from './buffers';

/**
 * Closed-solid helpers.
 *
 * Everything here exists for one reason: a model that goes to a slicer has to
 * be a **watertight, manifold** shell. Open surfaces produce undefined
 * interiors, and duplicated seam vertices make a mesh that *looks* closed fail
 * a real manifoldness test.
 *
 * The rule these builders follow is that adjacent parts share vertex indices
 * rather than merely sharing positions, so every edge ends up with exactly two
 * incident triangles.
 */

/**
 * Closes a height-field surface into a solid.
 *
 * The surface must have been emitted as a full `(cellsX + 1) × (cellsY + 1)`
 * grid, so the vertex at column `i`, row `j` is exactly `j * width + i`. The
 * skirt reuses those indices for its top edge instead of emitting its own —
 * which is the whole point: the seam becomes a shared edge, not two coincident
 * ones.
 *
 * The bottom is a triangle fan from the centre to a single shared perimeter
 * ring, so there are no T-junctions where a coarse cap would meet a fine skirt.
 */
export function addSealedBase(buffers: MeshBuffers, context: SealContext): void {
  const { pixels, width, cellsX, cellsY, planeWidth, planeDepth, baseY } = context;
  const color: number[] = [0, 0, 0];

  const xAt = (i: number): number => (i / cellsX - 0.5) * planeWidth;
  const zAt = (j: number): number => (j / cellsY - 0.5) * planeDepth;
  const uAt = (i: number): number => i / cellsX;
  const vAt = (j: number): number => 1 - j / cellsY;

  /**
   * Perimeter as `(i, j)` pairs, walked counter-clockwise in the XZ plane.
   * That single consistent direction is what lets one winding rule produce
   * outward normals on all four sides.
   */
  const perimeter: [number, number][] = [];
  for (let i = 0; i <= cellsX; i++) perimeter.push([i, 0]);
  for (let j = 1; j <= cellsY; j++) perimeter.push([cellsX, j]);
  for (let i = cellsX - 1; i >= 0; i--) perimeter.push([i, cellsY]);
  for (let j = cellsY - 1; j >= 1; j--) perimeter.push([0, j]);

  const bottom: number[] = [];
  for (const [i, j] of perimeter) {
    bottom.push(
      buffers.vertex(
        [xAt(i), baseY, zAt(j)],
        [uAt(i), vAt(j)],
        readColor(pixels, j * width + i, color),
      ),
    );
  }

  // Walls: (topA, topB, bottomB, bottomA) — outward for a CCW perimeter walk.
  for (let k = 0; k < perimeter.length; k++) {
    const [ai, aj] = perimeter[k];
    const [bi, bj] = perimeter[(k + 1) % perimeter.length];
    buffers.quad(
      aj * width + ai,
      bj * width + bi,
      bottom[(k + 1) % perimeter.length] ?? 0,
      bottom[k] ?? 0,
    );
  }

  // Bottom: fan from the centre, wound so the normal points −Y.
  const centre = buffers.vertex([0, baseY, 0], [0.5, 0.5], readColor(pixels, 0, color));
  for (let k = 0; k < perimeter.length; k++) {
    buffers.triangle(centre, bottom[k] ?? 0, bottom[(k + 1) % perimeter.length] ?? 0);
  }
}

export interface SealContext {
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly cellsX: number;
  readonly cellsY: number;
  readonly planeWidth: number;
  readonly planeDepth: number;
  readonly baseY: number;
}

/**
 * A flat hanging tab with a round hole — the loop on a keychain.
 *
 * Built as a closed prism between an outer rounded-rectangle outline and an
 * inner circle, so it is watertight on its own: four bands of quads (top and
 * bottom rings, outer and inner walls) and nothing else.
 */
export function addHangerTab(buffers: MeshBuffers, options: HangerOptions): void {
  const {
    centreX,
    zOuter,
    zInner,
    halfWidth,
    yBottom,
    yTop,
    holeRadius,
    color,
    segments = 40,
  } = options;

  // `zOuter` sits beyond `zInner` by construction, so the span is measured as a
  // length; the tab is then centred on it and the two ends are interchangeable.
  const outer: [number, number][] = roundedRect(halfWidth, Math.abs(zOuter - zInner) / 2, segments);
  const inner: [number, number][] = circle(holeRadius, segments);

  const centreZ = (zOuter + zInner) / 2;

  const outerTop: number[] = [];
  const outerBottom: number[] = [];
  const innerTop: number[] = [];
  const innerBottom: number[] = [];

  const uv: [number, number] = [0.5, 0.5];

  for (const [x, z] of outer) {
    outerTop.push(buffers.vertex([centreX + x, yTop, centreZ + z], uv, color));
    outerBottom.push(buffers.vertex([centreX + x, yBottom, centreZ + z], uv, color));
  }
  for (const [x, z] of inner) {
    innerTop.push(buffers.vertex([centreX + x, yTop, centreZ + z], uv, color));
    innerBottom.push(buffers.vertex([centreX + x, yBottom, centreZ + z], uv, color));
  }

  const count = outer.length;
  for (let k = 0; k < count; k++) {
    const next = (k + 1) % count;
    const a = outerTop[k] ?? 0;
    const b = outerTop[next] ?? 0;
    const c = innerTop[next] ?? 0;
    const d = innerTop[k] ?? 0;
    const ab = outerBottom[k] ?? 0;
    const bb = outerBottom[next] ?? 0;
    const cb = innerBottom[next] ?? 0;
    const db = innerBottom[k] ?? 0;

    // Top ring (+Y) and bottom ring (−Y).
    buffers.quad(a, b, c, d);
    buffers.quad(ab, db, cb, bb);

    // Outer wall (faces away from the tab) and inner wall (lines the hole).
    buffers.quad(ab, bb, b, a);
    buffers.quad(db, cb, c, d);
  }
}

export interface HangerOptions {
  readonly centreX: number;
  /** Far edge of the tab, in Z (the direction it sticks out). */
  readonly zOuter: number;
  /** Edge where the tab meets the model. */
  readonly zInner: number;
  readonly halfWidth: number;
  readonly yBottom: number;
  readonly yTop: number;
  readonly holeRadius: number;
  readonly color: number[];
  readonly segments?: number;
}

/** Rounded rectangle, counter-clockwise, `segments` points around the outline. */
function roundedRect(halfWidth: number, halfDepth: number, segments: number): [number, number][] {
  const radius = Math.min(halfWidth, halfDepth) * 0.45;
  const straightX = halfWidth - radius;
  const straightZ = halfDepth - radius;
  const points: [number, number][] = [];
  const perCorner = Math.max(2, Math.floor(segments / 4));

  const corners: [number, number, number][] = [
    [straightX, straightZ, 0],
    [-straightX, straightZ, Math.PI / 2],
    [-straightX, -straightZ, Math.PI],
    [straightX, -straightZ, (3 * Math.PI) / 2],
  ];

  for (const [cx, cz, start] of corners) {
    for (let s = 0; s < perCorner; s++) {
      const angle = start + (s / perCorner) * (Math.PI / 2);
      points.push([cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius]);
    }
  }

  return points;
}

/** Circle, counter-clockwise. */
function circle(radius: number, segments: number): [number, number][] {
  const points: [number, number][] = [];
  for (let k = 0; k < segments; k++) {
    const angle = (k / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

/** Reads a pixel colour into `target`, returning it for convenience. */
function readColor(pixels: Uint8ClampedArray, index: number, target: number[]): number[] {
  const offset = index * 4;
  target[0] = (pixels[offset] ?? 0) / 255;
  target[1] = (pixels[offset + 1] ?? 0) / 255;
  target[2] = (pixels[offset + 2] ?? 0) / 255;
  return target;
}
