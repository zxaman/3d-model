import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ButtonDirective, Icon } from '@shared/ui';
import { TUTORIAL_STEPS, stepDuration, type TutorialStep } from './tutorial-steps';
import { TutorialStage } from './tutorial-stage';

/** How often the playhead advances while the walkthrough is playing. */
const TICK_MS = 200;

/**
 * Guided walkthrough of the studio.
 *
 * Video-shaped rather than video: an animated mock of the real interface, with
 * a playhead, chapter markers, keyboard transport controls and a transcript.
 * Nothing is fetched, so it costs no bandwidth and works offline like the rest
 * of the app — and unlike a video it stays correct when the UI changes.
 */
@Component({
  selector: 'i3d-tutorial',
  imports: [Icon, ButtonDirective, TutorialStage],
  templateUrl: './tutorial.html',
  styleUrl: './tutorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'i3d-tutorial',
    tabindex: '0',
    role: 'group',
    'aria-roledescription': 'walkthrough',
    '[attr.aria-label]': '"Interactive guide: how to use the studio"',
    '(keydown)': 'onKeydown($event)',
  },
})
export class Tutorial {
  private readonly destroyRef = inject(DestroyRef);

  protected readonly steps = TUTORIAL_STEPS;

  private readonly indexState = signal(0);
  private readonly playingState = signal(false);
  private readonly elapsedState = signal(0);
  private readonly transcriptOpen = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly index = this.indexState.asReadonly();
  protected readonly playing = this.playingState.asReadonly();
  protected readonly transcriptExpanded = this.transcriptOpen.asReadonly();

  protected readonly step = computed<TutorialStep>(() => TUTORIAL_STEPS[this.indexState()]);
  protected readonly total = TUTORIAL_STEPS.length;
  protected readonly stepNumber = computed(() => this.indexState() + 1);

  protected readonly duration = computed(() => stepDuration(this.step()));
  protected readonly progress = computed(() => Math.min(1, this.elapsedState() / this.duration()));
  protected readonly percent = computed(() => Math.round(this.progress() * 100));

  /** Elapsed time from the start of the walkthrough, for the timecode. */
  protected readonly elapsedTotal = computed(() => {
    let elapsed = 0;
    for (let i = 0; i < this.indexState(); i++) {
      elapsed += stepDuration(TUTORIAL_STEPS[i]);
    }
    return elapsed + this.elapsedState();
  });

  protected readonly totalDuration = computed(() =>
    TUTORIAL_STEPS.reduce((sum, step) => sum + stepDuration(step), 0),
  );

  /** Fraction of the whole walkthrough, for the segmented progress bar. */
  protected readonly overallPercent = computed(() =>
    Math.round(((this.indexState() + this.progress()) / this.total) * 100),
  );

  protected readonly atEnd = computed(() => this.indexState() === this.total - 1);
  /** The model only appears in the mock once generation has been covered. */
  protected readonly showMesh = computed(() => this.indexState() >= 3);

  protected readonly timecode = computed(() => formatTime(this.elapsedTotal()));
  protected readonly totalTimecode = computed(() => formatTime(this.totalDuration()));

  constructor() {
    this.destroyRef.onDestroy(() => this.#stopTimer());
  }

  protected toggle(): void {
    if (this.playingState()) {
      this.pause();
      return;
    }
    this.play();
  }

  protected play(): void {
    // Replay from the top rather than sticking on a finished last frame.
    if (this.atEnd() && this.progress() >= 1) {
      this.indexState.set(0);
      this.elapsedState.set(0);
    }

    this.playingState.set(true);
    this.#stopTimer();
    this.timer = setInterval(() => this.#tick(), TICK_MS);
  }

  protected pause(): void {
    this.playingState.set(false);
    this.#stopTimer();
  }

  protected restart(): void {
    this.pause();
    this.indexState.set(0);
    this.elapsedState.set(0);
  }

  protected next(): void {
    if (this.atEnd()) {
      this.elapsedState.set(this.duration());
      this.pause();
      return;
    }
    this.indexState.update((index) => index + 1);
    this.elapsedState.set(0);
  }

  protected previous(): void {
    if (this.indexState() === 0) {
      this.elapsedState.set(0);
      return;
    }
    this.indexState.update((index) => index - 1);
    this.elapsedState.set(0);
  }

  protected goTo(index: number): void {
    if (index < 0 || index >= this.total) {
      return;
    }
    this.indexState.set(index);
    this.elapsedState.set(0);
  }

  protected toggleTranscript(): void {
    this.transcriptOpen.update((open) => !open);
  }

  /** Arrow keys scrub, space plays and pauses — the transport a video has. */
  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowRight':
        this.next();
        break;
      case 'ArrowLeft':
        this.previous();
        break;
      case ' ':
      case 'Enter':
        this.toggle();
        break;
      case 'Home':
        this.restart();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  #tick(): void {
    const elapsed = this.elapsedState() + TICK_MS;
    if (elapsed < this.duration()) {
      this.elapsedState.set(elapsed);
      return;
    }

    if (this.atEnd()) {
      this.elapsedState.set(this.duration());
      this.pause();
      return;
    }

    this.next();
  }

  #stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
