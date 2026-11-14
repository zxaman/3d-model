import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'studio',
  },
  {
    path: 'studio',
    title: 'Studio · Image → 3D',
    loadComponent: () => import('@features/studio/studio-page').then((m) => m.StudioPage),
  },
  {
    path: 'gallery',
    title: 'Gallery · Image → 3D',
    loadComponent: () => import('@features/gallery/gallery-page').then((m) => m.GalleryPage),
  },
  {
    path: 'guide',
    title: 'How it works · Image → 3D',
    loadComponent: () => import('@features/guide/guide-page').then((m) => m.GuidePage),
  },
  {
    path: '**',
    redirectTo: 'studio',
  },
];
