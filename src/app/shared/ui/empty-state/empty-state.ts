import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, type IconName } from '../icon/icon';

/** Placeholder for empty lists and unused panes, with an optional action slot. */
@Component({
  selector: 'i3d-empty-state',
  imports: [Icon],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-empty-state' },
})
export class EmptyState {
  readonly icon = input<IconName>('cube');
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
}
