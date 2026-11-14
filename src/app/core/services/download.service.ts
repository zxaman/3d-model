import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/** Turns any of the export payloads into a file the browser will save. */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly document = inject(DOCUMENT);

  saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoking immediately can cancel the download in Safari; one frame is enough.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  saveText(text: string, filename: string, type = 'text/plain'): void {
    this.saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
  }

  saveDataUrl(dataUrl: string, filename: string): void {
    const anchor = this.document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  /** `My Photo!.jpg` → `my-photo.jpg` */
  toSlug(value: string, fallback = 'model'): string {
    const slug = value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);

    return slug.length > 0 ? slug : fallback;
  }
}
