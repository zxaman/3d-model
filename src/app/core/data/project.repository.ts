import { Injectable, computed, inject, signal } from '@angular/core';
import type { ProjectDraft, ProjectRecord, ProjectSummary } from '@core/models/project.model';
import { PROJECT_SCHEMA_VERSION } from '@core/models/project.model';
import { normalizePresentation, normalizeSettingsVersioned } from '@core/models/generation.model';
import { createId } from '@core/utils/id';
import { StorageService } from '@core/storage/storage.service';
import {
  PROJECT_INDEX_KEY,
  PROJECT_KEY_PREFIX,
  measureBytes,
  projectKey,
} from '@core/storage/storage-keys';

interface PersistedProject extends ProjectRecord {
  readonly schema: number;
}

/**
 * Persistence for projects.
 *
 * Design notes
 * ------------
 *  - The **source of truth is `image + settings`**, not the generated mesh. A
 *    model can always be rebuilt deterministically in a few hundred
 *    milliseconds, so we never spend a 5 MB quota keeping geometry alive.
 *  - The gallery index is a denormalised list of light-weight summaries, so the
 *    grid renders without parsing every record (each of which holds a data URL).
 *  - Reads are defensive: settings are re-validated on the way in and the index
 *    is reconciled against what is actually stored, so a half-written record or
 *    a schema from an older build cannot break the gallery.
 */
@Injectable({ providedIn: 'root' })
export class ProjectRepository {
  private readonly storage = inject(StorageService);

  private readonly summaries = signal<readonly ProjectSummary[]>(this.reconcileIndex());

  /** Projects, newest first. */
  readonly projects = computed(() =>
    [...this.summaries()].sort((a, b) => b.updatedAt - a.updatedAt),
  );

  readonly usage = this.storage.usage;

  readonly isPersistent = (): boolean => this.storage.persistent;

  count(): number {
    return this.summaries().length;
  }

  find(id: string): ProjectSummary | undefined {
    return this.summaries().find((project) => project.id === id);
  }

  /** Reads a full record, re-validating settings on the way in. */
  load(id: string): ProjectRecord | null {
    const stored = this.storage.get<PersistedProject>(projectKey(id));
    if (!stored) {
      return null;
    }

    return {
      ...stored,
      // The stored schema decides how lengths are interpreted: schema 1 recorded
      // them in abstract model units, schema 2 in millimetres.
      settings: normalizeSettingsVersioned(stored.settings, stored.schema),
      presentation: normalizePresentation(stored.presentation),
    };
  }

  save(draft: ProjectDraft): ProjectRecord {
    const record: ProjectRecord = { ...draft };
    this.persistRecord(record);

    this.summaries.update((list) => [...list.filter((p) => p.id !== record.id), toSummary(record)]);
    this.writeIndex();

    return record;
  }

  rename(id: string, name: string): void {
    const record = this.load(id);
    if (!record) {
      return;
    }
    const trimmed = name.trim() || record.name;
    if (trimmed === record.name) {
      return;
    }
    this.save({ ...toDraft(record), name: trimmed, updatedAt: Date.now() });
  }

  duplicate(id: string): ProjectRecord | null {
    const record = this.load(id);
    if (!record) {
      return null;
    }

    const now = Date.now();
    return this.save({
      ...toDraft(record),
      id: createId(),
      name: `${record.name} copy`,
      createdAt: now,
      updatedAt: now,
    });
  }

  remove(id: string): void {
    this.storage.remove(projectKey(id));
    this.summaries.update((list) => list.filter((project) => project.id !== id));
    this.writeIndex();
  }

  clearAll(): void {
    this.storage.clear(PROJECT_KEY_PREFIX);
    this.summaries.set([]);
    this.writeIndex();
  }

  /**
   * Writes the record, measuring the exact serialised size first so the stored
   * byte count (shown on every card) matches reality.
   *
   * A `QuotaExceededError` is propagated: silently dropping the user's other
   * projects to make room would be worse than telling them.
   */
  private persistRecord(record: ProjectRecord): void {
    const key = projectKey(record.id);
    let payload: PersistedProject = { ...record, schema: PROJECT_SCHEMA_VERSION };
    payload = { ...payload, bytes: measureBytes(key, JSON.stringify(payload)) };
    payload = { ...payload, bytes: measureBytes(key, JSON.stringify(payload)) };

    this.storage.set(key, payload);
  }

  private writeIndex(): void {
    try {
      this.storage.set(PROJECT_INDEX_KEY, this.summaries());
    } catch {
      // The index is derived data; losing it only costs a slower next load.
    }
  }

  /**
   * Rebuilds the gallery index from what is actually stored.
   *
   * Handles two failure modes without user intervention: an index pointing at
   * deleted records, and records orphaned by an index write that never landed.
   */
  private reconcileIndex(): readonly ProjectSummary[] {
    const indexed = this.storage.get<readonly ProjectSummary[]>(PROJECT_INDEX_KEY) ?? [];
    const byId = new Map<string, ProjectSummary>();

    for (const summary of indexed) {
      if (summary?.id && this.storage.get(projectKey(summary.id)) !== null) {
        byId.set(summary.id, summary);
      }
    }

    for (const key of this.storage.keys(PROJECT_KEY_PREFIX)) {
      const id = key.slice(PROJECT_KEY_PREFIX.length);
      if (byId.has(id)) {
        continue;
      }
      const stored = this.storage.get<PersistedProject>(key);
      if (!stored) {
        continue;
      }
      byId.set(
        id,
        toSummary({
          ...stored,
          settings: normalizeSettingsVersioned(stored.settings, stored.schema),
          presentation: normalizePresentation(stored.presentation),
        }),
      );
    }

    const reconciled = [...byId.values()];
    this.writeIndex();
    return reconciled;
  }
}

function toSummary(record: ProjectRecord): ProjectSummary {
  return {
    id: record.id,
    name: record.name,
    mode: record.mode,
    thumbnail: record.thumbnail,
    width: record.width,
    height: record.height,
    vertices: record.vertices,
    triangles: record.triangles,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    bytes: record.bytes,
  };
}

function toDraft(record: ProjectRecord): ProjectDraft {
  return {
    id: record.id,
    name: record.name,
    mode: record.mode,
    thumbnail: record.thumbnail,
    imageDataUrl: record.imageDataUrl,
    width: record.width,
    height: record.height,
    settings: record.settings,
    presentation: record.presentation,
    vertices: record.vertices,
    triangles: record.triangles,
    generationMs: record.generationMs,
    bytes: record.bytes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
