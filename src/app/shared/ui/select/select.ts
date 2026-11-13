import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

export interface SelectOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
}

let sequence = 0;

/**
 * Native `<select>` in a styled shell — keeps the platform picker on mobile and
 * type-ahead on desktop, which custom listboxes rarely match.
 *
 * Generic over the option id, so `(valueChange)` hands back the same union the
 * caller bound to `[value]` instead of a plain `string`.
 */
@Component({
  selector: 'i3d-select',
  imports: [Icon],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Select<T extends string = string> {
  readonly label = input<string | null>(null);
  readonly value = input.required<T>();
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly hint = input<string | null>(null);
  readonly disabled = input(false);

  readonly valueChange = output<T>();

  protected readonly inputId = `i3d-select-${sequence++}`;
  protected readonly hintId = `${this.inputId}-hint`;

  protected onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value as T);
  }
}
