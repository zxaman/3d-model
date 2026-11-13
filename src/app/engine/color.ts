/**
 * Colour maths for the engine.
 *
 * Vertex colours are written in **linear** space: that is what three.js expects
 * for `MeshStandardMaterial` and what the glTF / PLY exporters emit, so the
 * conversion happens once, here, on the worker thread.
 */

const TABLE_SIZE = 1024;
const srgbToLinearTable = new Float32Array(TABLE_SIZE + 1);

for (let i = 0; i <= TABLE_SIZE; i++) {
  const c = i / TABLE_SIZE;
  srgbToLinearTable[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB → linear for a single channel (0–1 in, 0–1 out). */
export function srgbToLinear(channel: number): number {
  const clamped = channel < 0 ? 0 : channel > 1 ? 1 : channel;
  return srgbToLinearTable[Math.round(clamped * TABLE_SIZE)] ?? clamped;
}

/** sRGB byte (0–255) → linear-light float. */
export function byteToLinear(byte: number): number {
  return srgbToLinear(byte / 255);
}

/** Writes the linear RGB of pixel `index` into `out`. */
export function writeLinearColor(pixels: Uint8ClampedArray, index: number, out: number[]): void {
  const offset = index * 4;
  out[0] = byteToLinear(pixels[offset] ?? 0);
  out[1] = byteToLinear(pixels[offset + 1] ?? 0);
  out[2] = byteToLinear(pixels[offset + 2] ?? 0);
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parses `#rgb` / `#rrggbb` into 0–1 sRGB channels, falling back on bad input. */
export function parseHexColor(value: string, fallback: Rgb = { r: 0.55, g: 0.64, b: 1 }): Rgb {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) {
    return fallback;
  }

  const hex = match[1] ?? '';
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;

  return {
    r: parseInt(expanded.slice(0, 2), 16) / 255,
    g: parseInt(expanded.slice(2, 4), 16) / 255,
    b: parseInt(expanded.slice(4, 6), 16) / 255,
  };
}
