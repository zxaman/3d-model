import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  MODE_PRESETS,
  PRINT_PRESET_CATALOG,
  type GenerationResult,
  type GenerationSettings,
  type PresentationSettings,
} from '@core/models/generation.model';
import { checkPrintability, type PrintReport } from '@engine/geometry/print-check';
import { estimateComplexity } from '@core/models/estimate';
import type { ProjectDraft } from '@core/models/project.model';
import { GenerationService, type PixelBuffer } from '@core/services/generation.service';
import { ImageError, ImageService, type SourceImage } from '@core/services/image.service';
import { ModelBuilderService, type ModelHandle } from '@core/services/model-builder.service';
import { NotificationService } from '@core/services/notification.service';
import { PreferencesService } from '@core/services/preferences.service';
import { DownloadService } from '@core/services/download.service';
import { ExportService, type ExportFormat } from '@core/services/export.service';
import { ProjectRepository } from '@core/data/project.repository';
import { StorageQuotaError } from '@core/storage/storage.service';
import { createId } from '@core/utils/id';
import type { GenerationPhase, GenerationMode, PrintPreset } from '@core/models/generation.model';

export type StudioStatus = 'empty' | 'loading' | 'generating' | 'ready' | 'failed';

/** Quiet period after a slider moves before the model is rebuilt. */
const REGENERATE_DEBOUNCE_MS = 220;

/**
 * Feature state for the studio.
 *
 * One store owns the whole pipeline — image → settings → worker → three.js
 * object → persistence — so every entry point (file picker, drag & drop, paste,
 * gallery deep link) funnels through the same code path.
 *
 * Provided by the studio route, so its state and the model's GPU resources are
 * released when the user navigates away.
 */
@Injectable()
export class StudioStore implements OnDestroy {
  private readonly generation = inject(GenerationService);
  private readonly images = inject(ImageService);
  private readonly builder = inject(ModelBuilderService);
  private readonly projects = inject(ProjectRepository);
  private readonly notifications = inject(NotificationService);
  private readonly preferences = inject(PreferencesService);
  private readonly downloads = inject(DownloadService);
  private readonly exporter = inject(ExportService);

  private readonly sourceState = signal<SourceImage | null>(null);
  private readonly settingsState = signal<GenerationSettings>(MODE_PRESETS['relief']);
  private readonly resultState = signal<GenerationResult | null>(null);
  private readonly modelState = signal<ModelHandle | null>(null);
  private readonly statusState = signal<StudioStatus>('empty');
  private readonly progressState = signal(0);
  private readonly phaseState = signal<GenerationPhase>('sampling');
  private readonly projectIdState = signal<string | null>(null);
  private readonly nameState = signal('');
  private readonly dirtyState = signal(false);
  /** Settings changed since the model currently on screen was built. */
  private readonly staleState = signal(false);

  private run$: Subscription | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // -- Read-only surface ----------------------------------------------------

  readonly source = this.sourceState.asReadonly();
  readonly settings = this.settingsState.asReadonly();
  readonly result = this.resultState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly progress = this.progressState.asReadonly();
  readonly phase = this.phaseState.asReadonly();
  readonly projectId = this.projectIdState.asReadonly();
  readonly name = this.nameState.asReadonly();
  readonly isDirty = this.dirtyState.asReadonly();
  readonly stale = this.staleState.asReadonly();

  readonly presentation = this.preferences.presentation;
  readonly autoGenerate = this.preferences.autoGenerate;

  /** The three.js object the viewport renders — `null` until a model exists. */
  readonly modelObject = computed(() => this.modelState()?.object ?? null);

  readonly aspectRatio = computed(() => {
    const source = this.sourceState();
    return source && source.height > 0 ? source.width / source.height : 1;
  });

  readonly estimate = computed(() => estimateComplexity(this.settingsState(), this.aspectRatio()));

  readonly stats = computed(() => this.resultState()?.payload.stats ?? null);

  readonly generationMs = computed(() => this.resultState()?.durationMs ?? null);

  readonly isBusy = computed(() => {
    const status = this.statusState();
    return status === 'loading' || status === 'generating';
  });

  readonly canExport = computed(() => this.modelState() !== null && !this.isBusy());

  readonly canSave = computed(() => this.sourceState() !== null && this.modelState() !== null);

  readonly mode = computed(() => this.settingsState().mode);

