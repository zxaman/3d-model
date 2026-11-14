/**
 * Image analysis: turning pixels into a height field.
 *
 * Everything here is pure and allocation-conscious — it runs inside a web worker
 * over buffers of up to ~500 × 500 samples, several times per slider drag.
 *
 * Pipeline:
 *   1. `extractHeightField`  — RGBA → scalar field (luma or alpha), 0…1
 *   2. `boxBlur`             — separable, O(n) sliding window; kills noise
 *   3. `unsharpMask`         — puts high-frequency detail back after the blur
 *   4. `normalizeField`      — stretch to the full 0…1 range
 *   5. `applyGamma`          — contrast curve
 */

export type DepthSource = 'luminance' | 'alpha';

export function extractHeightField(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  source: DepthSource,
  invert: boolean,
): Float32Array {
  const data = new Float32Array(width * height);

  for (let i = 0; i < data.length; i++) {
    const offset = i * 4;
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    const a = pixels[offset + 3] ?? 255;

    const value = source === 'alpha' ? a / 255 : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    data[i] = invert ? 1 - value : value;
  }

  return data;
}

/**
 * Separable box blur with clamped edges. Two passes approximate a Gaussian well
 * enough for height fields while staying strictly O(n) in the number of samples.
 */
export function boxBlur(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes = 2,
): Float32Array {
  const effectiveRadius = Math.max(0, Math.round(radius));
  if (effectiveRadius === 0) {
    return source.slice();
  }

  let current = source;
  for (let pass = 0; pass < passes; pass++) {
    current = blurAxis(current, width, height, effectiveRadius, true);
    current = blurAxis(current, width, height, effectiveRadius, false);
  }

  return current;
}

function blurAxis(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Float32Array {
  const out = new Float32Array(source.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const window = radius * 2 + 1;

  for (let o = 0; o < outer; o++) {
    let sum = 0;

    // Seed the window with clamped samples so borders stay stable.
    for (let k = -radius; k <= radius; k++) {
      const index = Math.min(Math.max(k, 0), inner - 1);
      sum += source[horizontal ? o * inner + index : index * inner + o] ?? 0;
    }

    for (let i = 0; i < inner; i++) {
      if (horizontal) {
        out[o * inner + i] = sum / window;
        const leaving = Math.min(Math.max(i - radius, 0), inner - 1);
        const entering = Math.min(Math.max(i + radius + 1, 0), inner - 1);
        sum += (source[o * inner + entering] ?? 0) - (source[o * inner + leaving] ?? 0);
      } else {
        out[i * inner + o] = sum / window;
        const leaving = Math.min(Math.max(i - radius, 0), inner - 1);
        const entering = Math.min(Math.max(i + radius + 1, 0), inner - 1);
        sum += (source[entering * inner + o] ?? 0) - (source[leaving * inner + o] ?? 0);
      }
    }
  }

  return out;
}

/** `base + (base - blurred) * amount` — classic unsharp mask. */
export function unsharpMask(
  base: Float32Array,
  blurred: Float32Array,
  amount: number,
): Float32Array {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) {
    const original = base[i] ?? 0;
    const smooth = blurred[i] ?? 0;
    out[i] = original + (original - smooth) * amount;
  }
  return out;
}

/**
 * Stretches the field to a full 0…1 range.
 *
 * A flat field keeps its level rather than collapsing to zero: a solid-grey
 * logo has no internal contrast, but it is still a shape worth extruding.
 */
export function normalizeField(source: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < source.length; i++) {
    const value = source[i] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const out = new Float32Array(source.length);
  const span = max - min;

  if (span < 1e-6) {
    const level = Math.min(1, Math.max(0, Number.isFinite(min) ? min : 0));
    return out.fill(level);
  }

  for (let i = 0; i < source.length; i++) {
    out[i] = Math.min(1, Math.max(0, ((source[i] ?? 0) - min) / span));
  }
  return out;
}

export function applyGamma(source: Float32Array, gamma: number): Float32Array {
  if (Math.abs(gamma - 1) < 1e-3) {
    return source;
  }
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) {
    out[i] = Math.pow(Math.min(1, Math.max(0, source[i] ?? 0)), gamma);
  }
  return out;
}

/** Maps a 0…1 field onto discrete stack levels (0 = empty). */
export function quantize(source: Float32Array, levels: number): Int32Array {
  const out = new Int32Array(source.length);
  const maxLevel = Math.max(1, Math.round(levels));
  for (let i = 0; i < source.length; i++) {
    out[i] = Math.round(Math.min(1, Math.max(0, source[i] ?? 0)) * maxLevel);
  }
  return out;
}
