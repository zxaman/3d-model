import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  MODE_CATALOG,
  PRINT_PRESET_CATALOG,
  PRINT_PRESET_OPTIONS,
  SETTING_RANGES,
  type DepthSource,
  type GenerationMode,
  type GenerationSettings,
  type MaterialPreset,
  type PresentationSettings,
  type PrintPreset,
  type ViewportBackground,
} from '@core/models/generation.model';
import type { ComplexityEstimate } from '@core/models/estimate';
import {
  ButtonDirective,
  Icon,
  Segmented,
  Select,
  Slider,
  Toggle,
  type SelectOption,
} from '@shared/ui';

type Option<T extends string> = SelectOption<T>;

/**
 * Presentational control surface for the studio.
 *
 * Holds no state of its own: it renders the settings it is given and reports
 * intent upward. That keeps every rule (validation, regeneration, persistence)
 * in the store, and makes the panel trivially testable.
 */
@Component({
  selector: 'i3d-settings-panel',
  imports: [Icon, ButtonDirective, Segmented, Select, Slider, Toggle, DecimalPipe],
  templateUrl: './settings-panel.html',
  styleUrl: './settings-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-settings-panel' },
})
export class SettingsPanel {
  readonly settings = input.required<GenerationSettings>();
  readonly presentation = input.required<PresentationSettings>();
  readonly estimate = input.required<ComplexityEstimate>();
  readonly autoGenerate = input(false);

  /** An image is loaded — without one there is nothing to generate from. */
  readonly hasSource = input(false);
  /** A model has already been built, so the action becomes "regenerate". */
  readonly hasModel = input(false);
  /** Settings moved on since the model on screen was built. */
  readonly stale = input(false);
  /** A run is in flight. */
  readonly busy = input(false);

  readonly settingsChange = output<Partial<GenerationSettings>>();
  readonly presentationChange = output<Partial<PresentationSettings>>();
  readonly modeChange = output<GenerationMode>();
  readonly printPresetChange = output<PrintPreset>();
  readonly autoGenerateChange = output<boolean>();
  readonly regenerate = output<void>();

  protected readonly ranges = SETTING_RANGES;

  protected readonly modeOptions: readonly Option<GenerationMode>[] = [
    { id: 'relief', label: 'Relief' },
    { id: 'extrude', label: 'Extrude' },
    { id: 'voxel', label: 'Voxel' },
    { id: 'points', label: 'Points' },
  ];

  protected readonly depthSources: readonly Option<DepthSource>[] = [
    { id: 'luminance', label: 'Brightness' },
    { id: 'alpha', label: 'Transparency' },
  ];

  protected readonly materials: readonly Option<MaterialPreset>[] = [
    { id: 'textured', label: 'Source image' },
    { id: 'vertex-color', label: 'Vertex colours' },
    { id: 'solid', label: 'Solid colour' },
    { id: 'clay', label: 'Clay' },
  ];

  protected readonly backgrounds: readonly Option<ViewportBackground>[] = [
    { id: 'studio', label: 'Studio' },
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'transparent', label: 'Checkerboard' },
  ];

  protected readonly integerFormat = (value: number): string => String(Math.round(value));

  /** Every length in the panel is a real dimension, so it says so. */
  protected readonly millimetreFormat = (value: number): string => `${round1(value)} mm`;

  protected readonly presetOptions: readonly Option<PrintPreset>[] = PRINT_PRESET_OPTIONS.map(
    (preset) => ({ id: preset.id, label: preset.label }),
  );

  /** What the chosen preset does, shown under the picker. */
  protected readonly presetSummary = computed(
    () => PRINT_PRESET_CATALOG[this.settings().printPreset].summary,
  );

  /**
   * The one action a first-time user is looking for.
   *
   * It stays mounted whether or not live regeneration is on: with auto-generate
   * enabled the model rebuilds by itself, but a control that only exists in the
   * opposite mode is undiscoverable — and "where is the button?" is exactly the
   * question someone asks when the app silently does the work for them.
   */
  protected readonly generateLabel = computed(() => {
    if (this.busy()) {
      return this.hasModel() ? 'Rebuilding…' : 'Generating model…';
    }
    return this.hasModel() ? 'Regenerate model' : 'Generate model';
  });

  protected readonly generateIcon = computed(() => (this.hasModel() ? 'refresh' : 'sparkles'));

  protected readonly generateDisabled = computed(() => !this.hasSource() || this.busy());

  protected readonly generateHint = computed(() => {
    if (!this.hasSource()) {
      return 'Add an image first — drop one on the panel above.';
    }
    if (this.busy()) {
      return 'Building geometry in a web worker…';
    }
    if (this.autoGenerate()) {
      return 'Live regeneration is on — the model rebuilds as you move the sliders.';
    }
    if (this.stale()) {
      return 'Settings changed. Generate again to apply them.';
    }
    return 'Up to date. Generate again to rebuild from scratch.';
  });

  protected readonly modeSummary = computed(() => {
    const descriptor = MODE_CATALOG[this.settings().mode];
    return `${descriptor.summary} Best for: ${descriptor.bestFor}.`;
  });

  protected readonly detailHint = computed(() => {
    const settings = this.settings();
    const grid = this.estimate();
    const suffix = settings.mode === 'points' ? 'samples' : 'grid';
    return `${grid.vertices.toLocaleString()} ${suffix} · ${grid.triangles.toLocaleString()} triangles`;
  });

  protected patch(patch: Partial<GenerationSettings>): void {
    this.settingsChange.emit(patch);
  }

  protected patchPresentation(patch: Partial<PresentationSettings>): void {
    this.presentationChange.emit(patch);
  }

  protected setMode(mode: GenerationMode): void {
    this.modeChange.emit(mode);
  }

  protected setPrintPreset(preset: PrintPreset): void {
    this.printPresetChange.emit(preset);
  }

  protected onColorInput(event: Event): void {
    this.presentationChange.emit({
      solidColor: (event.target as HTMLInputElement).value,
    });
  }
}

/** Millimetre readouts only need one decimal place to be useful. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
