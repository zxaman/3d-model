import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DEFAULT_PRESENTATION,
  MODE_PRESETS,
  type GenerationSettings,
} from '@core/models/generation.model';
import { estimateComplexity } from '@core/models/estimate';
import { SettingsPanel } from './settings-panel';

describe('SettingsPanel', () => {
  let fixture: ComponentFixture<SettingsPanel>;

  async function render(overrides: Partial<Record<string, boolean>> = {}) {
    fixture = TestBed.createComponent(SettingsPanel);
    const settings: GenerationSettings = MODE_PRESETS['relief'];

    fixture.componentRef.setInput('settings', settings);
    fixture.componentRef.setInput('presentation', DEFAULT_PRESENTATION);
    fixture.componentRef.setInput('estimate', estimateComplexity(settings, 1));

    for (const [key, value] of Object.entries(overrides)) {
      fixture.componentRef.setInput(key, value);
    }

    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function generateButton(host: HTMLElement): HTMLButtonElement {
    return host.querySelector('.settings__generate button') as HTMLButtonElement;
  }

  function hint(host: HTMLElement): string {
    return host.querySelector('.settings__generate-hint')?.textContent?.trim() ?? '';
  }

  it('offers a Generate action before a model exists', async () => {
    const host = await render({ hasSource: true });

    expect(generateButton(host).textContent).toContain('Generate model');
  });

  it('offers to regenerate once a model exists', async () => {
    const host = await render({ hasSource: true, hasModel: true });

    expect(generateButton(host).textContent).toContain('Regenerate model');
  });

  it('keeps the Generate action visible when live regeneration is on', async () => {
    // Regression: the trigger used to exist only in the opposite mode, buried
    // inside a collapsed section, so most users never found it at all.
    const host = await render({ hasSource: true, autoGenerate: true });

    expect(generateButton(host)).toBeTruthy();
    expect(hint(host)).toContain('Live regeneration is on');
  });

  it('stays disabled until an image is loaded', async () => {
    const host = await render({ hasSource: false });

    expect(generateButton(host).disabled).toBe(true);
    expect(hint(host)).toContain('Add an image first');
  });

  it('emits regenerate when clicked', async () => {
    const host = await render({ hasSource: true });
    const emitted: unknown[] = [];
    fixture.componentInstance.regenerate.subscribe((value) => emitted.push(value));

    generateButton(host).click();

    expect(emitted).toHaveLength(1);
  });

  it('reports progress and blocks clicks while busy', async () => {
    const host = await render({ hasSource: true, busy: true });

    expect(generateButton(host).disabled).toBe(true);
    expect(generateButton(host).textContent).toContain('Generating model');
    expect(hint(host)).toContain('web worker');
  });

  it('warns that settings have not been applied yet', async () => {
    const host = await render({ hasSource: true, hasModel: true, stale: true });

    expect(hint(host)).toContain('Settings changed');
  });

  it('reports an up-to-date model when nothing is pending', async () => {
    const host = await render({ hasSource: true, hasModel: true, stale: false });

    expect(hint(host)).toContain('Up to date');
  });
});