  /**
   * Pre-flight analysis of the model on screen.
   *
   * Lazy on purpose: welding a few hundred thousand vertices costs tens of
   * milliseconds, and a `computed` only runs when something reads it — so the
   * cost is paid when the panel asks for it, not on every regeneration.
   */
  readonly printReport = computed<PrintReport | null>(() => {
    const result = this.resultState();
    if (result === null) {
      return null;
    }

    const settings = this.settingsState();
    return checkPrintability(result.payload, {
      mode: settings.mode,
      printPreset: settings.printPreset,
      baseThickness: settings.baseThickness,
      base: settings.base,
    });
  });

  // -- Actions --------------------------------------------------------------

  async loadFile(file: File): Promise<void> {
    this.statusState.set('loading');
    try {
      const source = await this.images.load(file);

      this.#resetModel();
      this.sourceState.set(source);
      this.projectIdState.set(null);
      this.dirtyState.set(true);
      this.nameState.set(stripExtension(file.name));

      this.staleState.set(false);
      await this.run();
    } catch (error) {
      this.#fail(error, 'That file could not be loaded.');
    }
  }

  /** Reopens a persisted project and rebuilds its model from the stored image. */
  async loadProject(id: string): Promise<void> {
    const record = this.projects.load(id);
    if (record === null) {
      this.notifications.warning(
        'Project not found',
        'It may have been deleted from this browser.',
      );
      return;
    }

    this.statusState.set('loading');
    try {
      const source = await this.images.loadFromDataUrl(record.imageDataUrl, record.name);
      this.#resetModel();

      this.sourceState.set(source);
      this.settingsState.set(record.settings);
      this.projectIdState.set(record.id);
      this.nameState.set(record.name);
      this.dirtyState.set(false);
      this.preferences.patchPresentation(record.presentation);

      this.staleState.set(false);
      await this.run();
    } catch (error) {
      this.#fail(error, 'That project could not be reopened.');
    }
  }

  setMode(mode: GenerationMode): void {
    // Mode presets supply sensible defaults; cross-mode tuning the user already
    // did (depth, smoothing, …) is carried over.
    const current = this.settingsState();
    const preset = MODE_PRESETS[mode];

    this.settingsState.set({
      ...preset,
      mode,
      depth: current.depth,
      smoothing: current.smoothing,
      detail: current.detail,
      contrast: current.contrast,
      invert: current.invert,
      depthSource: current.depthSource,
      baseThickness: current.baseThickness,
    });

    this.#afterSettingsChange();
  }

  /**
   * Applies a printable-object preset.
   *
   * A preset is a *physical* configuration — size, depth, backing thickness,
   * even the mode — so it overwrites those settings wholesale rather than
   * nudging them. Everything it sets stays editable afterwards.
   */
  setPrintPreset(preset: PrintPreset): void {
    this.settingsState.update((current) => ({
      ...current,
      printPreset: preset,
      ...PRINT_PRESET_CATALOG[preset].patch,
    }));

    this.#afterSettingsChange();
  }

  patchSettings(patch: Partial<GenerationSettings>): void {
    this.settingsState.update((current) => ({ ...current, ...patch }));
    this.#afterSettingsChange();
  }

  patchPresentation(patch: Partial<PresentationSettings>): void {
    this.preferences.patchPresentation(patch);
    const model = this.modelState();
    if (model !== null) {
      model.applyPresentation(this.presentation(), this.settingsState().pointSize);
    }
  }

  setName(name: string): void {
    this.nameState.set(name);
    this.dirtyState.set(true);
  }

  /** Rebuilds the model immediately, cancelling any run already in flight. */
  async regenerate(): Promise<void> {
    this.#clearDebounce();
    await this.run();
  }

  reset(): void {
    this.run$?.unsubscribe();
    this.run$ = null;
    this.#clearDebounce();
    this.#resetModel();

    this.sourceState.set(null);
    this.resultState.set(null);
    this.settingsState.set(MODE_PRESETS['relief']);
    this.projectIdState.set(null);
    this.nameState.set('');
    this.dirtyState.set(false);
    this.staleState.set(false);
    this.progressState.set(0);
    this.statusState.set('empty');
  }

