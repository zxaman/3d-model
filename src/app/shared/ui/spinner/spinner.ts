import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'i3d-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="i3d-spinner" [attr.data-size]="size()"></span>`,
  host: {
    '[attr.role]': '"status"',
    '[attr.aria-label]': 'label()',
  },
})
export class Spinner {
  readonly size = input<'sm' | 'md'>('md');
  readonly label = input('Loading');
}
