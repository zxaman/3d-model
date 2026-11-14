import type { Bounds, MeshPayload, MeshStats } from './mesh-payload';
import type { GenerationMode } from '../model';

/**
 * Growable typed-array buffers.
 *
 * Geometry sizes vary by orders of magnitude between modes (a point cloud has no
 * indices, an extruded logo has three times the triangles of its grid), so the
 * buffers start small and double on demand instead of being pre-sized.
 */

export class FloatAttribute {
  #data: Float32Array;
  #count = 0;

  constructor(
    readonly stride: number,
    capacity = 1024,
  ) {
    this.#data = new Float32Array(Math.max(1, capacity) * stride);
  }

  get count(): number {
    return this.#count;
  }

  get capacity(): number {
    return this.#data.length / this.stride;
  }

  /** Backing store for hot read loops. May be larger than `count * stride`. */
  get raw(): Float32Array {
    return this.#data;
  }

  push(row: ArrayLike<number>): number {
    if (this.#count === this.capacity) {
      this.#grow();
    }
    const offset = this.#count * this.stride;
    for (let i = 0; i < this.stride; i++) {
      this.#data[offset + i] = row[i] ?? 0;
    }
    return this.#count++;
  }

  reset(): void {
    this.#count = 0;
  }

  /** Exact-size copy, safe to transfer to another thread. */
  toArray(): Float32Array {
    return this.#data.slice(0, this.#count * this.stride);
  }

  #grow(): void {
    const grown = new Float32Array(this.#data.length * 2);
    grown.set(this.#data);
    this.#data = grown;
  }
}

export class IndexAttribute {
  #data: Uint32Array;
  #count = 0;

  constructor(capacity = 1024) {
    this.#data = new Uint32Array(Math.max(1, capacity));
  }

  get count(): number {
    return this.#count;
  }

  push3(a: number, b: number, c: number): void {
    if (this.#count + 3 > this.#data.length) {
      this.#grow();
    }
    this.#data[this.#count++] = a;
    this.#data[this.#count++] = b;
    this.#data[this.#count++] = c;
  }

  pushQuad(a: number, b: number, c: number, d: number): void {
    this.push3(a, b, c);
    this.push3(a, c, d);
  }

  reset(): void {
    this.#count = 0;
  }

  toArray(): Uint32Array {
    return this.#data.slice(0, this.#count);
  }

  at(index: number): number {
    return this.#data[index] ?? 0;
  }

  #grow(): void {
    const grown = new Uint32Array(this.#data.length * 2);
    grown.set(this.#data);
    this.#data = grown;
  }
}

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

export interface PayloadMeta {
  readonly mode: GenerationMode;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly watertight: boolean;
}

/**
 * Accumulates vertices for exactly one mesh, then freezes them into a
 * {@link MeshPayload}. Supports both indexed (smooth) and non-indexed (flat)
 * construction — the caller picks per mode.
 */
export class MeshBuffers {
  readonly positions = new FloatAttribute(3, 4096);
  readonly normals = new FloatAttribute(3, 4096);
  readonly colors = new FloatAttribute(3, 4096);
  readonly uvs = new FloatAttribute(2, 4096);
  readonly indices = new IndexAttribute(8192);

  private readonly scratch: number[] = [0, 0, 0];
  private readonly normalScratch: number[] = [0, 0, 0];

  /**
   * Indexed vertex; normals are resolved later by {@link computeSmoothNormals}.
   * Arrays are copied on push, so callers may reuse scratch buffers.
   */
  vertex(position: ArrayLike<number>, uv: ArrayLike<number>, color: ArrayLike<number>): number {
    const index = this.positions.push(position);
    this.uvs.push(uv);
    this.colors.push(color);
    return index;
  }

  /** Position + colour only (point clouds). */
  point(x: number, y: number, z: number, color: ArrayLike<number>): void {
    this.scratch[0] = x;
    this.scratch[1] = y;
    this.scratch[2] = z;
    this.positions.push(this.scratch);
    this.colors.push(color);
  }

  /**
   * Non-indexed triangle with a face normal — gives crisp flat shading that
   * survives export (glTF has no `flatShading` material flag).
   */
  flatTriangle(
    a: ArrayLike<number>,
    b: ArrayLike<number>,
    c: ArrayLike<number>,
    color: ArrayLike<number>,
    uv?: readonly ArrayLike<number>[],
  ): void {
    this.scratch[0] = a[0] ?? 0;
    this.scratch[1] = a[1] ?? 0;
    this.scratch[2] = a[2] ?? 0;
    const bx = b[0] ?? 0;
    const by = b[1] ?? 0;
    const bz = b[2] ?? 0;
    const cx = c[0] ?? 0;
    const cy = c[1] ?? 0;
    const cz = c[2] ?? 0;

    const normal = faceNormal(
      [this.scratch[0], this.scratch[1], this.scratch[2]],
      [bx, by, bz],
      [cx, cy, cz],
    );
    this.normalScratch[0] = normal[0];
    this.normalScratch[1] = normal[1];
    this.normalScratch[2] = normal[2];

    this.positions.push(this.scratch);
    this.normals.push(this.normalScratch);
    this.colors.push(color);
    this.uvs.push(uv?.[0] ?? ZERO_UV);

    this.scratch[0] = bx;
    this.scratch[1] = by;
    this.scratch[2] = bz;
    this.positions.push(this.scratch);
    this.normals.push(this.normalScratch);
    this.colors.push(color);
    this.uvs.push(uv?.[1] ?? ZERO_UV);

    this.scratch[0] = cx;
    this.scratch[1] = cy;
    this.scratch[2] = cz;
    this.positions.push(this.scratch);
    this.normals.push(this.normalScratch);
    this.colors.push(color);
    this.uvs.push(uv?.[2] ?? ZERO_UV);
  }

