import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace, Texture } from 'three';
import type { ImageSource } from '../../core/services/image.service';

/** Builds a colour-space-correct texture from a decoded image or canvas. */
export function createTexture(source: ImageSource, anisotropy = 4): Texture {
  const texture =
    typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement
      ? new CanvasTexture(source)
      : new Texture(source);

  // The source is a photo, so it is sRGB; three converts to linear internally.
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;

  return texture;
}
