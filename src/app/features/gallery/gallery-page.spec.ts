import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectRepository } from '@core/data/project.repository';
import { NotificationService } from '@core/services/notification.service';
import { projectDraft } from '@app/testing/fixtures';
import { GalleryPage } from './gallery-page';

describe('GalleryPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [GalleryPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(GalleryPage);
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('shows an empty state when nothing is saved', async () => {
    const { fixture, host } = render();
    await fixture.whenStable();

    expect(host.querySelector('i3d-empty-state')).toBeTruthy();
    expect(host.querySelector('i3d-project-card')).toBeNull();
  });

  it('renders one card per project, newest first', async () => {
    const repository = TestBed.inject(ProjectRepository);
    repository.save(projectDraft({ id: 'old', name: 'Older', updatedAt: 1000 }));
    repository.save(projectDraft({ id: 'new', name: 'Newer', updatedAt: 2000 }));

    const { fixture, host } = render();
    await fixture.whenStable();

    const names = Array.from(host.querySelectorAll('.project-card__name')).map((element) =>
      element.textContent?.trim(),
    );

    expect(names).toEqual(['Newer', 'Older']);
  });

  it('deletes a project and restores it from the undo action', async () => {
    const repository = TestBed.inject(ProjectRepository);
    const notifications = TestBed.inject(NotificationService);
    repository.save(projectDraft());

    const { fixture, host } = render();
    await fixture.whenStable();

    const deleteButton = Array.from(host.querySelectorAll('.project-card__actions button')).at(
      -1,
    ) as HTMLButtonElement;
    deleteButton.click();
    await fixture.whenStable();

    expect(repository.projects()).toHaveLength(0);

    const toast = notifications.toasts()[0];
    expect(toast?.action?.label).toBe('Undo');

    toast?.action?.run();
    expect(repository.projects()).toHaveLength(1);
    expect(repository.load('project-1')?.name).toBe('Test model');
  });

  it('renames a project through the repository', async () => {
    const repository = TestBed.inject(ProjectRepository);
    repository.save(projectDraft());

    const { fixture, host } = render();
    await fixture.whenStable();

    const renameButton = host.querySelector(
      '.project-card__actions button[aria-label^="Rename"]',
    ) as HTMLButtonElement;
    renameButton.click();
    await fixture.whenStable();

    const input = host.querySelector('.project-card__rename') as HTMLInputElement;
    expect(input).toBeTruthy();

    input.value = 'Renamed model';
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(repository.load('project-1')?.name).toBe('Renamed model');
  });
});
