import { estimateComplexity } from './estimate';
import { MODE_PRESETS } from './generation.model';

describe('estimateComplexity', () => {
  it('scales quadratically with resolution for a relief', () => {
    const settings = { ...MODE_PRESETS['relief'], base: false };
    const small = estimateComplexity({ ...settings, resolution: 64 }, 1);
    const large = estimateComplexity({ ...settings, resolution: 128 }, 1);

    expect(large.triangles / small.triangles).toBeCloseTo(4, 1);
  });

  it('follows the image aspect ratio', () => {
    const wide = estimateComplexity({ ...MODE_PRESETS['relief'], resolution: 128 }, 2);
    const tall = estimateComplexity({ ...MODE_PRESETS['relief'], resolution: 128 }, 0.5);

    expect(wide.triangles).toBe(tall.triangles);
  });

  it('adds walls and a cap when a base is requested', () => {
    const open = estimateComplexity({ ...MODE_PRESETS['relief'], base: false }, 1);
    const closed = estimateComplexity({ ...MODE_PRESETS['relief'], base: true }, 1);

    expect(closed.triangles).toBeGreaterThan(open.triangles);
  });

  it('produces no triangles for a point cloud but counts its samples', () => {
    const estimate = estimateComplexity({ ...MODE_PRESETS['points'], pointStride: 2 }, 1);

    expect(estimate.triangles).toBe(0);
    expect(estimate.vertices).toBeGreaterThan(0);
  });

  it('flags heavy models so the UI can warn up front', () => {
    const light = estimateComplexity({ ...MODE_PRESETS['relief'], resolution: 64 }, 1);
    const heavy = estimateComplexity({ ...MODE_PRESETS['relief'], resolution: 512 }, 1);

    expect(light.heavy).toBe(false);
    expect(heavy.heavy).toBe(true);
  });

  it('stays finite for a degenerate aspect ratio', () => {
    const estimate = estimateComplexity(MODE_PRESETS['voxel'], 0);

    expect(Number.isFinite(estimate.vertices)).toBe(true);
    expect(estimate.vertices).toBeGreaterThanOrEqual(0);
  });
});
