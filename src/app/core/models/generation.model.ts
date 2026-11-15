/**
 * Domain model for turning raster pixels into geometry.
 *
 * The model is deliberately serialisable: every value here round-trips through
 * `localStorage` as JSON, and is re-validated on the way back in (see
 * `normalizeSettings`), because persisted data is untrusted input.
 */

import type { DepthSource, GenerationMode, GenerationPhase, PrintPreset } from '@engine/model';
import { PRINT_PRESETS } from '@engine/model';

export type { DepthSource, GenerationMode, GenerationPhase, PrintPreset };

/**
 * How many millimetres a stored "world unit" was worth before the engine moved
 * to real units. Legacy projects were authored against a 2-unit-wide model and
 * a 100 mm default, so every length in them scales by 50.
 */
const LEGACY_UNIT_TO_MM = 50;

/** Stored schema version these legacy lengths belong to. */
const LEGACY_LENGTH_SCHEMA = 1;

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
  /** Peak displacement in millimetres. */
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

  /** Physical width of the longest edge, in millimetres. */
  widthMm: number;

  // -- Physical object -----------------------------------------------------
  /** Dresses the model up as a printable object (keychain, coin, …). */
  printPreset: PrintPreset;

  // -- Extrude -------------------------------------------------------------
  /** Luminance cut-off (0–1) separating "solid" from "empty". */
  threshold: number;

  // -- Solid base ----------------------------------------------------------
  /** Add a flat back face plus side walls so the model is printable. */
  base: boolean;
  /** Thickness of the base slab in millimetres. */
  baseThickness: number;

  // -- Voxel ---------------------------------------------------------------
  /** Discrete stack height, in cubes. */
  voxelLayers: number;

  // -- Point cloud ---------------------------------------------------------
  /** Sampling stride: 1 keeps every sample, 4 keeps every 4th. */
  pointStride: number;
  /** Particle size in millimetres. */
  pointSize: number;
}

/**
 * A printable object the image can be built into.
 *
 * Picking one applies a whole *physical* configuration, not just a look: the
 * size a real object is, how thick its back has to be to survive, and whether
 * it needs a loop. Everything it sets stays editable afterwards.
 */
export interface PrintPresetDescriptor {
  readonly id: PrintPreset;
  readonly label: string;
  readonly summary: string;
  /** Settings applied when the preset is chosen. */
  readonly patch: Readonly<Partial<GenerationSettings>>;
}

export const PRINT_PRESET_CATALOG: Readonly<Record<PrintPreset, PrintPresetDescriptor>> = {
  none: {
    id: 'none',
    label: 'Plain slab',
    summary: 'A flat-backed block the full size you set — nothing added.',
    patch: {},
  },
  keychain: {
    id: 'keychain',
    label: 'Keychain',
    summary: 'Small rounded tag with a loop, sized to hang off a keyring.',
    patch: {
      mode: 'relief',
      widthMm: 60,
      depth: 4,
      base: true,
      baseThickness: 2.4,
      invert: false,
      contrast: 1.15,
      smoothing: 2,
      detail: 0.6,
    },
  },
  coin: {
    id: 'coin',
    label: 'Coin',
    summary: 'Round medallion with a raised rim — prints flat on its back.',
    patch: {
      mode: 'relief',
      widthMm: 60,
      depth: 3,
      base: true,
      baseThickness: 3,
      invert: false,
      contrast: 1.2,
      smoothing: 2,
      detail: 0.6,
    },
  },
  plaque: {
    id: 'plaque',
    label: 'Plaque',
    summary: 'Framed panel with a border — the desk or wall photo block.',
    patch: {
      mode: 'relief',
      widthMm: 140,
      depth: 6,
      base: true,
      baseThickness: 3,
      invert: false,
      contrast: 1,
      smoothing: 2,
      detail: 0.55,
    },
  },
  lithophane: {
    id: 'lithophane',
    label: 'Lithophane',
    summary: 'Thin panel you hold up to the light; the image appears in the shadows.',
    patch: {
      mode: 'relief',
      widthMm: 120,
      depth: 2.6,
      base: true,
      baseThickness: 0.8,
      // Back-lit means bright pixels have to be *thin*, which is the reverse of
      // a front-lit relief — hence the inversion.
      invert: true,
      contrast: 1.45,
      smoothing: 1,
      detail: 0.8,
    },
  },
};

