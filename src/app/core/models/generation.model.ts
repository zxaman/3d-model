/**
 * Domain model for turning raster pixels into geometry.
 *
 * The model is deliberately serialisable: every value here round-trips through
 * `localStorage` as JSON, and is re-validated on the way back in (see
 * `normalizeSettings`), because persisted data is untrusted input.
 */

import type { DepthSource, GenerationMode, GenerationPhase } from '@engine/model';
import { PLANE_SIZE } from '@engine/model';

export type { DepthSource, GenerationMode, GenerationPhase };
export { PLANE_SIZE };

export const GENERATION_MODES: readonly GenerationMode[] = ['relief', 'extrude', 'voxel', 'points'];

/** How the finished mesh is shaded in the viewport (and baked into exports). */
export type MaterialPreset = 'textured' | 'vertex-color' | 'solid' | 'clay';

export type ViewportBackground = 'studio' | 'dark' | 'light' | 'transparent';

export interface ModeDescriptor {
  readonly id: GenerationMode;
  readonly label: string;
  readonly summary: string;
  readonly bestFor: string;
}

export const MODE_CATALOG: Readonly<Record<GenerationMode, ModeDescriptor>> = {
  relief: {
    id: 'relief',
    label: 'Relief',
    summary: 'Smooth displaced surface — the classic lithophane look.',
    bestFor: 'Photos, portraits, textures, terrain',
  },
  extrude: {
    id: 'extrude',
    label: 'Extrude',
    summary: 'Flat-topped silhouette with straight walls.',
    bestFor: 'Logos, icons, text, stickers',
  },
  voxel: {
    id: 'voxel',
    label: 'Voxel',
    summary: 'Blocky, Minecraft-style stack of coloured cubes.',
    bestFor: 'Pixel art, avatars, game assets',
  },
  points: {
    id: 'points',
    label: 'Point cloud',
    summary: 'Coloured particles suspended at their depth.',
    bestFor: 'Previews, scans, artistic effects',
  },
};

export interface GenerationSettings {
  /** Grid cells along the longest edge of the image. */
  resolution: number;
  /** Peak displacement in world units (the model is {@link PLANE_SIZE} wide). */
  depth: number;
  /** Edge-preserving blur radius in cells; removes sensor noise and JPEG artefacts. */
  smoothing: number;
  /** Unsharp-mask strength — puts high-frequency detail back after smoothing. */
  detail: number;
  /** Gamma applied to the normalised height field. */
  contrast: number;
  /** Swap peaks and valleys. */
  invert: boolean;
  /** Channel the height is derived from. */
  depthSource: DepthSource;
  mode: GenerationMode;

  // -- Extrude -------------------------------------------------------------
  /** Luminance cut-off (0–1) separating "solid" from "empty". */
  threshold: number;

  // -- Solid base ----------------------------------------------------------
  /** Add a flat back face plus side walls so the model is printable. */
  base: boolean;
  /** Thickness of the base slab in world units. */
  baseThickness: number;

  // -- Voxel ---------------------------------------------------------------
  /** Discrete stack height, in cubes. */
  voxelLayers: number;

  // -- Point cloud ---------------------------------------------------------
  /** Sampling stride: 1 keeps every sample, 4 keeps every 4th. */
  pointStride: number;
  /** Particle size in world units. */
  pointSize: number;
}

export interface PresentationSettings {
  material: MaterialPreset;
  /** Hex colour used by the `solid` preset. */
  solidColor: string;
  wireframe: boolean;
  roughness: number;
  metalness: number;
  background: ViewportBackground;
  grid: boolean;
  autoRotate: boolean;
}

export interface NumericRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Single source of truth for slider bounds and for sanitising stored values. */
export const SETTING_RANGES = {
  resolution: { min: 32, max: 512, step: 8 },
  depth: { min: 0.02, max: 1.2, step: 0.01 },
  smoothing: { min: 0, max: 12, step: 0.5 },
  detail: { min: 0, max: 2, step: 0.05 },
  contrast: { min: 0.25, max: 3, step: 0.05 },
  threshold: { min: 0.02, max: 0.98, step: 0.01 },
  baseThickness: { min: 0.02, max: 0.5, step: 0.01 },
  voxelLayers: { min: 4, max: 48, step: 1 },
  pointStride: { min: 1, max: 6, step: 1 },
  pointSize: { min: 0.002, max: 0.05, step: 0.001 },
  roughness: { min: 0, max: 1, step: 0.01 },
  metalness: { min: 0, max: 1, step: 0.01 },
} as const satisfies Record<string, NumericRange>;

export const DEFAULT_GENERATION_SETTINGS: Readonly<GenerationSettings> = {
  mode: 'relief',
  resolution: 224,
  depth: 0.34,
  smoothing: 2,
  detail: 0.55,
  contrast: 1,
  invert: false,
  depthSource: 'luminance',
  threshold: 0.5,
  base: true,
  baseThickness: 0.08,
  voxelLayers: 16,
  pointStride: 2,
  pointSize: 0.012,
};

