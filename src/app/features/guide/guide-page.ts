import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DEFAULT_GENERATION_SETTINGS, PRINT_PRESET_OPTIONS } from '@core/models/generation.model';
import { EXPORT_FORMATS } from '@core/services/export.service';
import { Icon } from '@shared/ui';
import { Tutorial } from './tutorial/tutorial';
import { TUTORIAL_STEPS } from './tutorial/tutorial-steps';

interface PipelineStep {
  readonly title: string;
  readonly body: string;
}

interface WalkthroughStep {
  readonly title: string;
  readonly caption: string;
  readonly body: string;
}

interface Shortcut {
  readonly keys: string;
  readonly action: string;
}

/** Static, explanatory route. Kept as data + template so it stays easy to edit. */
@Component({
  selector: 'i3d-guide-page',
  imports: [Icon, Tutorial],
  templateUrl: './guide-page.html',
  styleUrl: './guide-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'i3d-guide-page' },
})
export class GuidePage {
  /** Drives the "what to click" checklist under the walkthrough player. */
  protected readonly walkthrough: readonly WalkthroughStep[] = TUTORIAL_STEPS.map((step) => ({
    title: step.title,
    caption: step.caption,
    body: step.body,
  }));

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

  /**
   * What each printable object gives you.
   *
   * Kept next to the settings catalogue it summarises so the two cannot drift:
   * the patch a preset applies is the single source of truth.
   */
  protected readonly presets = PRINT_PRESET_OPTIONS.map((preset) => ({
    label: preset.label,
    summary: preset.summary,
    size: `${preset.patch.widthMm ?? DEFAULT_GENERATION_SETTINGS.widthMm} mm`,
  }));

  protected readonly printing = [
    {
      title: 'Set the size you actually want',
      body: 'Sizes are millimetres, because STL, OBJ and PLY carry no unit at all and every slicer reads raw numbers as millimetres. A model set to 100 mm opens at 100 mm — no rescaling in Cura, PrusaSlicer or Bambu Studio.',
    },
    {
      title: 'Pick what you are making',
      body: '“Print as” applies a whole physical configuration at once: a keychain becomes a 60 mm tag with a hanging loop, a coin gets a raised rim, a lithophane turns thin and inverted so it reads when you hold it up to the light.',
    },
    {
      title: 'Read the print check',
      body: 'The bar under the viewport measures the model as a slicer sees it: whether the surface closes, how thick the backing is, whether anything is too steep or too big for the bed. Anything it reports comes with the setting that fixes it.',
    },
    {
      title: 'Export and slice',
      body: 'STL is what nearly every slicer wants — it carries triangles and nothing else. OBJ and PLY keep colour if your slicer reads it, and GLB is the one to keep as an archive.',
    },
  ];

  protected readonly formats = EXPORT_FORMATS.map((format) => ({
    label: format.label,
    carries: CARRIES[format.id],
    use: USES[format.id],
  }));

  protected readonly shortcuts: readonly Shortcut[] = [
    { keys: 'Ctrl / Cmd + V', action: 'Paste an image straight into the studio' },
    { keys: 'Drag', action: 'Orbit the model' },
    { keys: 'Scroll', action: 'Zoom in and out' },
    { keys: 'Right-drag', action: 'Pan the camera' },
    { keys: '← →', action: 'Step through the walkthrough above' },
    { keys: 'Space', action: 'Play or pause the walkthrough' },
  ];

  protected readonly troubleshooting = [
    {
      problem: 'The model looks flat',
      fix: 'The image has little contrast. Raise Contrast, or switch "Height from" to Transparency for artwork on a transparent background.',
    },
    {
      problem: 'The surface is noisy',
      fix: 'Raise Smoothing to remove sensor and JPEG noise, then raise Detail recovery to bring the real edges back.',
    },
    {
      problem: 'Nothing appears after dropping an image',
      fix: 'Check for an error toast. Very large files are capped at 40 MB, and the browser must support web workers.',
    },
    {
      problem: 'The viewport is blank',
      fix: 'WebGL did not start. Generation and export still work — try a different browser or enable hardware acceleration.',
    },
    {
      problem: 'The model opens tiny in my slicer',
      fix: 'Check the Size slider in the Print section. Older projects are migrated to millimetres automatically, but a model built before that change may need a new size.',
    },
    {
      problem: 'The print check says the surface is open',
      fix: 'Turn on “Add a solid base”, which closes the model with side walls and a back face. Without it the mesh is a shell, and a slicer cannot tell inside from outside.',
    },
    {
      problem: 'Saving fails with a storage error',
      fix: 'Delete a project from the gallery. Roughly 5 MB of local storage holds about 10–25 projects.',
    },
  ];

  protected readonly tips = [
    'Start from a high-contrast image — flat lighting produces a flat model.',
    'Use Smoothing to kill JPEG noise, then Detail recovery to bring edges back.',
    'Keep the backing at least 0.8 mm thick — thinner than two nozzle widths and it snaps.',
    'Orient the model flat on its back in the slicer; that is the direction it was built for.',
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
