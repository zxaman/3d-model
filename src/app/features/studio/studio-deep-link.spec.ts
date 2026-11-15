import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StudioPage } from './studio-page';

/**
 * The gallery links to `/studio?projectId=<project>`; the studio reopens that
 * project from local storage.
 *
 * These checks exist because router input binding matches query params to
 * inputs by name and fails silently when they disagree — the gallery once
 * linked with `?id=` against an input called `projectId`, and "Open" quietly
 * went to an empty studio.
 */
describe('StudioPage deep link', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'studio', component: StudioPage }], withComponentInputBinding()),
      ],
    });
  });

  it('binds the projectId query param to the project input', async () => {
    const harness = await RouterTestingHarness.create('/studio?projectId=project-42');
    const page = harness.routeDebugElement?.componentInstance as StudioPage;

    expect(page.projectId()).toBe('project-42');
  });

  it('runs without a query param', async () => {
    const harness = await RouterTestingHarness.create('/studio');
    const page = harness.routeDebugElement?.componentInstance as StudioPage;

    expect(page.projectId()).toBeUndefined();
  });
});