/**
 * Tuned starting points per mode. Resolution is the main lever for how heavy a
 * model gets, and the right default differs wildly between a smooth relief and a
 * cube stack.
 */
export const MODE_PRESETS: Readonly<Record<GenerationMode, GenerationSettings>> = {
  relief: { ...DEFAULT_GENERATION_SETTINGS, mode: 'relief' },
  extrude: {
    ...DEFAULT_GENERATION_SETTINGS,
    mode: 'extrude',
    resolution: 256,
    depth: 0.22,
    smoothing: 3,
    detail: 0,
    threshold: 0.55,
  },
  voxel: {
    ...DEFAULT_GENERATION_SETTINGS,
    mode: 'voxel',
    resolution: 64,
    depth: 0.5,
    smoothing: 1.5,
    voxelLayers: 18,
    base: false,
  },
  points: {
    ...DEFAULT_GENERATION_SETTINGS,
    mode: 'points',
    resolution: 320,
    depth: 0.4,
    pointStride: 2,
    base: false,
  },
};

export const DEFAULT_PRESENTATION: Readonly<PresentationSettings> = {
  material: 'textured',
  solidColor: '#8ba4ff',
  wireframe: false,
  roughness: 0.55,
  metalness: 0.08,
  background: 'studio',
  grid: true,
  autoRotate: false,
};

// Geometry types live with the engine that produces them; re-exported here so
// application code has a single import surface.
export type { Bounds, MeshPayload, MeshStats } from '@engine/geometry/mesh-payload';

import type { MeshPayload } from '@engine/geometry/mesh-payload';

export interface GenerationResult {
  readonly payload: MeshPayload;
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function clamp(value: number, range: NumericRange): number {
  const clamped = Math.min(Math.max(value, range.min), range.max);
  return Number.isFinite(clamped) ? clamped : range.min;
}

export function isGenerationMode(value: unknown): value is GenerationMode {
  return typeof value === 'string' && (GENERATION_MODES as readonly string[]).includes(value);
}

function readNumber(value: unknown, fallback: number, range: NumericRange): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, range)
    : clamp(fallback, range);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Coerces anything (usually a parsed JSON blob) into a valid settings object.
 * Unknown keys are dropped and out-of-range numbers are clamped, so a settings
 * record written by an older build can never produce an unusable model.
 */
export function normalizeSettings(input: unknown): GenerationSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const base: GenerationSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    mode: isGenerationMode(raw['mode']) ? raw['mode'] : DEFAULT_GENERATION_SETTINGS.mode,
    invert: readBoolean(raw['invert'], DEFAULT_GENERATION_SETTINGS.invert),
    base: readBoolean(raw['base'], DEFAULT_GENERATION_SETTINGS.base),
    depthSource: raw['depthSource'] === 'alpha' ? 'alpha' : 'luminance',
  };

  return {
    ...base,
    resolution: Math.round(
      readNumber(raw['resolution'], base.resolution, SETTING_RANGES.resolution),
    ),
    depth: readNumber(raw['depth'], base.depth, SETTING_RANGES.depth),
    smoothing: readNumber(raw['smoothing'], base.smoothing, SETTING_RANGES.smoothing),
    detail: readNumber(raw['detail'], base.detail, SETTING_RANGES.detail),
    contrast: readNumber(raw['contrast'], base.contrast, SETTING_RANGES.contrast),
    threshold: readNumber(raw['threshold'], base.threshold, SETTING_RANGES.threshold),
    baseThickness: readNumber(
      raw['baseThickness'],
      base.baseThickness,
      SETTING_RANGES.baseThickness,
    ),
    voxelLayers: Math.round(
      readNumber(raw['voxelLayers'], base.voxelLayers, SETTING_RANGES.voxelLayers),
    ),
    pointStride: Math.round(
      readNumber(raw['pointStride'], base.pointStride, SETTING_RANGES.pointStride),
    ),
    pointSize: readNumber(raw['pointSize'], base.pointSize, SETTING_RANGES.pointSize),
  };
}

export function normalizePresentation(input: unknown): PresentationSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const material = raw['material'];
  const background = raw['background'];

  return {
    material:
      material === 'vertex-color' || material === 'solid' || material === 'clay'
        ? material
        : 'textured',
    solidColor:
      typeof raw['solidColor'] === 'string' ? raw['solidColor'] : DEFAULT_PRESENTATION.solidColor,
    wireframe: readBoolean(raw['wireframe'], DEFAULT_PRESENTATION.wireframe),
    roughness: readNumber(
      raw['roughness'],
      DEFAULT_PRESENTATION.roughness,
      SETTING_RANGES.roughness,
    ),
    metalness: readNumber(
      raw['metalness'],
      DEFAULT_PRESENTATION.metalness,
      SETTING_RANGES.metalness,
    ),
    background:
      background === 'dark' || background === 'light' || background === 'transparent'
        ? background
        : 'studio',
    grid: readBoolean(raw['grid'], DEFAULT_PRESENTATION.grid),
    autoRotate: readBoolean(raw['autoRotate'], DEFAULT_PRESENTATION.autoRotate),
  };
}
