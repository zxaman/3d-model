import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let sequence = 0;

/**
 * Labelled range control with a live value readout.
 *
 * Supports `[(value)]` two-way binding and emits on `input` (so dragging updates
 * immediately) — the `change` listener is a safety net for keyboard and
 * programmatic updates that skip `input`.
 */
@Component({
  selector: 'i3d-slider',
  templateUrl: './slider.html',
  styleUrl: './slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Feeds the WebKit track gradient, which cannot read the thumb position.
    '[style.--i3d-fill]': 'fill()',
  },
})
export class Slider {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input(1);
  readonly step = input(0.01);
  readonly hint = input<string | null>(null);
  readonly disabled = input(false);
  readonly format = input<(value: number) => string>((value) => value.toFixed(2));

  readonly valueChange = output<number>();

  protected readonly inputId = `i3d-slider-${sequence++}`;
  protected readonly hintId = `${this.inputId}-hint`;

  protected readonly displayValue = computed(() => this.format()(this.value()));

  protected readonly fill = computed(() => {
    const span = this.max() - this.min();
    if (span <= 0) {
      return '0%';
    }
    const ratio = (this.value() - this.min()) / span;
    return `${(Math.min(Math.max(ratio, 0), 1) * 100).toFixed(2)}%`;
  });

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const next = Number(target.value);
    if (Number.isFinite(next)) {
      this.valueChange.emit(next);
    }
  }
}
