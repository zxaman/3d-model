import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EXPORT_FORMATS } from '@core/services/export.service';
import { Icon } from '@shared/ui';

interface PipelineStep {
  readonly title: string;
  readonly body: string;
}

/** Static, explanatory route. Kept as data + template so it stays easy to edit. */
@Component({
  selector: 'i3d-guide-page',
  imports: [Icon],
  templateUrl: './guide-page.html',
  styleUrl: './guide-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-guide-page' },
})
export class GuidePage {
  protected readonly steps: readonly PipelineStep[] = [
    {
      title: 'Decode and downscale',
      body: 'The image is decoded once and capped at 2048 px so the texture stays sharp without exhausting GPU memory.',
    },
    {
      title: 'Sample onto a grid',
      body: 'The browser resamples it onto the working grid (32–512 cells). High-quality resampling doubles as anti-aliasing for the heights.',
    },
    {
      title: 'Build a height field',
      body: 'Each sample becomes a scalar: brightness or transparency, optionally inverted, blurred to remove noise, then sharpened and gamma-corrected.',
    },
    {
      title: 'Generate geometry',
      body: 'A web worker turns that field into vertices, normals, colours and indices — relief surfaces, extruded silhouettes, voxel shells or point clouds.',
    },
    {
      title: 'Render and export',
      body: 'three.js draws the result with image-based lighting; the same object is serialised to GLB, OBJ, STL or PLY on demand.',
    },
  ];

  protected readonly modes = [
    {
      label: 'Relief',
      geometry: 'Indexed surface, smooth normals',
      bestFor: 'Photos, portraits, terrain, textures',
    },
    {
      label: 'Extrude',
      geometry: 'Flat top, straight walls, closed base',
      bestFor: 'Logos, icons, text, stickers, printing',
    },
    {
      label: 'Voxel',
      geometry: 'Shell of coloured boxes, hidden faces culled',
      bestFor: 'Pixel art, avatars, game assets',
    },
    {
      label: 'Points',
      geometry: 'Coloured particles at their depth',
      bestFor: 'Previews, scan-like effects, stylisation',
    },
  ];

  protected readonly formats = EXPORT_FORMATS.map((format) => ({
    label: format.label,
    carries: CARRIES[format.id],
    use: USES[format.id],
  }));

  protected readonly tips = [
    'Start from a high-contrast image — flat lighting produces a flat model.',
    'Use Smoothing to kill JPEG noise, then Detail recovery to bring edges back.',
    'Turn on the solid base before exporting an STL, so the mesh is watertight.',
    'For logos on transparent backgrounds, switch "Height from" to Transparency.',
    'Lower the detail slider if the viewport feels sluggish; triangle count scales with its square.',
  ];
}

const CARRIES: Readonly<Record<string, string>> = {
  glb: 'Geometry, normals, texture, vertex colours',
  obj: 'Geometry and normals',
  stl: 'Triangles only (binary)',
  ply: 'Geometry and per-vertex colour',
};

const USES: Readonly<Record<string, string>> = {
  glb: 'Web, AR, game engines, sharing',
  obj: 'Anything that imports meshes',
  stl: 'Slicers and 3D printing',
  ply: 'Research tools, point clouds',
};
