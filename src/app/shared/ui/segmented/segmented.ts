import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { Icon, type IconName } from '../icon/icon';

export interface SegmentedOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly icon?: IconName;
}

/**
 * Radio-group segmented control with proper arrow-key navigation and roving
 * tabindex — one tab stop for the whole group, arrows to move within it.
 */
@Component({
  selector: 'i3d-segmented',
  imports: [Icon],
  templateUrl: './segmented.html',
  styleUrl: './segmented.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Segmented<T extends string = string> {
  readonly label = input.required<string>();
  readonly options = input.required<readonly SegmentedOption<T>[]>();
  readonly value = input.required<T>();
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly valueChange = output<T>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');

  protected select(id: T): void {
    if (!this.disabled() && id !== this.value()) {
      this.valueChange.emit(id);
    }
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    const options = this.options();
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + direction + options.length) % options.length;
    const next = options[nextIndex];
    const button = this.buttons()[nextIndex];

    if (next !== undefined) {
      this.select(next.id);
      // The radio that becomes active also becomes the tab stop.
      setTimeout(() => button?.nativeElement.focus());
    }
  }
}
