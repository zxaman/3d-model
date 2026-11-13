import { TestBed } from '@angular/core/testing';
import { ProjectRepository } from './project.repository';
import { StorageService } from '@core/storage/storage.service';
import { MODE_PRESETS } from '@core/models/generation.model';
import { projectDraft as draft } from '@app/testing/fixtures';

function repository(): ProjectRepository {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(ProjectRepository);
}

describe('ProjectRepository', () => {
  beforeEach(() => localStorage.clear());

  it('saves and reads a project back', () => {
    const repo = repository();
    repo.save(draft());

    const loaded = repo.load('project-1');

    expect(loaded?.name).toBe('Test model');
    expect(loaded?.settings.resolution).toBe(128);
    expect(repo.projects()).toHaveLength(1);
  });

  it('re-validates settings that were tampered with in storage', () => {
    const repo = repository();
    repo.save(draft({ settings: { ...MODE_PRESETS['relief'], resolution: 9999 } }));

    // 9999 is clamped back into the supported range on the way out.
    expect(repo.load('project-1')?.settings.resolution).toBe(512);
  });

  it('survives a record written by an older build', () => {
    const storage = TestBed.inject(StorageService);
    storage.set('i3d:v1:project:legacy', {
      ...draft({ id: 'legacy' }),
      schema: 0,
      settings: { mode: 'nonsense' },
    });

    const recovered = repository().load('legacy');
    expect(recovered?.settings.mode).toBe('relief');
  });

  it('renames, duplicates and removes projects', () => {
    const repo = repository();
    repo.save(draft());

    repo.rename('project-1', 'Renamed');
    expect(repo.load('project-1')?.name).toBe('Renamed');

    const copy = repo.duplicate('project-1');
    expect(copy?.name).toBe('Renamed copy');
    expect(repo.projects()).toHaveLength(2);

    repo.remove('project-1');
    expect(repo.projects()).toHaveLength(1);
    expect(repo.load('project-1')).toBeNull();
  });

  it('ignores unknown ids', () => {
    const repo = repository();
    expect(repo.remove('nope')).toBeUndefined();
    expect(repo.duplicate('nope')).toBeNull();
    expect(repo.rename('nope', 'x')).toBeUndefined();
  });

  it('sorts newest first and clears everything', () => {
    const repo = repository();
    repo.save(draft({ id: 'a', updatedAt: 1000 }));
    repo.save(draft({ id: 'b', updatedAt: 3000 }));
    repo.save(draft({ id: 'c', updatedAt: 2000 }));

    expect(repo.projects().map((project) => project.id)).toEqual(['b', 'c', 'a']);

    repo.clearAll();
    expect(repo.projects()).toEqual([]);
    expect(repo.count()).toBe(0);
  });

  it('rebuilds the index when a record exists without one', () => {
    const storage = TestBed.inject(StorageService);
    storage.set('i3d:v1:project:orphan', { ...draft({ id: 'orphan' }), schema: 1 });

    const repo = repository();

    expect(repo.projects().map((project) => project.id)).toEqual(['orphan']);
  });

  it('drops index entries whose record is gone', () => {
    const repo = repository();
    repo.save(draft({ id: 'kept' }));
    repo.save(draft({ id: 'doomed' }));

    TestBed.inject(StorageService).remove('i3d:v1:project:doomed');

    expect(
      repository()
        .projects()
        .map((project) => project.id),
    ).toEqual(['kept']);
  });
});
