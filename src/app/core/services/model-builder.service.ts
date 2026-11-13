import { Injectable } from '@angular/core';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { MeshPayload } from '@engine/geometry/mesh-payload';
import { createTexture } from '@engine/three/texture-factory';
import type { PresentationSettings } from '@core/models/generation.model';
import { parseHexColor } from '@core/utils/color';
import type { ImageSource } from './image.service';

export interface ModelBuildInput {
  readonly payload: MeshPayload;
  readonly source: ImageSource | null;
  readonly presentation: PresentationSettings;
  readonly pointSize: number;
  readonly anisotropy?: number;
}

/**
 * A built model plus the operations that must stay available for its lifetime:
 * restyling without a rebuild, and disposal of every GPU resource it owns.
 */
export interface ModelHandle {
  readonly object: Object3D;
  readonly payload: MeshPayload;
  applyPresentation(presentation: PresentationSettings, pointSize: number): void;
  dispose(): void;
}

const CLAY_COLOR = 0xb8b2a8;

/**
 * Turns a raw {@link MeshPayload} into a three.js object.
 *
 * The geometry always carries its colour attribute (it costs little and lets the
 * user switch to vertex colours without regenerating), but only one shading path
 * is active at a time — a material with both a map and vertex colours produces
 * muddy results and confused exports.
 */
@Injectable({ providedIn: 'root' })
export class ModelBuilderService {
  build(input: ModelBuildInput): ModelHandle {
    const { payload, presentation, pointSize } = input;
    const geometry = toGeometry(payload);
    const canTexture = payload.uvs !== null && input.source !== null;
    const texture = canTexture ? createTexture(input.source!, input.anisotropy ?? 4) : null;

    let material: Material;
    if (payload.mode === 'points') {
      material = new PointsMaterial({
        size: pointSize,
        sizeAttenuation: true,
        vertexColors: payload.colors !== null,
      });
    } else {
      material = new MeshStandardMaterial({
        flatShading: payload.indices === null,
        side: payload.watertight ? FrontSide : DoubleSide,
      });
    }

    const object: Object3D =
      payload.mode === 'points' ? new Points(geometry, material) : new Mesh(geometry, material);
    object.name = `i3d-${payload.mode}`;
    object.castShadow = payload.mode !== 'points';
    object.receiveShadow = payload.mode !== 'points';

    const handle: ModelHandle = {
      object,
      payload,
      applyPresentation: (next, nextPointSize) => {
        applyPresentation(material, next, payload, texture, nextPointSize);
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
        texture?.dispose();
      },
    };

    handle.applyPresentation(presentation, pointSize);
    return handle;
  }
}

function toGeometry(payload: MeshPayload): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(payload.positions, 3));

  if (payload.normals !== null) {
    geometry.setAttribute('normal', new BufferAttribute(payload.normals, 3));
  }
  if (payload.colors !== null) {
    geometry.setAttribute('color', new BufferAttribute(payload.colors, 3));
  }
  if (payload.uvs !== null) {
    geometry.setAttribute('uv', new BufferAttribute(payload.uvs, 2));
  }
  if (payload.indices !== null) {
    geometry.setIndex(new BufferAttribute(payload.indices, 1));
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `i3d-geometry-${payload.mode}`;
  return geometry;
}

function applyPresentation(
  material: Material,
  presentation: PresentationSettings,
  payload: MeshPayload,
  texture: Texture | null,
  pointSize: number,
): void {
  if (material instanceof PointsMaterial) {
    material.size = pointSize;
    material.vertexColors = payload.colors !== null;
    material.needsUpdate = true;
    return;
  }

  if (!(material instanceof MeshStandardMaterial)) {
    return;
  }

  const wantsTexture = presentation.material === 'textured' && texture !== null;
  const canUseVertexColors = payload.colors !== null;

  material.map = wantsTexture ? texture : null;
  material.vertexColors =
    !wantsTexture && (presentation.material === 'vertex-color' ? canUseVertexColors : false);

  if (presentation.material === 'clay') {
    material.color.setHex(CLAY_COLOR);
    material.roughness = 0.85;
    material.metalness = 0;
  } else {
    const hex = parseHexColor(presentation.solidColor);
    material.color.setRGB(hex.r, hex.g, hex.b, undefined);
    material.roughness = presentation.roughness;
    material.metalness = presentation.metalness;
  }

  // Solid colours and vertex colours both render the raw albedo, so a textured
  // or vertex-coloured model must not tint it.
  if (wantsTexture || material.vertexColors) {
    material.color.setHex(0xffffff);
  }

  material.wireframe = presentation.wireframe;
  material.side = payload.watertight ? FrontSide : DoubleSide;
  material.needsUpdate = true;
}
