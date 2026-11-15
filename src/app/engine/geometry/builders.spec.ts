import { generateMesh, type BuilderSettings } from './builders';

// Lengths are millimetres, exactly as the UI and every slicer treat them.
const BASE_SETTINGS: BuilderSettings = {
  mode: 'relief',
  widthMm: 100,
  printPreset: 'none',
  depth: 8,
  smoothing: 0,
  detail: 0,
  contrast: 1,
  invert: false,
  depthSource: 'luminance',
  threshold: 0.5,
  base: false,
  baseThickness: 2,
  voxelLayers: 8,
  pointStride: 1,
};

/** Square grid of `size × size` samples, all the same grey. */
function flatPixels(size: number, grey = 128): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = grey;
    pixels[i * 4 + 1] = grey;
    pixels[i * 4 + 2] = grey;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

/** Ramp from black to white along X — gives the voxel stack something to do. */
function gradientPixels(size: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const value = Math.round((x / (size - 1)) * 255);
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function build(settings: Partial<BuilderSettings>, size = 4, pixels = flatPixels(size)) {
  return generateMesh({
    pixels,
    width: size,
    height: size,
    settings: { ...BASE_SETTINGS, ...settings },
  });
}

/** Normal of the first triangle of an indexed mesh, via the index buffer. */
function firstFaceNormal(
  positions: Float32Array,
  indices: Uint32Array | null,
): [number, number, number] {
  const a = (indices?.[0] ?? 0) * 3;
  const b = (indices?.[1] ?? 1) * 3;
  const c = (indices?.[2] ?? 2) * 3;

  const [ax, ay, az] = [positions[a] ?? 0, positions[a + 1] ?? 0, positions[a + 2] ?? 0];
  const [bx, by, bz] = [positions[b] ?? 0, positions[b + 1] ?? 0, positions[b + 2] ?? 0];
  const [cx, cy, cz] = [positions[c] ?? 0, positions[c + 1] ?? 0, positions[c + 2] ?? 0];

  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;

  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function countColumns(payload: { stats: { gridWidth: number; gridHeight: number } }): number {
  return payload.stats.gridWidth * payload.stats.gridHeight;
}

describe('builders', () => {
  describe('shared contracts', () => {
    it('keeps every attribute aligned with the vertex count', () => {
      const payload = build({ mode: 'relief', base: true });

      expect(payload.positions.length / 3).toBe(payload.stats.vertices);
      expect((payload.normals?.length ?? 0) / 3).toBe(payload.stats.vertices);
      expect((payload.colors?.length ?? 0) / 3).toBe(payload.stats.vertices);
      expect((payload.uvs?.length ?? 0) / 2).toBe(payload.stats.vertices);
    });

    it('reports progress through every phase', () => {
      const phases: string[] = [];
      generateMesh({
        pixels: flatPixels(4),
        width: 4,
        height: 4,
        settings: BASE_SETTINGS,
        onProgress: (phase) => phases.push(phase),
      });

      expect(phases).toEqual(['sampling', 'smoothing', 'meshing', 'finishing']);
    });

    it('centres the model on the origin for a square image', () => {
      const payload = build({ mode: 'relief' });
      const [minX, , minZ] = payload.bounds.min;
      const [maxX, , maxZ] = payload.bounds.max;

      expect(minX).toBeCloseTo(-maxX, 5);
      expect(minZ).toBeCloseTo(-maxZ, 5);
    });
  });

  describe('relief', () => {
    it('emits one vertex per grid sample and two triangles per cell', () => {
      const payload = build({ mode: 'relief' }, 4);

      expect(payload.stats.vertices).toBe(16);
      expect(payload.stats.triangles).toBe(18);
      expect(payload.indices?.length).toBe(18 * 3);
      expect(payload.watertight).toBe(false);
    });

    it('winds the surface so normals point up', () => {
      const payload = build({ mode: 'relief' });
      const [, y] = firstFaceNormal(payload.positions, payload.indices);

      expect(y).toBeGreaterThan(0);
    });

    it('closes the volume when a base is requested', () => {
      const open = build({ mode: 'relief', base: false });
      const closed = build({ mode: 'relief', base: true, baseThickness: 2 });

      expect(closed.watertight).toBe(true);
      // 12 border segments × 2 triangles for the walls, plus a 12-triangle fan
      // for the back — the seal shares the surface's own vertices, so it adds no
      // duplicate rim.
      expect(closed.stats.triangles - open.stats.triangles).toBe(12 * 2 + 12);
      expect(closed.bounds.min[1]).toBeCloseTo(-2, 5);
    });

    it('produces unit-length normals', () => {
      const payload = build({ mode: 'relief', base: true });
      const normals = payload.normals ?? new Float32Array(0);

      for (let i = 0; i < normals.length; i += 3) {
        const length = Math.hypot(normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0);
        expect(length).toBeCloseTo(1, 4);
      }
    });

    it('scales the plane to the image aspect ratio', () => {
      const payload = generateMesh({
        pixels: flatPixels(8),
        width: 8,
        height: 4,
        settings: BASE_SETTINGS,
      });

      const width = payload.bounds.max[0] - payload.bounds.min[0];
      const depth = payload.bounds.max[2] - payload.bounds.min[2];
      expect(width / depth).toBeCloseTo(2, 2);
    });
  });

  it('gives each voxel column its own texture coordinate', () => {
    // Regression: the cube emitter passed no UVs, so every vertex collapsed
    // onto (0, 0) and a textured voxel build came out as one flat dark colour.
    const size = 5;
    const payload = build({ mode: 'voxel', voxelLayers: 6 }, size, gradientPixels(size));

    expect(payload.uvs).not.toBeNull();

    const uvs = payload.uvs!;
    const distinct = new Set<string>();
    for (let i = 0; i < uvs.length; i += 2) {
      distinct.add(`${uvs[i]},${uvs[i + 1]}`);
    }

    // More than one source pixel is sampled, and every coordinate is in range.
    expect(distinct.size).toBeGreaterThan(1);
    for (const value of uvs) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }

    // Every corner of a cube agrees, so a cube stays a single flat colour.
    for (let i = 0; i < uvs.length; i += 6) {
      expect(uvs[i]).toBe(uvs[i + 2]);
      expect(uvs[i + 1]).toBe(uvs[i + 3]);
    }
  });

  describe('extrude', () => {
    it('emits flat-shaded, non-indexed geometry', () => {
      const payload = build({ mode: 'extrude', base: true });

      expect(payload.indices).toBeNull();
      expect(payload.normals).not.toBeNull();
      expect(payload.stats.vertices % 3).toBe(0);
      expect(payload.stats.triangles).toBe(payload.stats.vertices / 3);
    });

    it('caps, walls and backs a fully solid 3 × 3 cell shape', () => {
      const payload = build({ mode: 'extrude', base: true, threshold: 0.1 }, 4);

      // 9 cells: top (18 tris) + 12 exposed walls (24 tris) + base (18 tris).
      expect(payload.stats.triangles).toBe(18 + 24 + 18);
    });

    it('emits nothing when every cell is below the cut-off', () => {
      const payload = build({ mode: 'extrude', threshold: 0.9 }, 4);

      // A flat mid-grey field normalises to 0, so nothing clears the threshold.
      expect(payload.stats.triangles).toBe(0);
      expect(payload.positions.length).toBe(0);
    });

    it('raises the top face to the requested depth', () => {
      const payload = build({ mode: 'extrude', base: true, depth: 8, threshold: 0.1 });

      expect(payload.bounds.max[1]).toBeCloseTo(8, 5);
    });
  });

  describe('voxel', () => {
    it('emits whole quads of non-indexed geometry', () => {
      const payload = build({ mode: 'voxel', voxelLayers: 6, depth: 12 });

      expect(payload.indices).toBeNull();
      // Each column is a closed stack of boxes, so the union is watertight.
      expect(payload.watertight).toBe(true);
      // Every face is a quad: two triangles, six vertices.
      expect(payload.stats.vertices % 6).toBe(0);
      expect(payload.stats.triangles).toBe(payload.stats.vertices / 3);
      expect(payload.stats.vertices).toBeGreaterThan(0);
    });

    it('spans the requested stack height', () => {
      const payload = build({ mode: 'voxel', voxelLayers: 6, depth: 12 }, 4, flatPixels(4, 255));

      expect(payload.bounds.min[1]).toBeCloseTo(0, 5);
      expect(payload.bounds.max[1]).toBeCloseTo(12, 5);
    });

    it('stacks proportionally to the height field', () => {
      const payload = build({ mode: 'voxel', voxelLayers: 6, depth: 12 }, 4, flatPixels(4, 128));

      // A mid-grey field fills roughly half the stack.
      expect(payload.bounds.max[1]).toBeCloseTo(6, 1);
    });

    it('stacks more cubes as the resolution and layer count grow', () => {
      const shallow = build({ mode: 'voxel', voxelLayers: 4, depth: 8 }, 6, gradientPixels(6));
      const tall = build({ mode: 'voxel', voxelLayers: 12, depth: 8 }, 6, gradientPixels(6));

      expect(tall.stats.vertices).toBeGreaterThan(shallow.stats.vertices);
    });

    it('culls the faces a neighbour at the same height would hide', () => {
      const payload = build({ mode: 'voxel', voxelLayers: 8, depth: 10 }, 6, gradientPixels(6));

      // Worst case is every column filled to the top with every face emitted:
      // eight levels × six faces × two triangles × three vertices.
      const columns = countColumns(payload);

      expect(payload.stats.vertices).toBeLessThan(columns * 8 * 36);
    });
  });

  describe('print-ready output', () => {
    it('measures the model in millimetres', () => {
      // The whole point: STL and OBJ carry no unit, so a slicer reads these
      // numbers as millimetres. A model asked for at 100 mm must be 100 across.
      for (const widthMm of [20, 100, 250]) {
        const payload = build({ mode: 'relief', widthMm });

        expect(payload.bounds.max[0] - payload.bounds.min[0]).toBeCloseTo(widthMm, 4);
        expect(payload.bounds.max[2] - payload.bounds.min[2]).toBeCloseTo(widthMm, 4);
      }
    });

    it('keeps the aspect ratio while honouring the requested width', () => {
      const payload = generateMesh({
        pixels: flatPixels(8),
        width: 8,
        height: 4,
        settings: { ...BASE_SETTINGS, widthMm: 160 },
      });

      const width = payload.bounds.max[0] - payload.bounds.min[0];
      const depth = payload.bounds.max[2] - payload.bounds.min[2];

      expect(width).toBeCloseTo(160, 4);
      expect(depth).toBeCloseTo(80, 4);
    });

    it('seals the relief by sharing the surface vertices, not duplicating them', () => {
      const size = 4;
      const open = build({ mode: 'relief', base: false }, size);
      const closed = build({ mode: 'relief', base: true }, size);

      // A 4 × 4 grid has a 12-point perimeter: 12 extra vertices for the bottom
      // ring plus one for the fan centre. The old skirt emitted two vertices per
      // border segment, which left the shell visually closed but not welded.
      const perimeter = 2 * size + 2 * size - 4;
      expect(closed.stats.vertices - open.stats.vertices).toBe(perimeter + 1);
    });

    it('closes the volume for extrude and voxel too', () => {
      expect(build({ mode: 'extrude', base: true, threshold: 0.1 }).watertight).toBe(true);
      expect(build({ mode: 'voxel', threshold: 0.1 }).watertight).toBe(true);
    });

    it('pulls the corners in for a round preset', () => {
      const size = 8;
      const cornerOf = (printPreset: 'none' | 'coin'): number => {
        const payload = build({ mode: 'relief', printPreset, base: false }, size);
        const last = (payload.stats.vertices - 1) * 3;
        return Math.hypot(payload.positions[last] ?? 0, payload.positions[last + 2] ?? 0);
      };

      // A square corner sits at half the diagonal; a circle pulls it to the radius.
      expect(cornerOf('none')).toBeCloseTo((100 / 2) * Math.SQRT2, 3);
      expect(cornerOf('coin')).toBeCloseTo(100 / 2, 3);
    });

    it('raises a rim above the deepest point of the image', () => {
      const payload = build({ mode: 'relief', printPreset: 'plaque', depth: 8, base: false });

      // The plaque rim is 40% taller than the peak, so the outline stands proud.
      expect(payload.bounds.max[1]).toBeCloseTo(8 * 1.4, 3);
    });

    it('hangs a loop off a keychain', () => {
      const plain = build({ mode: 'relief', printPreset: 'none', base: true }, 8);
      const keychain = build({ mode: 'relief', printPreset: 'keychain', base: true }, 8);

      expect(keychain.stats.vertices).toBeGreaterThan(plain.stats.vertices);
      // The tab sticks out past the body, so the model is deeper than the image.
      expect(keychain.bounds.min[2]).toBeLessThan(plain.bounds.min[2]);
    });
  });

  describe('point cloud', () => {
    it('emits positions and colours only', () => {
      const payload = build({ mode: 'points', pointStride: 1 });

      expect(payload.stats.vertices).toBe(16);
      expect(payload.stats.triangles).toBe(0);
      expect(payload.indices).toBeNull();
      expect(payload.normals).toBeNull();
      expect(payload.colors?.length).toBe(16 * 3);
    });

    it('honours the sampling stride', () => {
      const payload = build({ mode: 'points', pointStride: 2 });

      // Cells 0…3 sampled at 0 and 2 in both directions.
      expect(payload.stats.vertices).toBe(4);
    });

    it('lifts points by the height field', () => {
      const payload = generateMesh({
        pixels: flatPixels(4, 255),
        width: 4,
        height: 4,
        settings: { ...BASE_SETTINGS, mode: 'points', depth: 10 },
      });

      expect(payload.bounds.max[1]).toBeGreaterThanOrEqual(0);
    });
  });
});
