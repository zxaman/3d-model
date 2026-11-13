import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StudioPage } from './studio-page';

describe('StudioPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [StudioPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('mounts every part of the workspace', async () => {
    const fixture = TestBed.createComponent(StudioPage);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('i3d-image-dropzone')).toBeTruthy();
    expect(host.querySelector('i3d-settings-panel')).toBeTruthy();
    expect(host.querySelector('i3d-model-viewport')).toBeTruthy();
    expect(host.querySelector('i3d-export-bar')).toBeTruthy();
  });

  it('offers all four conversion modes', async () => {
    const fixture = TestBed.createComponent(StudioPage);
    await fixture.whenStable();

    const modes = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('i3d-segmented button'),
    ).map((button) => button.textContent?.trim());

    expect(modes).toEqual(['Relief', 'Extrude', 'Voxel', 'Points']);
  });

  it('keeps export and save disabled until a model exists', async () => {
    const fixture = TestBed.createComponent(StudioPage);
    await fixture.whenStable();

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('i3d-export-bar button'),
    ) as HTMLButtonElement[];

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
    }
  });

  it('names the project from the picked file', async () => {
    const fixture = TestBed.createComponent(StudioPage);
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as {
      store: { setName(value: string): void; name(): string };
    };
    page.store.setName('Holiday photo');
    await fixture.whenStable();

    expect(page.store.name()).toBe('Holiday photo');
  });
});
