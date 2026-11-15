import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { Object3D } from 'three';
import { SceneEngine } from '@engine/three/scene-engine';
import { PHASE_LABELS } from '@engine/workers/mesh-worker.contract';
import type {
  GenerationPhase,
  MeshStats,
  PresentationSettings,
} from '@core/models/generation.model';
import { ButtonDirective, Icon, Spinner } from '@shared/ui';
import { formatCount } from '@core/utils/format';

/**
 * three.js viewport.
 *
 * The component is the *only* place that touches the DOM; the engine owns the
 * scene graph. Everything is created in `afterNextRender` (no WebGL during SSR
 * or the first paint) and torn down in `ngOnDestroy`.
 */
@Component({
  selector: 'i3d-model-viewport',
  imports: [RouterLink, Icon, ButtonDirective, Spinner, DecimalPipe],
  templateUrl: './model-viewport.html',
  styleUrl: './model-viewport.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-viewport-host' },
})
export class ModelViewport implements OnDestroy {
  readonly object = input<Object3D | null>(null);
  readonly presentation = input.required<PresentationSettings>();
  readonly busy = input(false);
  readonly progress = input(0);
  readonly phase = input<GenerationPhase>('sampling');
  readonly stats = input<MeshStats | null>(null);
  readonly generationMs = input<number | null>(null);

  readonly autoRotateChange = output<boolean>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private engine: SceneEngine | null = null;

  /** `true` when the browser cannot provide a WebGL context. */
  readonly unsupported = signal(false);

  protected readonly phaseLabel = computed(() => PHASE_LABELS[this.phase()]);
  protected readonly formatCount = formatCount;

  constructor() {
    afterNextRender(() => {
      if (!SceneEngine.isSupported()) {
        this.unsupported.set(true);
        return;
      }

      try {
        this.engine = new SceneEngine({
          canvas: this.canvas().nativeElement,
          background: this.presentation().background,
          grid: this.presentation().grid,
          autoRotate: this.presentation().autoRotate,
        });
        this.sync();
      } catch (error) {
        // Software renderers and blocked GPU processes land here too.
        console.error('[i3d] WebGL viewport failed to start', error);
        this.engine = null;
        this.unsupported.set(true);
      }
    });

    effect(() => this.sync());
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
    this.engine = null;
  }

  /** Captures the current frame — used by the "save preview" action. */
  snapshot(): string | null {
    return this.engine?.snapshot() ?? null;
  }

  protected frame(): void {
    this.engine?.frameContent();
  }

  /**
   * Pushes every input into the engine. Idempotent, and safe to call before the
   * engine exists (WebGL setup is deferred to `afterNextRender`).
   */
  private sync(): void {
    const engine = this.engine;
    if (engine === null) {
      return;
    }

    const presentation = this.presentation();

    // Read every reactive input so the effect tracks them all.
    const object = this.object();
    if (engine.content !== object) {
      engine.setContent(object);
      if (object !== null) {
        engine.frameContent();
      }
    }

    engine.setBackground(presentation.background);
    engine.setGrid(presentation.grid);
    engine.setAutoRotate(presentation.autoRotate);
  }
}
