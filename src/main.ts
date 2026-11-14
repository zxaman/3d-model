import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  // The app failed before Angular's error listeners were wired up — surface it
  // instead of leaving the user with an empty screen.
  console.error('[i3d] application bootstrap failed', error);
  const root = document.querySelector('i3d-root');
  if (root) {
    root.textContent = 'The studio failed to start. Please reload the page.';
  }
});
