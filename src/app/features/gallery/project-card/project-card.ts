import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MODE_CATALOG, type GenerationMode } from '@core/models/generation.model';
import type { ProjectSummary } from '@core/models/project.model';
import { ButtonDirective, Icon } from '@shared/ui';
import { formatBytes, formatCount, formatRelativeTime } from '@core/utils/format';

/** One gallery tile: thumbnail, summary stats and the four project actions. */
@Component({
  selector: 'i3d-project-card',
  imports: [RouterLink, Icon, ButtonDirective],
  templateUrl: './project-card.html',
  styleUrl: './project-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-project-card' },
})
export class ProjectCard {
  readonly project = input.required<ProjectSummary>();

  readonly renameRequest = output<string>();
  readonly duplicate = output<void>();
  readonly remove = output<void>();

  protected readonly renaming = signal(false);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly modeLabel = computed(
    () => MODE_CATALOG[this.project().mode as GenerationMode].label,
  );
  protected readonly triangleLabel = computed(() => formatCount(this.project().triangles));
  protected readonly sizeLabel = computed(() => formatBytes(this.project().bytes));
  protected readonly updatedLabel = computed(() => formatRelativeTime(this.project().updatedAt));

  protected startRename(): void {
    this.renaming.set(true);
    // The input only exists once the flag flips, so focus on the next frame.
    setTimeout(() => this.nameInput()?.nativeElement.select());
  }

  protected commitRename(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.renaming.set(false);
    if (value.length > 0 && value !== this.project().name) {
      this.renameRequest.emit(value);
    }
  }
}
