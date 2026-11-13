import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

/**
 * Smoke test for the shell: it must boot, expose navigation to every route and
 * reflect the persisted theme on the root element.
 */
describe('App shell', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.dataset['theme'] = 'dark';

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the brand and the three navigation links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const links = host.querySelectorAll('.app-nav a');

    expect(host.querySelector('.app-brand__name')?.textContent).toContain('3D');
    expect(Array.from(links).map((link) => link.textContent?.trim())).toEqual([
      'Studio',
      'Gallery',
      'How it works',
    ]);
  });

  it('applies the stored theme to the document root', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('offers a skip link for keyboard users', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const skip = (fixture.nativeElement as HTMLElement).querySelector('.app-skip');
    expect(skip?.getAttribute('href')).toBe('#main');
  });
});
