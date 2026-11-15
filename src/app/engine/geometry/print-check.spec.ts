import { generateMesh, type BuilderSettings } from './builders';
import { checkPrintability } from './print-check';

const BASE: BuilderSettings = {
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
  base: true,
  baseThickness: 2,
  voxelLayers: 8,
  pointStride: 1,
};

/** Smooth ramp along X — gentle slopes, no overhangs. */
function rampPixels(size: number): Uint8ClampedArray {
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

/** Hard black/white alternation — the steepest slope a grid can hold. */
function stripePixels(size: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const value = x % 2 === 0 ? 0 : 255;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function build(
  settings: Partial<BuilderSettings>,
  size = 24,
  pixels = rampPixels(size),
): ReturnType<typeof generateMesh> {
  return generateMesh({ pixels, width: size, height: size, settings: { ...BASE, ...settings } });
}

function check(settings: Partial<BuilderSettings>, size = 24, pixels = rampPixels(size)) {
  const payload = build(settings, size, pixels);
  const merged = { ...BASE, ...settings };
  return checkPrintability(payload, {
    mode: merged.mode,
    printPreset: merged.printPreset,
    baseThickness: merged.baseThickness,
    base: merged.base,
  });
}

describe('print-check', () => {
  it('reports the model in millimetres', () => {
    const report = check({ widthMm: 120 });

    expect(report.size.x).toBeCloseTo(120, 1);
    expect(report.size.z).toBeCloseTo(120, 1);
    expect(report.headline).toContain('mm');
  });

  it('passes a closed relief with no findings', () => {
    const report = check({ mode: 'relief', base: true });

    expect(report.openEdges).toBe(0);
    expect(report.status).toBe('ready');
    expect(report.issues).toEqual([]);
  });

  it('blocks an open shell', () => {
    const report = check({ mode: 'relief', base: false });

    expect(report.openEdges).toBeGreaterThan(0);
    expect(report.status).toBe('blocked');
    expect(report.issues[0]?.title).toContain('open edge');
  });

  it('blocks a point cloud outright', () => {
    const report = check({ mode: 'points', base: false });

    expect(report.status).toBe('blocked');
    expect(report.issues[0]?.id).toBe('points');
  });

  it('accepts extruded and voxel solids', () => {
    for (const mode of ['extrude', 'voxel'] as const) {
      const report = check({ mode, threshold: 0.1 });
      expect(report.openEdges).toBe(0);
      expect(report.status).not.toBe('blocked');
    }
  });

  it('flags a backing slab thinner than two nozzle widths', () => {
    const report = check({ baseThickness: 0.4 });

    expect(report.issues.some((issue) => issue.id === 'thin-wall')).toBe(true);
  });

  it('lets a lithophane be thinner than a normal slab', () => {
    // Light has to pass through, so the usual minimum would be wrong advice.
    const report = check({ printPreset: 'lithophane', baseThickness: 0.6, depth: 2.5 });

    expect(report.issues.some((issue) => issue.id === 'thin-wall')).toBe(false);
  });

  it('warns when a model will not fit a printer bed', () => {
    const report = check({ widthMm: 300 });

    expect(report.issues.some((issue) => issue.id === 'oversize')).toBe(true);
  });

  it('measures steep slopes on a cliff but not on a gentle ramp', () => {
    const gentle = check({ depth: 8 }, 24, rampPixels(24));
    const steep = check({ depth: 40 }, 24, stripePixels(24));

    expect(gentle.steepRatio).toBeLessThan(0.1);
    expect(steep.steepRatio).toBeGreaterThan(0.1);
    expect(steep.issues.some((issue) => issue.id === 'steep-slope')).toBe(true);
  });

  it('keeps every preset watertight', () => {
    for (const printPreset of ['keychain', 'coin', 'plaque', 'lithophane'] as const) {
      const report = check({ printPreset });
      expect(report.openEdges).toBe(0);
      expect(report.status).not.toBe('blocked');
    }
  });
});
