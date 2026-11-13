import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  DEFAULT_PRESENTATION,
  normalizePresentation,
  type PresentationSettings,
  type ViewportBackground,
} from '@core/models/generation.model';
import { StorageService } from '@core/storage/storage.service';
import { PREFERENCES_KEY } from '@core/storage/storage-keys';

export type ThemePreference = 'dark' | 'light';

export interface Preferences {
  readonly theme: ThemePreference;
  readonly presentation: PresentationSettings;
  /** Regenerate the model as soon as a slider moves (debounced upstream). */
  readonly autoGenerate: boolean;
  readonly lastProjectId: string | null;
}

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  presentation: DEFAULT_PRESENTATION,
  autoGenerate: true,
  lastProjectId: null,
};

function readInitialTheme(document: Document): ThemePreference {
  // `index.html` already resolved the theme before first paint — reuse it so the
  // service never disagrees with what the user is looking at.
  const applied = document.documentElement.dataset['theme'];
  return applied === 'light' ? 'light' : 'dark';
}

/**
 * User preferences: theme, viewport presentation and a few studio behaviours.
 *
 * The whole blob is one `localStorage` entry; unknown or corrupt values fall
 * back to defaults, so a stale record from an older build cannot break the app.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  private readonly state = signal<Preferences>(this.load());

  readonly preferences = this.state.asReadonly();
  readonly theme = computed(() => this.state().theme);
  readonly presentation = computed(() => this.state().presentation);
  readonly autoGenerate = computed(() => this.state().autoGenerate);
  readonly lastProjectId = computed(() => this.state().lastProjectId);

  constructor() {
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.state().theme;
    });

    effect(() => {
      try {
        this.storage.set(PREFERENCES_KEY, this.state());
      } catch {
        // Preferences are non-critical — never let a full quota break the app.
      }
    });
  }

  patch(patch: Partial<Preferences>): void {
    this.state.update((current) => ({ ...current, ...patch }));
  }

  setTheme(theme: ThemePreference): void {
    this.patch({ theme });
  }

  toggleTheme(): void {
    this.patch({ theme: this.state().theme === 'dark' ? 'light' : 'dark' });
  }

  patchPresentation(patch: Partial<PresentationSettings>): void {
    this.state.update((current) => ({
      ...current,
      presentation: { ...current.presentation, ...patch },
    }));
  }

  setBackground(background: ViewportBackground): void {
    this.patchPresentation({ background });
  }

  private load(): Preferences {
    const stored = this.storage.get<Partial<Preferences>>(PREFERENCES_KEY);
    const theme =
      stored?.theme === 'light' || stored?.theme === 'dark'
        ? stored.theme
        : readInitialTheme(this.document);

    return {
      ...DEFAULT_PREFERENCES,
      theme,
      presentation: normalizePresentation(stored?.presentation),
      autoGenerate: typeof stored?.autoGenerate === 'boolean' ? stored.autoGenerate : true,
      lastProjectId: typeof stored?.lastProjectId === 'string' ? stored.lastProjectId : null,
    };
  }
}