export const PRINT_PRESET_OPTIONS: readonly PrintPresetDescriptor[] = PRINT_PRESETS.map(
  (id) => PRINT_PRESET_CATALOG[id],
);

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
  widthMm: { min: 20, max: 300, step: 5 },
  depth: { min: 0.5, max: 40, step: 0.5 },
  smoothing: { min: 0, max: 12, step: 0.5 },
  detail: { min: 0, max: 2, step: 0.05 },
  contrast: { min: 0.25, max: 3, step: 0.05 },
  threshold: { min: 0.02, max: 0.98, step: 0.01 },
  baseThickness: { min: 0.4, max: 20, step: 0.2 },
  voxelLayers: { min: 4, max: 48, step: 1 },
  pointStride: { min: 1, max: 6, step: 1 },
  pointSize: { min: 0.1, max: 3, step: 0.05 },
  roughness: { min: 0, max: 1, step: 0.01 },
  metalness: { min: 0, max: 1, step: 0.01 },
} as const satisfies Record<string, NumericRange>;

export const DEFAULT_GENERATION_SETTINGS: Readonly<GenerationSettings> = {
  mode: 'relief',
  resolution: 224,
  widthMm: 100,
  printPreset: 'none',
  depth: 8,
  smoothing: 2,
  detail: 0.55,
  contrast: 1,
  invert: false,
  depthSource: 'luminance',
  threshold: 0.5,
  base: true,
  baseThickness: 2,
  voxelLayers: 16,
  pointStride: 2,
  pointSize: 0.6,
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
    depth: 4,
    smoothing: 3,
    detail: 0,
    threshold: 0.55,
  },
  voxel: {
    ...DEFAULT_GENERATION_SETTINGS,
    mode: 'voxel',
    resolution: 64,
    depth: 15,
    smoothing: 1.5,
    voxelLayers: 18,
    base: false,
  },
  points: {
    ...DEFAULT_GENERATION_SETTINGS,
    mode: 'points',
    resolution: 320,
    depth: 12,
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

export function isPrintPreset(value: unknown): value is PrintPreset {
  return typeof value === 'string' && (PRINT_PRESETS as readonly string[]).includes(value);
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
    widthMm: readNumber(raw['widthMm'], base.widthMm, SETTING_RANGES.widthMm),
    printPreset: isPrintPreset(raw['printPreset']) ? raw['printPreset'] : base.printPreset,
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

/**
 * Reads settings written by an older build.
 *
 * Schema 1 stored every length in abstract "world units" against a model that
 * was two units wide. Those numbers are meaningless in millimetres (a depth of
 * `0.34` would clamp to half a millimetre), so they are scaled by the ratio
 * between the old and new model widths before the usual range checks run. A
 * project saved last week therefore reopens at the size it was designed at.
 */
export function normalizeSettingsVersioned(input: unknown, schema: number): GenerationSettings {
  const settings = normalizeSettings(input);

  if (schema > LEGACY_LENGTH_SCHEMA || typeof input !== 'object' || input === null) {
    return settings;
  }

  const raw = input as Record<string, unknown>;
  const scale = (value: number, range: NumericRange): number =>
    clamp(value * LEGACY_UNIT_TO_MM, range);

  return {
    ...settings,
    depth:
      typeof raw['depth'] === 'number' ? scale(raw['depth'], SETTING_RANGES.depth) : settings.depth,
    baseThickness:
      typeof raw['baseThickness'] === 'number'
        ? scale(raw['baseThickness'], SETTING_RANGES.baseThickness)
        : settings.baseThickness,
    pointSize:
      typeof raw['pointSize'] === 'number'
        ? scale(raw['pointSize'], SETTING_RANGES.pointSize)
        : settings.pointSize,
  };
}
