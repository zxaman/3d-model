import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { PrintReport } from '@engine/geometry/print-check';
import { Icon, type IconName } from '@shared/ui';

/**
 * The print check panel.
 *
 * Sits between the viewport and the export buttons so the findings are read
 * *before* a file is downloaded, and stays collapsed until there is something to
 * say — a green bar nobody clicks is just noise.
 */
@Component({
  selector: 'i3d-print-check',
  imports: [Icon],
  templateUrl: './print-check.html',
  styleUrl: './print-check.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-print-check' },
})
export class PrintCheck {
  readonly report = input<PrintReport | null>(null);

  /**
   * A user override for the current report only.
   *
   * Keyed on the report object so the choice expires with the model it was made
   * about — a fresh model gets the default again instead of inheriting a stale
   * "I already dismissed this".
   */
  private readonly override = signal<{ report: PrintReport; open: boolean } | null>(null);

  /**
   * Blocked models open themselves: a collapsed panel that says "this will not
   * slice" without saying why is a dead end. Warnings stay folded away, because
   * a bar that is always shouting is a bar nobody reads.
   */
  protected readonly open = computed(() => {
    const report = this.report();
    if (report === null) {
      return false;
    }

    const override = this.override();
    return override?.report === report ? override.open : report.status === 'blocked';
  });

  protected readonly icon = computed<IconName>(() => {
    switch (this.report()?.status) {
      case 'blocked':
        return 'warning';
      case 'warnings':
        return 'info';
      default:
        return 'check';
    }
  });

  protected readonly issueCount = computed(() => this.report()?.issues.length ?? 0);

  protected toggle(): void {
    const report = this.report();
    if (report !== null) {
      this.override.set({ report, open: !this.open() });
    }
  }
}
