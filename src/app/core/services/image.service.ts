import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Loading, decoding and downscaling of source images.
 *
 * Three resolutions are produced from every upload:
 *
 *   • **source** — capped at 2048 px, kept in memory for the session. Used as the
 *     texture and as the input for height sampling, so quality never depends on
 *     what we could afford to persist.
 *   • **stored** — capped at ~1200 px (800 px when the image has transparency,
 *     because PNG is expensive). This is the data URL written to `localStorage`
 *     and the only copy that survives a reload.
 *   • **thumbnail** — 320 px, for the gallery grid.
 */

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

export interface SourceImage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Persisted copy: a data URL small enough for `localStorage`. */
  readonly dataUrl: string;
  readonly thumbnail: string;
  /** Decoded bitmap used for texturing and pixel sampling. */
  readonly source: ImageSource;
  /** Approximate size of the persisted data URL, in bytes. */
  readonly bytes: number;
  readonly hasAlpha: boolean;
}

export interface PixelBuffer {
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Raised for every user-recoverable image problem (wrong type, too large, corrupt). */
export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageError';
  }
}

const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_TEXTURE_EDGE = 2048;
const MAX_STORE_EDGE = 1200;
const MAX_STORE_EDGE_ALPHA = 800;
const THUMBNAIL_EDGE = 320;
const ALPHA_CUTOFF = 250;

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly document = inject(DOCUMENT);
  #preferredMime: 'image/webp' | 'image/jpeg' | null = null;

  /** Reads a user-supplied file into a usable source image. */
  async load(file: File): Promise<SourceImage> {
    if (!file.type.startsWith('image/')) {
      throw new ImageError(`"${file.name}" is not an image file.`);
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw new ImageError('That image is larger than 40 MB — please use a smaller file.');
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await this.#decode(objectUrl);
      return this.#fromImage(image, file.name);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /** Rehydrates a source image from a persisted data URL. */
  async loadFromDataUrl(dataUrl: string, name: string): Promise<SourceImage> {
    const image = await this.#decode(dataUrl);
    return this.#fromImage(image, name, dataUrl);
  }

  /**
   * Downscales to an exact pixel grid for the mesh worker.
   *
   * The browser's high-quality resampling doubles as an anti-aliasing pass, so
   * the height field inherits it instead of aliasing on its own.
   */
  sample(source: SourceImage, width: number, height: number): PixelBuffer {
    const canvas = this.#canvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new ImageError('This browser did not provide a 2D canvas context.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source.source, 0, 0, width, height);

    return { pixels: context.getImageData(0, 0, width, height).data, width, height };
  }

  // -- Internals ------------------------------------------------------------

  async #decode(src: string): Promise<HTMLImageElement> {
    const image = this.document.createElement('img');
    image.decoding = 'async';
    image.src = src;

    try {
      if (typeof image.decode === 'function') {
        await image.decode();
      } else {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new ImageError('The image could not be decoded.'));
        });
      }
    } catch {
      throw new ImageError('That file could not be decoded as an image.');
    }

    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new ImageError('That image has no pixel dimensions and cannot be converted.');
    }

    return image;
  }

  #fromImage(image: HTMLImageElement, name: string, storedDataUrl?: string): SourceImage {
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;

    // Oversized images are downscaled once, up front: everything downstream
    // (GPU texture, height sampling, storage) then works from a sane size.
    const oversized = Math.max(naturalWidth, naturalHeight) > MAX_TEXTURE_EDGE;
    const source: ImageSource = oversized
      ? this.#rasterize(image, naturalWidth, naturalHeight, MAX_TEXTURE_EDGE, false)
      : image;

    const width = oversized ? source.width : naturalWidth;
    const height = oversized ? source.height : naturalHeight;

    let dataUrl = storedDataUrl;
    let hasAlpha: boolean;

    if (dataUrl === undefined) {
      const probe = this.#rasterize(source, width, height, MAX_STORE_EDGE, true);
      hasAlpha = this.#scanAlpha(probe);

      if (hasAlpha) {
        // Transparency has to survive: the extrude mode keys off the alpha channel.
        const alphaCanvas = this.#rasterize(source, width, height, MAX_STORE_EDGE_ALPHA, false);
        dataUrl = alphaCanvas.toDataURL('image/png');
      } else {
        dataUrl = probe.toDataURL(this.#mime(), 0.88);
      }
    } else {
      hasAlpha = this.#scanAlpha(this.#rasterize(source, width, height, 96, true));
    }

    const thumbnail = this.#rasterize(source, width, height, THUMBNAIL_EDGE, false).toDataURL(
      hasAlpha ? 'image/png' : this.#mime(),
      0.8,
    );

    return {
      name,
      width,
      height,
      dataUrl,
      thumbnail,
      source,
      bytes: estimateDataUrlBytes(dataUrl),
      hasAlpha,
    };
  }

  #rasterize(
    source: ImageSource,
    sourceWidth: number,
    sourceHeight: number,
    maxEdge: number,
    willReadFrequently: boolean,
  ): HTMLCanvasElement {
    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight, 1));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = this.#canvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently });
    if (!context) {
      throw new ImageError('This browser did not provide a 2D canvas context.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  #canvas(width: number, height: number): HTMLCanvasElement {
    const canvas = this.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /** Samples every fourth pixel — plenty to detect a transparent background. */
  #scanAlpha(canvas: HTMLCanvasElement): boolean {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return false;
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 16) {
      if ((data[i] ?? 255) < ALPHA_CUTOFF) {
        return true;
      }
    }
    return false;
  }

  #mime(): 'image/webp' | 'image/jpeg' {
    if (this.#preferredMime !== null) {
      return this.#preferredMime;
    }

    try {
      const probe = this.#canvas(1, 1);
      const supported = probe.toDataURL('image/webp').startsWith('data:image/webp');
      this.#preferredMime = supported ? 'image/webp' : 'image/jpeg';
    } catch {
      this.#preferredMime = 'image/jpeg';
    }

    return this.#preferredMime;
  }
}

/** Base64 encodes 3 bytes into 4 characters; the `data:` prefix is overhead. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const payload = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length;
  return Math.round(payload * 0.75);
}
