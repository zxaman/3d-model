import { Injectable } from '@angular/core';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { Object3D } from 'three';
import type { GenerationMode } from '@core/models/generation.model';

export type ExportFormat = 'glb' | 'obj' | 'stl' | 'ply';

export interface ExportDescriptor {
  readonly id: ExportFormat;
  readonly label: string;
  readonly extension: string;
  readonly hint: string;
  /** Modes the format can represent meaningfully. */
  readonly modes: readonly GenerationMode[];
}

export const EXPORT_FORMATS: readonly ExportDescriptor[] = [
  {
    id: 'glb',
    label: 'GLB',
    extension: 'glb',
    hint: 'glTF binary — textures, vertex colours, web & game engines',
    modes: ['relief', 'extrude', 'voxel', 'points'],
  },
  {
    id: 'obj',
    label: 'OBJ',
    extension: 'obj',
    hint: 'Wavefront OBJ — universally supported, no colour data',
    modes: ['relief', 'extrude', 'voxel'],
  },
  {
    id: 'stl',
    label: 'STL',
    extension: 'stl',
    hint: 'Binary STL — the format slicers expect',
    modes: ['relief', 'extrude', 'voxel'],
  },
  {
    id: 'ply',
    label: 'PLY',
    extension: 'ply',
    hint: 'Polygon file — keeps per-vertex colour, good for scans',
    modes: ['relief', 'extrude', 'voxel', 'points'],
  },
];

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

/**
 * Serialises a built model with the official three.js exporters.
 *
 * Everything happens on the main thread but is async where the exporter allows
 * it, and the result is always a `Blob` so the caller only has to name the file.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  async export(object: Object3D, format: ExportFormat): Promise<Blob> {
    switch (format) {
      case 'glb':
        return this.#glb(object);
      case 'obj':
        return new Blob([new OBJExporter().parse(object)], { type: 'text/plain' });
      case 'stl':
        return new Blob([new STLExporter().parse(object, { binary: true })], {
          type: 'model/stl',
        });
      case 'ply':
        return this.#ply(object);
    }
  }

  async #glb(object: Object3D): Promise<Blob> {
    const result = await new GLTFExporter().parseAsync(object, {
      binary: true,
      onlyVisible: true,
    });

    if (!(result instanceof ArrayBuffer)) {
      throw new ExportError('The glTF exporter returned JSON instead of a binary buffer.');
    }

    return new Blob([result], { type: 'model/gltf-binary' });
  }

  #ply(object: Object3D): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      new PLYExporter().parse(
        object,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(new Blob([result], { type: 'application/octet-stream' }));
          } else if (typeof result === 'string') {
            resolve(new Blob([result], { type: 'text/plain' }));
          } else {
            reject(new ExportError('The PLY exporter produced no data.'));
          }
        },
        { binary: true },
      );
    });
  }
}
