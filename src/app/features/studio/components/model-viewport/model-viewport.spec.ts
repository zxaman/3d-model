import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideRouter } from '@angular/router';
import { Group, Object3D } from 'three';
import { DEFAULT_PRESENTATION } from '@core/models/generation.model';
import type { ViewportEngine, ViewportEngineFactory } from '@engine/three/scene-engine';
import { VIEWPORT_ENGINE_FACTORY } from '@engine/three/scene-engine';
import { ModelViewport } from './model-viewport';

/** Records everything the component pushes at it, and nothing else. */
class FakeEngine implements ViewportEngine {
  content: Object3D | null = null;
  framed = 0;
  grid: boolean | null = null;
  background: string | null = null;
  autoRotate: boolean | null = null;

  setContent(object: Object3D | null): void {
    this.content = object;
  }
  setBackground(background: never): void {
    this.background = background;
  }
  setGrid(visible: boolean): void {
    this.grid = visible;
  }
  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
  }
  frameContent(): void {
    this.framed++;
  }
  resize(): void {
    // Nothing to lay out without a real canvas.
  }

  snapshot(): string {
    return '';
  }

  dispose(): void {
    this.content = null;
  }
}

describe('ModelViewport', () => {
  let fixture: ComponentFixture<ModelViewport>;
  let engine: FakeEngine;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ModelViewport],
      providers: [
        provideRouter([]),
        {
          provide: VIEWPORT_ENGINE_FACTORY,
          useValue: {
            isSupported: () => true,
            create: () => engine,
          } satisfies ViewportEngineFactory,
        },
      ],
    });

    engine = new FakeEngine();
    fixture = TestBed.createComponent(ModelViewport);
    fixture.componentRef.setInput('presentation', DEFAULT_PRESENTATION);
    await fixture.whenStable();
  });

  it('hands the model to the engine when it arrives', async () => {
    // Regression: the sync effect used to bail out before reading the `object`
    // input, so it registered no dependency and never ran again. The model was
    // built and stored, but the viewport stayed empty with no error anywhere.
    const model = new Group();
    fixture.componentRef.setInput('object', model);
    await fixture.whenStable();

    expect(engine.content).toBe(model);
  });

  it('replaces the model when a new one is generated', async () => {
    const first = new Group();
    const second = new Group();

    fixture.componentRef.setInput('object', first);
    await fixture.whenStable();
    fixture.componentRef.setInput('object', second);
    await fixture.whenStable();

    expect(engine.content).toBe(second);
  });

  it('frames the model once, not on every change detection pass', async () => {
    const model = new Group();
    fixture.componentRef.setInput('object', model);
    await fixture.whenStable();

    fixture.detectChanges();
    fixture.detectChanges();

    expect(engine.framed).toBe(1);
  });

  it('keeps pushing presentation changes through', async () => {
    fixture.componentRef.setInput('presentation', { ...DEFAULT_PRESENTATION, grid: false });
    await fixture.whenStable();

    expect(engine.grid).toBe(false);
  });

  it('reports an unsupported browser instead of leaving a blank canvas', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ModelViewport],
      providers: [
        provideRouter([]),
        {
          provide: VIEWPORT_ENGINE_FACTORY,
          useValue: {
            isSupported: () => false,
            create: () => engine,
          } satisfies ViewportEngineFactory,
        },
      ],
    });

    const unsupportedFixture = TestBed.createComponent(ModelViewport);
    unsupportedFixture.componentRef.setInput('presentation', DEFAULT_PRESENTATION);
    await unsupportedFixture.whenStable();

    expect(unsupportedFixture.componentInstance.unsupported()).toBe(true);
    expect((unsupportedFixture.nativeElement as HTMLElement).textContent).toContain(
      '3D preview unavailable',
    );
  });
});
