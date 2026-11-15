import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GuidePage } from './guide-page';

describe('GuidePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuidePage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('mounts the walkthrough player', async () => {
    const fixture = TestBed.createComponent(GuidePage);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('i3d-tutorial')).toBeTruthy();
  });

  it('anchors the walkthrough so it can be deep-linked', async () => {
    const fixture = TestBed.createComponent(GuidePage);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('#how-to-use')).toBeTruthy();
  });

  it('lists every step in writing as well', async () => {
    const fixture = TestBed.createComponent(GuidePage);
    await fixture.whenStable();

    const headings = Array.from(
      fixture.nativeElement.querySelectorAll('.guide__steps h3'),
    ) as HTMLElement[];

    // Seven walkthrough steps, five pipeline steps, four printing steps.
    expect(headings.length).toBe(16);
  });
});
