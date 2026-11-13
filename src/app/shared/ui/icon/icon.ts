import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type IconName =
  | 'upload'
  | 'image'
  | 'cube'
  | 'grid'
  | 'points'
  | 'layers'
  | 'download'
  | 'save'
  | 'trash'
  | 'copy'
  | 'camera'
  | 'sun'
  | 'moon'
  | 'sliders'
  | 'sparkles'
  | 'rotate'
  | 'target'
  | 'close'
  | 'check'
  | 'warning'
  | 'info'
  | 'refresh'
  | 'folder'
  | 'book'
  | 'chevron-right'
  | 'wireframe';

/**
 * 24 × 24 stroke icons, inlined so the app ships zero icon network requests.
 * Paths are drawn on a 24-unit grid with a 1.6 stroke.
 */
const PATHS: Readonly<Record<IconName, string>> = {
  upload:
    'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16',
  image:
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Zm0 10.5 4.5-4.5 3.5 3.5 3-3 5 5M9 9.5h.01',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m0 0 8-4.5M12 12 4 7.5M12 12v9',
  grid: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
  points: 'M6 7h.01M12 5h.01M18 8h.01M8 12h.01M14 11h.01M19 14h.01M10 17h.01M16 18h.01M13 14h.01',
  layers: 'M12 3l9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5',
  download: 'M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 20h16',
  save: 'M5 4h11l3 3v13H5V4Zm3 0v5h7V4M8 20v-6h8v6',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6m4-6v6',
  copy: 'M9 9h10v11H9V9Zm0 0V4h10v5M5 15V4h4',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 18v-2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10L5.6 18.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  sliders: 'M4 8h10m4 0h2M4 16h4m4 0h10M14 5.5v5M8 13.5v5',
  sparkles:
    'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Zm6.5 9.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  rotate: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  target:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 13l4.5 4.5L19 7',
  warning: 'M12 4l9 16H3l9-16Zm0 6v4m0 3h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13h.01M12 11v5',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  folder: 'M3 7h6l2 2.5h10V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7Z',
  book: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm14 0h-1v13',
  'chevron-right': 'M9 5l7 7-7 7',
  wireframe: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18M4 7.5l16 9M20 7.5l-16 9',
};

@Component({
  selector: 'i3d-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  host: {
    class: 'i3d-icon',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[attr.data-icon]': 'name()',
    '[attr.aria-hidden]': 'decorative() ? "true" : null',
    '[attr.role]': 'decorative() ? null : "img"',
    '[attr.aria-label]': 'decorative() ? null : label()',
  },
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  /** Icons next to text should stay hidden from screen readers. */
  readonly decorative = input(true);
  readonly label = input<string | null>(null);

  protected readonly path = computed(() => PATHS[this.name()] ?? '');
}
