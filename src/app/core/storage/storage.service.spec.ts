import { TestBed } from '@angular/core/testing';
import { StorageQuotaError, StorageService } from './storage.service';
import { PROJECT_INDEX_KEY } from './storage-keys';

describe('StorageService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubLocalStorage(storage: Partial<Storage>): void {
    vi.stubGlobal('localStorage', {
      get length() {
        return 0;
      },
      key: () => null,
      getItem: () => null,
      removeItem: () => undefined,
      clear: () => undefined,
      ...storage,
    } as Storage);
  }

  it('round-trips JSON values', () => {
    const storage = TestBed.inject(StorageService);

    storage.set('i3d:v1:test', { answer: 42, nested: [1, 2] });

    expect(storage.get<{ answer: number }>('i3d:v1:test')).toEqual({ answer: 42, nested: [1, 2] });
  });

  it('returns null for missing keys', () => {
    expect(TestBed.inject(StorageService).get('i3d:v1:missing')).toBeNull();
  });

  it('drops a corrupted entry instead of failing every read', () => {
    const storage = TestBed.inject(StorageService);
    localStorage.setItem('i3d:v1:broken', '{not json');

    expect(storage.get('i3d:v1:broken')).toBeNull();
    expect(localStorage.getItem('i3d:v1:broken')).toBeNull();
  });

  it('translates quota failures into a domain error', () => {
    stubLocalStorage({
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    const storage = TestBed.inject(StorageService);

    expect(storage.persistent).toBe(true);
    expect(() => storage.set(PROJECT_INDEX_KEY, [1, 2, 3])).toThrow(StorageQuotaError);
  });

  it('falls back to memory when storage throws for another reason', () => {
    stubLocalStorage({
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    const storage = TestBed.inject(StorageService);

    storage.set('i3d:v1:memory', { ok: true });

    expect(storage.persistent).toBe(false);
    expect(storage.get('i3d:v1:memory')).toEqual({ ok: true });
  });

  it('lists, measures and clears only its own keys', () => {
    const storage = TestBed.inject(StorageService);
    localStorage.setItem('unrelated-app', 'x');

    storage.set('i3d:v1:a', 'one');
    storage.set('i3d:v1:b', 'two');

    expect(storage.keys()).toEqual(['i3d:v1:a', 'i3d:v1:b']);
    expect(storage.usage().recordCount).toBe(2);
    expect(storage.usage().bytes).toBeGreaterThan(0);
    expect(storage.usage().budgetBytes).toBeGreaterThan(storage.usage().bytes);

    storage.clear();
    expect(storage.keys()).toEqual([]);
    expect(localStorage.getItem('unrelated-app')).toBe('x');
  });

  it('tracks usage reactively', () => {
    const storage = TestBed.inject(StorageService);
    const before = storage.usage().recordCount;

    storage.set('i3d:v1:c', 'three');

    expect(storage.usage().recordCount).toBe(before + 1);
  });
});
