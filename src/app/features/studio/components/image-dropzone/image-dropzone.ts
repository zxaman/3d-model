import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonDirective, Icon } from '@shared/ui';

/**
 * Image intake: click, drag & drop, and (via the page) paste.
 *
 * The visible control is a real `<button>`; the `<input type="file">` stays out
 * of the layout but is never `display: none`, so it remains reachable to
 * assistive technology and to synthetic clicks.
 */
@Component({
  selector: 'i3d-image-dropzone',
  imports: [Icon, ButtonDirective],
  templateUrl: './image-dropzone.html',
  styleUrl: './image-dropzone.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-dragging]': 'dragging()',
    '(dragenter)': 'onDragEnter($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class ImageDropzone {
  /** Compact variant shown once an image is loaded. */
  readonly compact = input(false);
  readonly fileName = input<string | null>(null);
  readonly preview = input<string | null>(null);
  readonly dimensions = input<string>('');

  readonly fileSelected = output<File>();
  readonly clear = output<void>();

  protected readonly dragging = signal(false);

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');
  private dragDepth = 0;

  protected openPicker(): void {
    this.picker().nativeElement.click();
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.fileSelected.emit(file);
    }
    // Reset so picking the same file twice fires another `change`.
    input.value = '';
  }

  protected onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth++;
    this.dragging.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    // Without this the browser navigates to the dropped file instead.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);

    const file = firstImageFile(event.dataTransfer);
    if (file) {
      this.fileSelected.emit(file);
    }
  }

  /** Exposed so the page can reuse the same validation for pasted files. */
  static accepts(file: File): boolean {
    return file.type.startsWith('image/');
  }
}

/** Prefers a real image file, and falls back to a dragged URL's data. */
function firstImageFile(transfer: DataTransfer | null): File | null {
  if (transfer === null) {
    return null;
  }

  for (const item of Array.from(transfer.files)) {
    if (item.type.startsWith('image/')) {
      return item;
    }
  }
  return null;
}
