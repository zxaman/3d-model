/**
 * Every key this app writes to `localStorage`, in one place.
 *
 * Keeping the literal strings here (rather than inline at call sites) makes the
 * storage contract reviewable and keeps `index.html`'s pre-paint theme script in
 * sync — that script deliberately hard-codes `PREFERENCES_KEY`'s value.
 */
export const STORAGE_NAMESPACE = 'i3d';
export const STORAGE_VERSION = 'v1';
export const STORAGE_PREFIX = `${STORAGE_NAMESPACE}:${STORAGE_VERSION}:`;

export const PREFERENCES_KEY = `${STORAGE_PREFIX}preferences`;
export const PROJECT_INDEX_KEY = `${STORAGE_PREFIX}index`;
export const PROJECT_KEY_PREFIX = `${STORAGE_PREFIX}project:`;

export const projectKey = (id: string): string => `${PROJECT_KEY_PREFIX}${id}`;

/** Rough size of a persisted string in bytes — `localStorage` stores UTF-16. */
export function measureBytes(key: string, value: string): number {
  return (key.length + value.length) * 2;
}