  /** Persists the project; the model itself is rebuilt on demand, never stored. */
  save(): void {
    const source = this.sourceState();
    const result = this.resultState();
    if (source === null || result === null) {
      return;
    }

    const now = Date.now();
    const existingId = this.projectIdState();
    const settings = this.settingsState();

    const draft: ProjectDraft = {
      id: existingId ?? createId(),
      name: this.nameState().trim() || 'Untitled model',
      mode: settings.mode,
      thumbnail: source.thumbnail,
      imageDataUrl: source.dataUrl,
      width: source.width,
      height: source.height,
      settings,
      presentation: this.presentation(),
      vertices: result.payload.stats.vertices,
      triangles: result.payload.stats.triangles,
      generationMs: result.durationMs,
      bytes: source.bytes,
      createdAt: existingId ? (this.projects.find(existingId)?.createdAt ?? now) : now,
      updatedAt: now,
    };

    try {
      const record = this.projects.save(draft);
      this.projectIdState.set(record.id);
      this.dirtyState.set(false);
      this.notifications.success('Project saved', 'Stored in this browser’s local storage.');
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        this.notifications.error(
          'Local storage is full',
          'Delete a project from the gallery and try again.',
        );
        return;
      }
      this.#fail(error, 'The project could not be saved.');
    }
  }

  async exportModel(format: ExportFormat, extension: string): Promise<void> {
    const model = this.modelState();
    if (model === null) {
      return;
    }

    try {
      const blob = await this.exporter.export(model.object, format);
      const filename = `${this.downloads.toSlug(this.nameState())}.${extension}`;
      this.downloads.saveBlob(blob, filename);
      this.notifications.success(
        `${format.toUpperCase()} exported`,
        `${filename} · ${(blob.size / 1024).toFixed(0)} KB`,
      );
    } catch (error) {
      this.#fail(error, `The ${format.toUpperCase()} export failed.`);
    }
  }

  exportSnapshot(dataUrl: string): void {
    this.downloads.saveDataUrl(dataUrl, `${this.downloads.toSlug(this.nameState())}-preview.png`);
    this.notifications.success('Preview image saved');
  }

  ngOnDestroy(): void {
    this.run$?.unsubscribe();
    this.#clearDebounce();
    this.modelState()?.dispose();
    this.modelState.set(null);
  }

  // -- Internals ------------------------------------------------------------

  private async run(): Promise<void> {
    const source = this.sourceState();
    if (source === null) {
      return;
    }

    // Cancelling terminates the worker, which is the only way to interrupt a
    // synchronous mesh build already in progress.
    this.run$?.unsubscribe();

    const settings = this.settingsState();
    const grid = sampleGrid(settings.resolution, this.aspectRatio());

    let buffer: PixelBuffer;
    try {
      buffer = this.images.sample(source, grid.width, grid.height);
    } catch (error) {
      this.#fail(error, 'The image could not be sampled.');
      return;
    }

    this.statusState.set('generating');
    this.progressState.set(0);

    this.run$ = this.generation.generate({ ...buffer, settings }).subscribe({
      next: (event) => {
        if (event.kind === 'progress') {
          this.phaseState.set(event.phase);
          this.progressState.set(event.value);
          return;
        }

        const handle = this.builder.build({
          payload: event.payload,
          source: source.source,
          presentation: this.presentation(),
          pointSize: settings.pointSize,
        });

        this.modelState()?.dispose();
        this.modelState.set(handle);
        this.resultState.set({ payload: event.payload, durationMs: event.durationMs });
        this.progressState.set(1);
        this.statusState.set('ready');
        this.staleState.set(false);
        this.dirtyState.set(true);
      },
      error: (error: unknown) => this.#fail(error, 'The model could not be generated.'),
    });
  }

  #afterSettingsChange(): void {
    this.dirtyState.set(true);
    this.staleState.set(true);

    if (this.sourceState() === null) {
      return;
    }

    this.#clearDebounce();
    if (!this.autoGenerate()) {
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.run();
    }, REGENERATE_DEBOUNCE_MS);
  }

  #clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  #resetModel(): void {
    this.run$?.unsubscribe();
    this.run$ = null;
    this.modelState()?.dispose();
    this.modelState.set(null);
    this.resultState.set(null);
  }

  #fail(error: unknown, fallback: string): void {
    this.statusState.set('failed');
    const message = error instanceof ImageError ? error.message : fallback;
    const detail = error instanceof Error && !(error instanceof ImageError) ? error.message : null;
    this.notifications.error(message, detail ?? undefined);
    console.error('[i3d] studio failure', error);
  }
}

/**
 * Sample grid for the worker: `resolution` cells along the longest edge, plus
 * one row/column because a height field is built from vertices, not cells.
 */
export function sampleGrid(resolution: number, aspect: number): { width: number; height: number } {
  const longest = Math.max(8, Math.round(resolution));
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  const width = ratio >= 1 ? longest : Math.max(2, Math.round(longest * ratio));
  const height = ratio >= 1 ? Math.max(2, Math.round(longest / ratio)) : longest;

  return { width: width + 1, height: height + 1 };
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Untitled model';
}
