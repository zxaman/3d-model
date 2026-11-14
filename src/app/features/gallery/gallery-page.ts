import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectRepository } from '@core/data/project.repository';
import { NotificationService } from '@core/services/notification.service';
import { ButtonDirective, EmptyState, Icon } from '@shared/ui';
import { formatBytes } from '@core/utils/format';
import { ProjectCard } from './project-card/project-card';

/** Stored projects, with undo-friendly destructive actions. */
@Component({
  selector: 'i3d-gallery-page',
  imports: [RouterLink, Icon, ButtonDirective, EmptyState, ProjectCard],
  templateUrl: './gallery-page.html',
  styleUrl: './gallery-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-gallery-page' },
})
export class GalleryPage {
  private readonly projects = inject(ProjectRepository);
  private readonly notifications = inject(NotificationService);

  protected readonly items = this.projects.projects;
  protected readonly usage = this.projects.usage;
  protected readonly confirmingClear = signal(false);

  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly count = computed(() => this.items().length);
  protected readonly usageLabel = computed(() => formatBytes(this.usage().bytes));
  protected readonly budgetLabel = computed(() => formatBytes(this.usage().budgetBytes));
  protected readonly storageAvailable = computed(() => this.projects.isPersistent());

  protected rename(id: string, name: string): void {
    this.projects.rename(id, name);
  }

  protected duplicate(id: string): void {
    const copy = this.projects.duplicate(id);
    if (copy !== null) {
      this.notifications.success('Project duplicated', copy.name);
    }
  }

  /**
   * Deletes immediately and offers an undo instead of a confirm dialog: the
   * record is re-saved verbatim, so nothing is lost by being cautious first.
   */
  protected remove(id: string): void {
    const record = this.projects.load(id);
    if (record === null) {
      return;
    }

    this.projects.remove(id);
    this.notifications.info(`Deleted "${record.name}"`, undefined, {
      label: 'Undo',
      run: () => this.projects.save(record),
    });
  }

  protected startClear(): void {
    this.confirmingClear.set(true);
    if (this.clearTimer !== null) {
      clearTimeout(this.clearTimer);
    }
    this.clearTimer = setTimeout(() => this.confirmingClear.set(false), 5000);
  }

  protected clearAll(): void {
    this.confirmingClear.set(false);
    if (this.clearTimer !== null) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    this.projects.clearAll();
    this.notifications.success('All projects deleted');
  }
}
