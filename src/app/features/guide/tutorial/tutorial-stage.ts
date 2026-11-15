import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '@shared/ui';
import type { TutorialStep } from './tutorial-steps';

/**
 * The animated mock at the heart of the walkthrough.
 *
 * Split out from the player so the miniature interface — by far the largest
 * stylesheet in the feature — stays a self-contained unit, and so the player
 * keeps its own concerns (transport, caption, transcript) readable.
 */
@Component({
  selector: 'i3d-tutorial-stage',
  imports: [Icon],
  templateUrl: './tutorial-stage.html',
  styleUrl: './tutorial-stage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-tutorial-stage' },
})
export class TutorialStage {
  readonly step = input.required<TutorialStep>();
  /** The model only exists once the script has reached the generate step. */
  readonly showMesh = input(false);
}