  /** Emits a quad as two non-indexed triangles with a shared face normal. */
  flatQuad(
    a: ArrayLike<number>,
    b: ArrayLike<number>,
    c: ArrayLike<number>,
    d: ArrayLike<number>,
    color: ArrayLike<number>,
    uv?: readonly ArrayLike<number>[],
  ): void {
    const uvA = uv?.[0];
    const uvB = uv?.[1];
    const uvC = uv?.[2];
    const uvD = uv?.[3];

    this.flatTriangle(
      a,
      b,
      c,
      color,
      uv ? [uvA ?? ZERO_UV, uvB ?? ZERO_UV, uvC ?? ZERO_UV] : undefined,
    );
    this.flatTriangle(
      a,
      c,
      d,
      color,
      uv ? [uvA ?? ZERO_UV, uvC ?? ZERO_UV, uvD ?? ZERO_UV] : undefined,
    );
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push3(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.pushQuad(a, b, c, d);
  }

  /**
   * Area-weighted vertex normals for indexed geometry. Falls back to +Y for
   * degenerate (zero-area) vertices so shading never produces NaN.
   */
  computeSmoothNormals(): void {
    const positions = this.positions.raw;
    const indices = this.indices;
    const vertexCount = this.positions.count;
    const normals = new Float32Array(vertexCount * 3);

    for (let i = 0; i < indices.count; i += 3) {
      const ia = indices.at(i) * 3;
      const ib = indices.at(i + 1) * 3;
      const ic = indices.at(i + 2) * 3;
      accumulateFaceNormal(normals, positions, ia, ib, ic);
    }

    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 3;
      const x = normals[offset] ?? 0;
      const y = normals[offset + 1] ?? 0;
      const z = normals[offset + 2] ?? 0;
      const length = Math.hypot(x, y, z);

      if (length > 1e-8) {
        normals[offset] = x / length;
        normals[offset + 1] = y / length;
        normals[offset + 2] = z / length;
      } else {
        normals[offset] = 0;
        normals[offset + 1] = 1;
        normals[offset + 2] = 0;
      }
    }

    this.normals.reset();
    const row: number[] = [0, 0, 0];
    for (let i = 0; i < vertexCount; i++) {
      row[0] = normals[i * 3] ?? 0;
      row[1] = normals[i * 3 + 1] ?? 0;
      row[2] = normals[i * 3 + 2] ?? 0;
      this.normals.push(row);
    }
  }

  toPayload(meta: PayloadMeta): MeshPayload {
    const positions = this.positions.toArray();
    const stats: MeshStats = {
      vertices: this.positions.count,
      triangles: Math.floor(this.indices.count / 3),
      gridWidth: meta.gridWidth,
      gridHeight: meta.gridHeight,
    };

    const vertices = this.positions.count;
    const triangles =
      meta.mode === 'points'
        ? 0
        : this.indices.count > 0
          ? Math.floor(this.indices.count / 3)
          : Math.floor(vertices / 3);

    return {
      mode: meta.mode,
      positions,
      // Attributes are only exposed when they line up with every vertex —
      // a partial buffer would render as garbage in three.js.
      normals: this.normals.count === vertices ? this.normals.toArray() : null,
      colors: this.colors.count === vertices ? this.colors.toArray() : null,
      uvs: this.uvs.count === vertices ? this.uvs.toArray() : null,
      indices: this.indices.count > 0 ? this.indices.toArray() : null,
      stats: { ...stats, vertices, triangles },
      bounds: computeBounds(positions),
      watertight: meta.watertight,
    };
  }
}

const ZERO_UV: Vec2 = [0, 0];

export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];

  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);

  if (length < 1e-12) {
    return [0, 1, 0];
  }
  return [nx / length, ny / length, nz / length];
}

function accumulateFaceNormal(
  target: Float32Array,
  positions: Float32Array,
  ia: number,
  ib: number,
  ic: number,
): void {
  // Normals are accumulated un-normalised, which makes the result area-weighted:
  // big triangles influence their vertices more than slivers do.
  const ax = positions[ia] ?? 0;
  const ay = positions[ia + 1] ?? 0;
  const az = positions[ia + 2] ?? 0;
  const bx = positions[ib] ?? 0;
  const by = positions[ib + 1] ?? 0;
  const bz = positions[ib + 2] ?? 0;
  const cx = positions[ic] ?? 0;
  const cy = positions[ic + 1] ?? 0;
  const cz = positions[ic + 2] ?? 0;

  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

  target[ia] = (target[ia] ?? 0) + nx;
  target[ia + 1] = (target[ia + 1] ?? 0) + ny;
  target[ia + 2] = (target[ia + 2] ?? 0) + nz;

  target[ib] = (target[ib] ?? 0) + nx;
  target[ib + 1] = (target[ib + 1] ?? 0) + ny;
  target[ib + 2] = (target[ib + 2] ?? 0) + nz;

  target[ic] = (target[ic] ?? 0) + nx;
  target[ic + 1] = (target[ic + 1] ?? 0) + ny;
  target[ic + 2] = (target[ic + 2] ?? 0) + nz;
}

export function computeBounds(positions: Float32Array): Bounds {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
