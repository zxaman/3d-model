import {
  DEFAULT_GENERATION_SETTINGS,
  PRINT_PRESET_CATALOG,
  PRINT_PRESET_OPTIONS,
  SETTING_RANGES,
  isPrintPreset,
  normalizeSettings,
  normalizeSettingsVersioned,
} from './generation.model';

describe('generation settings', () => {
  it('defaults to a real, printable size', () => {
    expect(DEFAULT_GENERATION_SETTINGS.widthMm).toBe(100);
    expect(DEFAULT_GENERATION_SETTINGS.depth).toBeGreaterThan(1);
    expect(DEFAULT_GENERATION_SETTINGS.baseThickness).toBeGreaterThan(0.4);
    expect(DEFAULT_GENERATION_SETTINGS.base).toBe(true);
  });

  it('expresses every length in millimetres', () => {
    // Abstract "world units" are what made exports open at 2 mm.
    expect(SETTING_RANGES.depth.min).toBeGreaterThanOrEqual(0.5);
    expect(SETTING_RANGES.baseThickness.min).toBeGreaterThanOrEqual(0.4);
    expect(SETTING_RANGES.widthMm.max).toBeGreaterThanOrEqual(200);
  });

  it('clamps an out-of-range size', () => {
    expect(normalizeSettings({ widthMm: 10_000 }).widthMm).toBe(SETTING_RANGES.widthMm.max);
    expect(normalizeSettings({ widthMm: -5 }).widthMm).toBe(SETTING_RANGES.widthMm.min);
  });

  it('falls back to a plain slab for an unknown preset', () => {
    expect(normalizeSettings({ printPreset: 'teapot' }).printPreset).toBe('none');
    expect(isPrintPreset('teapot')).toBe(false);
    expect(isPrintPreset('coin')).toBe(true);
  });

  describe('legacy records', () => {
    it('scales schema-1 lengths from model units to millimetres', () => {
      // A depth of 0.34 on a two-unit-wide model is 17 mm on a 100 mm one.
      const settings = normalizeSettingsVersioned({ depth: 0.34, baseThickness: 0.08 }, 1);

      expect(settings.depth).toBeCloseTo(17, 5);
      expect(settings.baseThickness).toBeCloseTo(4, 5);
    });

    it('leaves current-schema lengths alone', () => {
      const settings = normalizeSettingsVersioned({ depth: 8, baseThickness: 2 }, 2);

      expect(settings.depth).toBeCloseTo(8, 5);
      expect(settings.baseThickness).toBeCloseTo(2, 5);
    });

    it('clamps a migrated length into the new range', () => {
      // 1.2 units is 60 mm, which is deeper than the slider allows.
      expect(normalizeSettingsVersioned({ depth: 1.2 }, 1).depth).toBe(SETTING_RANGES.depth.max);
    });

    it('fills in sizes a schema-1 record never had', () => {
      const settings = normalizeSettingsVersioned({ mode: 'relief' }, 1);

      expect(settings.widthMm).toBe(DEFAULT_GENERATION_SETTINGS.widthMm);
      expect(settings.printPreset).toBe('none');
    });
  });

  describe('print presets', () => {
    it('offers every preset as a select option', () => {
      expect(PRINT_PRESET_OPTIONS.map((option) => option.id)).toEqual([
        'none',
        'keychain',
        'coin',
        'plaque',
        'lithophane',
      ]);
    });

    it('gives each preset a physical size and a backing thickness', () => {
      for (const preset of PRINT_PRESET_OPTIONS) {
        if (preset.id === 'none') {
          continue;
        }

        const patch = PRINT_PRESET_CATALOG[preset.id].patch;
        expect(patch.widthMm).toBeGreaterThan(0);
        expect(patch.base).toBe(true);
        expect(patch.baseThickness).toBeGreaterThan(0);
      }
    });

    it('inverts a lithophane so bright pixels come out thin', () => {
      // Back-lit: light passes through the thin parts, so the image has to be
      // the reverse of a front-lit relief.
      expect(PRINT_PRESET_CATALOG['lithophane'].patch.invert).toBe(true);
    });

    it('only puts a hanging loop on the keychain', () => {
      expect(PRINT_PRESET_CATALOG['keychain'].patch.mode).toBe('relief');

      for (const preset of PRINT_PRESET_OPTIONS) {
        if (preset.id !== 'keychain') {
          expect(PRINT_PRESET_CATALOG[preset.id].summary).not.toContain('loop');
        }
      }
    });
  });
});
