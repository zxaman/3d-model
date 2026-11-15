import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EXPORT_FORMATS, type ExportFormat } from '@core/services/export.service';
import { Icon } from '@shared/ui';
import { PreferencesService } from '@core/services/preferences.service';
import { StudioStore } from './studio-store';
import { ExportBar } from './components/export-bar/export-bar';
import { ImageDropzone } from './components/image-dropzone/image-dropzone';
import { ModelViewport } from './components/model-viewport/model-viewport';
import { PrintCheck } from './components/print-check/print-check';
import { SettingsPanel } from './components/settings-panel/settings-panel';

/**
 * Studio route shell.
 *
 * Wires the store to presentational children and owns the two things that need
 * a DOM handle: the viewport (for snapshots) and the clipboard.
 */
@Component({
  selector: 'i3d-studio-page',
  imports: [RouterLink, Icon, ExportBar, ImageDropzone, ModelViewport, PrintCheck, SettingsPanel],
  providers: [StudioStore],
  templateUrl: './studio-page.html',
  styleUrl: './studio-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:paste)': 'onPaste($event)',
  },
})
export class StudioPage {
  /**
   * Bound from the `?projectId=` query param by `withComponentInputBinding`.
   *
   * The name is load-bearing: router input binding matches query params to
   * inputs by their binding name, so an input called `projectId` is only ever
   * fed by a param called `projectId`. Aliasing it to `id` would work, but the
   * mismatch is invisible — and it is what let the gallery's "Open" link
   * silently land on an empty studio.
   */
  readonly projectId = input<string | undefined>();

  protected readonly store = inject(StudioStore);
  private readonly preferences = inject(PreferencesService);
  private readonly viewport = viewChild(ModelViewport);

  protected readonly dimensions = computed(() => {
    const source = this.store.source();
    return source ? `${source.width} × ${source.height}` : '';
  });

  constructor() {
    // Deep link from the gallery: `/studio?projectId=<project>`.
    effect(() => {
      const requested = this.projectId();
      if (requested !== undefined && requested !== this.store.projectId()) {
        void this.store.loadProject(requested);
      }
    });
  }

  protected loadFile(file: File): void {
    void this.store.loadFile(file);
  }

  protected regenerate(): void {
    void this.store.regenerate();
  }

  protected onName(event: Event): void {
    this.store.setName((event.target as HTMLInputElement).value);
  }

  protected setAutoGenerate(enabled: boolean): void {
    this.preferences.patch({ autoGenerate: enabled });
  }

  protected exportModel(format: ExportFormat): void {
    const extension = EXPORT_FORMATS.find((entry) => entry.id === format)?.extension ?? format;
    void this.store.exportModel(format, extension);
  }

  protected snapshot(): void {
    const dataUrl = this.viewport()?.snapshot();
    if (dataUrl) {
      this.store.exportSnapshot(dataUrl);
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) {
        continue;
      }
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        void this.store.loadFile(file);
        return;
      }
    }
  }
}
