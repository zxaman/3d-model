import {
  applyGamma,
  boxBlur,
  extractHeightField,
  normalizeField,
  quantize,
  unsharpMask,
} from './depth-field';

/** 2 × 2 RGBA buffer: white, black, mid grey, 50 % alpha. */
function fixturePixels(): Uint8ClampedArray {
  return new Uint8ClampedArray([
    255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255, 10, 20, 30, 128,
  ]);
}

describe('depth-field', () => {
  describe('extractHeightField', () => {
    it('reads Rec. 709 luma by default', () => {
      const field = extractHeightField(fixturePixels(), 2, 2, 'luminance', false);

      expect(field[0]).toBeCloseTo(1, 5);
      expect(field[1]).toBeCloseTo(0, 5);
      expect(field[2]).toBeCloseTo(128 / 255, 5);
      expect(field[3]).toBeCloseTo((0.2126 * 10 + 0.7152 * 20 + 0.0722 * 30) / 255, 5);
    });

    it('reads the alpha channel when asked', () => {
      const field = extractHeightField(fixturePixels(), 2, 2, 'alpha', false);

      expect(field[0]).toBeCloseTo(1, 5);
      expect(field[3]).toBeCloseTo(128 / 255, 5);
    });

    it('inverts when requested', () => {
      const field = extractHeightField(fixturePixels(), 2, 2, 'luminance', true);

      expect(field[0]).toBeCloseTo(0, 5);
      expect(field[1]).toBeCloseTo(1, 5);
    });
  });

  describe('boxBlur', () => {
    it('returns a copy when the radius is zero', () => {
      const source = new Float32Array([0, 1, 0, 1]);
      const result = boxBlur(source, 2, 2, 0);

      expect(result).toEqual(source);
      expect(result).not.toBe(source);
    });

    it('averages a spike towards its neighbourhood', () => {
      const source = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 0]);
      const blurred = boxBlur(source, 3, 3, 1, 1);

      // The spike is softened and its neighbours lifted; the total stays the same.
      expect(blurred[4]!).toBeLessThan(1);
      expect(blurred[1]!).toBeGreaterThan(0);
      expect(sum(blurred)).toBeCloseTo(1, 4);
    });

    it('flattens a constant field without changing its value', () => {
      const source = new Float32Array(16).fill(0.4);
      const blurred = boxBlur(source, 4, 4, 3, 2);

      for (const value of blurred) {
        expect(value).toBeCloseTo(0.4, 5);
      }
    });

    it('preserves the buffer length', () => {
      const source = new Float32Array(64).fill(0.5);
      expect(boxBlur(source, 8, 8, 2, 2).length).toBe(64);
    });
  });

  describe('unsharpMask', () => {
    it('pushes a blurred field back towards the original', () => {
      const original = new Float32Array([0, 1, 0]);
      const blurred = new Float32Array([0.5, 0.5, 0.5]);
      const sharpened = unsharpMask(original, blurred, 1);

      expect(sharpened[0]).toBeCloseTo(-0.5, 5);
      expect(sharpened[1]).toBeCloseTo(1.5, 5);
      expect(sharpened[2]).toBeCloseTo(-0.5, 5);
    });
  });

  describe('normalizeField', () => {
    it('stretches to the full 0…1 range', () => {
      const field = normalizeField(new Float32Array([2, 4, 6]));

      expect(field[0]).toBeCloseTo(0, 5);
      expect(field[1]).toBeCloseTo(0.5, 5);
      expect(field[2]).toBeCloseTo(1, 5);
    });

    it('keeps the level of a flat field instead of dividing by zero', () => {
      const field = normalizeField(new Float32Array([0.7, 0.7, 0.7]));

      for (const value of field) {
        expect(value).toBeCloseTo(0.7, 5);
      }
    });

    it('leaves an empty field empty', () => {
      const field = normalizeField(new Float32Array([0, 0, 0]));

      for (const value of field) {
        expect(value).toBe(0);
      }
    });
  });

  describe('applyGamma', () => {
    it('is a no-op at 1', () => {
      const source = new Float32Array([0.25, 0.5, 0.75]);
      expect(applyGamma(source, 1)).toBe(source);
    });

    it('brightens midtones below 1 and darkens them above', () => {
      expect(applyGamma(new Float32Array([0.5]), 0.5)[0]).toBeGreaterThan(0.5);
      expect(applyGamma(new Float32Array([0.5]), 2)[0]).toBeLessThan(0.5);
    });
  });

  describe('quantize', () => {
    it('maps onto integer levels', () => {
      const levels = quantize(new Float32Array([0, 0.25, 0.49, 0.51, 1]), 4);

      expect(Array.from(levels)).toEqual([0, 1, 2, 2, 4]);
    });

    it('never returns fewer than one level', () => {
      expect(quantize(new Float32Array([1]), 0)[0]).toBe(1);
    });
  });
});

function sum(values: Float32Array): number {
  return values.reduce((total, value) => total + value, 0);
}
