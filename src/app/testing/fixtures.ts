import type { ProjectDraft } from '@core/models/project.model';
import { DEFAULT_PRESENTATION, MODE_PRESETS } from '@core/models/generation.model';

/**
 * Shared test fixtures.
 *
 * Only ever imported from `*.spec.ts`, so it never reaches the application
 * bundle.
 */
export function projectDraft(overrides: Partial<ProjectDraft> = {}): ProjectDraft {
  return {
    id: 'project-1',
    name: 'Test model',
    mode: 'relief',
    thumbnail: 'data:image/png;base64,AAA',
    imageDataUrl: 'data:image/png;base64,AAAA',
    width: 640,
    height: 480,
    settings: { ...MODE_PRESETS['relief'], resolution: 128 },
    presentation: DEFAULT_PRESENTATION,
    vertices: 100,
    triangles: 180,
    generationMs: 42,
    bytes: 2048,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}
