import { Injectable, computed, signal } from '@angular/core';
import { measureBytes, STORAGE_PREFIX } from './storage-keys';

/** Thrown when the browser refuses a write because the origin is out of quota. */
export class StorageQuotaError extends Error {
  constructor(
    readonly key: string,
    readonly attemptedBytes: number,
  ) {
    super(`Not enough local storage to save "${key}" (${Math.round(attemptedBytes / 1024)} KB).`);
    this.name = 'StorageQuotaError';
  }
}

export interface StorageUsage {
  readonly bytes: number;
  readonly recordCount: number;
  /** Browsers typically allow ~5 MB per origin; used to draw the quota meter. */
  readonly budgetBytes: number;
}

/** Nominal per-origin budget used for the usage meter. */
export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22
  );
}

/**
 * Thin, typed adapter over `localStorage`.
 *
 * Responsibilities:
 *  - fall back to an in-memory map when storage is unavailable (Safari private
 *    mode, disabled cookies, SSR) so the app still runs, just without persistence;
 *  - translate quota failures into a domain error the UI can act on;
 *  - keep a running byte count so the shell can show a storage meter.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  #backing: Storage | null | undefined;
  #memory = new Map<string, string>();
  #revision = signal(0);

  readonly usage = computed<StorageUsage>(() => {
    this.#revision(); // recompute whenever a write happens
    let bytes = 0;
    let recordCount = 0;

    for (const key of this.keys()) {
      const value = this.#read(key);
      if (value === null) {
        continue;
      }
      bytes += measureBytes(key, value);
      recordCount++;
    }

    return { bytes, recordCount, budgetBytes: STORAGE_BUDGET_BYTES };
  });

  /** `false` when running on the in-memory fallback (changes are session-only). */
  get persistent(): boolean {
    return this.#resolve() !== null;
  }

  get<T>(key: string): T | null {
    const raw = this.#read(key);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted entry: drop it rather than letting it poison every read.
      this.remove(key);
      return null;
    }
  }

  set(key: string, value: unknown): void {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw new TypeError(`Value for "${key}" is not serialisable.`);
    }

    const backing = this.#resolve();
    if (backing === null) {
      this.#memory.set(key, serialized);
      this.#revision.update((n) => n + 1);
      return;
    }

    try {
      backing.setItem(key, serialized);
      this.#revision.update((n) => n + 1);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new StorageQuotaError(key, measureBytes(key, serialized));
      }
      // Any other failure (security policy, disabled storage) degrades to memory.
      this.#backing = null;
      this.#memory.set(key, serialized);
      this.#revision.update((n) => n + 1);
    }
  }

  remove(key: string): void {
    const backing = this.#resolve();
    backing?.removeItem(key);
    this.#memory.delete(key);
    this.#revision.update((n) => n + 1);
  }

  keys(prefix = STORAGE_PREFIX): readonly string[] {
    const backing = this.#resolve();
    const keys = new Set<string>();

    if (backing !== null) {
      for (let i = 0; i < backing.length; i++) {
        const key = backing.key(i);
        if (key !== null && key.startsWith(prefix)) {
          keys.add(key);
        }
      }
    }

    for (const key of this.#memory.keys()) {
      if (key.startsWith(prefix)) {
        keys.add(key);
      }
    }

    return [...keys].sort();
  }

  /** Deletes every key owned by this app, optionally limited to a prefix. */
  clear(prefix = STORAGE_PREFIX): void {
    for (const key of this.keys(prefix)) {
      this.remove(key);
    }
  }

  #resolve(): Storage | null {
    if (this.#backing !== undefined) {
      return this.#backing;
    }

    try {
      const probe = '__i3d_probe__';
      globalThis.localStorage.setItem(probe, '1');
      globalThis.localStorage.removeItem(probe);
      this.#backing = globalThis.localStorage;
    } catch (error) {
      // A quota failure means storage works — it is simply full. Keep using it so
      // writes raise StorageQuotaError, which the UI can explain; anything else
      // (private mode, disabled cookies) means storage is unusable, so fall back.
      this.#backing = isQuotaError(error) ? globalThis.localStorage : null;
    }

    return this.#backing;
  }

  #read(key: string): string | null {
    const backing = this.#resolve();
    if (backing === null) {
      return this.#memory.get(key) ?? null;
    }
    const value = backing.getItem(key);
    return value === null ? (this.#memory.get(key) ?? null) : value;
  }
}
