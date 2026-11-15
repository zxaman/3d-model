import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL_STEPS, stepDuration } from './tutorial-steps';
import { Tutorial } from './tutorial';

/**
 * The player is driven entirely through its rendered controls — transport
 * buttons, chapter markers and the keyboard — so the tests cover the same
 * surface a user has, and the component keeps its members private.
 */
describe('Tutorial', () => {
  const LAST = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1];

  let fixture: ComponentFixture<Tutorial>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Tutorial] }).compileComponents();
    fixture = TestBed.createComponent(Tutorial);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    // Only the playback tests install fake timers: enabling them for the whole
    // suite would stall `whenStable()`, which waits on the scheduler.
    vi.useRealTimers();
  });

  /** Transport buttons are addressed the way a user finds them: by label. */
  function transport(label: string): HTMLButtonElement {
    return host.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
  }

  function chapter(index: number): HTMLButtonElement {
    return host.querySelectorAll('.tut__chapter')[index] as HTMLButtonElement;
  }

  async function click(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  async function press(key: string): Promise<void> {
    host.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await fixture.whenStable();
  }

  function title(): string {
    return host.querySelector('.tut__title')?.textContent?.trim() ?? '';
  }

  function counter(): string {
    return host.querySelector('.tut__counter')?.textContent?.trim() ?? '';
  }

  function isPlaying(): boolean {
    return host.querySelector('[aria-label="Pause walkthrough"]') !== null;
  }

  function meshVisible(): boolean {
    return host.querySelector('.tut__mesh')?.classList.contains('is-on') ?? false;
  }

  it('starts on the first step', () => {
    expect(title()).toBe(TUTORIAL_STEPS[0].title);
    expect(counter()).toContain(`Step 1 of ${TUTORIAL_STEPS.length}`);
  });

  it('highlights the region the step is talking about', () => {
    const stage = host.querySelector('.tut__stage');

    expect(stage?.getAttribute('data-focus')).toBe(TUTORIAL_STEPS[0].region);
  });

  it('steps forward and back', async () => {
    await click(transport('Next step'));
    expect(title()).toBe(TUTORIAL_STEPS[1].title);

    await click(transport('Previous step'));
    expect(title()).toBe(TUTORIAL_STEPS[0].title);
  });

  it('never steps past either end', async () => {
    for (let i = 0; i < TUTORIAL_STEPS.length + 3; i++) {
      await click(transport('Next step'));
    }
    expect(title()).toBe(LAST.title);

    for (let i = 0; i < TUTORIAL_STEPS.length + 3; i++) {
      await click(transport('Previous step'));
    }
    expect(title()).toBe(TUTORIAL_STEPS[0].title);
  });

  it('jumps from the chapter markers', async () => {
    await click(chapter(3));

    expect(title()).toBe(TUTORIAL_STEPS[3].title);
  });

  it('advances on its own while playing', async () => {
    // Fake timers must exist before `play()` creates the interval — they only
    // capture timers made after installation. Clicks are then flushed with
    // `detectChanges()`, because `whenStable()` waits on a frozen scheduler.
    vi.useFakeTimers();

    transport('Play walkthrough').click();
    fixture.detectChanges();
    expect(isPlaying()).toBe(true);

    await vi.advanceTimersByTimeAsync(stepDuration(TUTORIAL_STEPS[0]) + 600);
    fixture.detectChanges();
    expect(title()).toBe(TUTORIAL_STEPS[1].title);

    transport('Pause walkthrough').click();
    fixture.detectChanges();
    expect(isPlaying()).toBe(false);

    await vi.advanceTimersByTimeAsync(stepDuration(TUTORIAL_STEPS[1]) + 600);
    expect(title()).toBe(TUTORIAL_STEPS[1].title);
  });

  it('stops at the end of the run', async () => {
    await click(chapter(TUTORIAL_STEPS.length - 1));

    vi.useFakeTimers();
    transport('Play walkthrough').click();
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(stepDuration(LAST) + 600);
    fixture.detectChanges();

    expect(isPlaying()).toBe(false);
    expect(title()).toBe(LAST.title);
  });

  it('only shows the model once generation has been covered', async () => {
    expect(meshVisible()).toBe(false);

    await click(chapter(3));

    expect(meshVisible()).toBe(true);
  });

  it('moves with the arrow keys', async () => {
    await press('ArrowRight');
    expect(title()).toBe(TUTORIAL_STEPS[1].title);

    await press('ArrowLeft');
    expect(title()).toBe(TUTORIAL_STEPS[0].title);
  });

  it('restarts from the keyboard', async () => {
    await click(chapter(4));

    await press('Home');

    expect(title()).toBe(TUTORIAL_STEPS[0].title);
  });

  it('opens a transcript of every step', async () => {
    await click(host.querySelector('.tut__transcript-toggle') as HTMLButtonElement);

    expect(host.querySelectorAll('.tut__transcript li')).toHaveLength(TUTORIAL_STEPS.length);
  });
});
