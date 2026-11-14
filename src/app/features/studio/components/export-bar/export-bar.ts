import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  EXPORT_FORMATS,
  type ExportDescriptor,
  type ExportFormat,
} from '@core/services/export.service';
import { MODE_CATALOG, type GenerationMode, type MeshStats } from '@core/models/generation.model';
import { ButtonDirective, Icon } from '@shared/ui';

/** Actions and live statistics for the model currently in the viewport. */
@Component({
  selector: 'i3d-export-bar',
  imports: [Icon, ButtonDirective, DecimalPipe],
  templateUrl: './export-bar.html',
  styleUrl: './export-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-export-bar' },
})
export class ExportBar {
  readonly mode = input.required<GenerationMode>();
  readonly stats = input<MeshStats | null>(null);
  readonly generationMs = input<number | null>(null);
  readonly canExport = input(false);
  readonly canSave = input(false);
  readonly isDirty = input(false);
  readonly busy = input(false);

  readonly exportFormat = output<ExportFormat>();
  readonly save = output<void>();
  readonly snapshot = output<void>();

  protected readonly formats = EXPORT_FORMATS;

  protected readonly modeLabel = computed(() => MODE_CATALOG[this.mode()].label);

  /** OBJ and STL are meaningless for a point cloud, so they are disabled. */
  protected supports(format: ExportDescriptor): boolean {
    return format.modes.includes(this.mode());
  }
}
