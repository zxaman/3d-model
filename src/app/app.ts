import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonDirective, Icon, type IconName, ToastHost } from '@shared/ui';
import { ProjectRepository } from '@core/data/project.repository';
import { PreferencesService } from '@core/services/preferences.service';
import { formatBytes } from '@core/utils/format';

interface NavLink {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
}

@Component({
  selector: 'i3d-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ButtonDirective, ToastHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly preferences = inject(PreferencesService);
  private readonly projects = inject(ProjectRepository);

  protected readonly links: readonly NavLink[] = [
    { path: '/studio', label: 'Studio', icon: 'sparkles' },
    { path: '/gallery', label: 'Gallery', icon: 'folder' },
    { path: '/guide', label: 'How it works', icon: 'book' },
  ];

  protected readonly theme = this.preferences.theme;

  protected readonly usage = this.projects.usage;

  protected readonly usageLabel = computed(() => formatBytes(this.usage().bytes));

  protected readonly usagePercent = computed(() =>
    Math.min(100, Math.round((this.usage().bytes / this.usage().budgetBytes) * 100)),
  );

  protected readonly usageLevel = computed(() => {
    const percent = this.usagePercent();
    if (percent >= 90) return 'critical' as const;
    if (percent >= 70) return 'warning' as const;
    return 'normal' as const;
  });

  protected readonly usageHint = computed(() => {
    const usage = this.usage();
    const persistent = this.projects.isPersistent();
    const location = persistent ? 'this browser' : 'memory only — storage is unavailable';
    return `${formatBytes(usage.bytes)} of about ${formatBytes(usage.budgetBytes)} used in ${location} · ${usage.recordCount} entries`;
  });

  protected toggleTheme(): void {
    this.preferences.toggleTheme();
  }
}
