import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

let sequence = 0;

/** Switch built on a real checkbox, so assistive tech and forms keep working. */
@Component({
  selector: 'i3d-toggle',
  templateUrl: './toggle.html',
  styleUrl: './toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toggle {
  readonly label = input.required<string>();
  readonly checked = input(false);
  readonly hint = input<string | null>(null);
  readonly disabled = input(false);

  readonly checkedChange = output<boolean>();

  protected readonly inputId = `i3d-toggle-${sequence++}`;

  protected onChange(event: Event): void {
    this.checkedChange.emit((event.target as HTMLInputElement).checked);
  }
}
