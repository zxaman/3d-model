/**
 * Script for the guided walkthrough on the "How it works" page.
 *
 * Kept as plain data so the copy can be edited without touching the player,
 * and so the same steps can render as a player, a transcript and a checklist.
 */

/** Region of the mock studio that a step draws attention to. */
export type TutorialRegion =
  'dropzone' | 'mode' | 'sliders' | 'generate' | 'viewport' | 'export' | 'save';

/** What the animated cursor does on that step. */
export type TutorialAction = 'drop' | 'click' | 'drag' | 'orbit';

export interface TutorialStep {
  readonly id: string;
  readonly title: string;
  /** One-line subtitle shown next to the step counter. */
  readonly caption: string;
  /** The full explanation — this is the part worth reading. */
  readonly body: string;
  readonly tip: string;
  readonly region: TutorialRegion;
  readonly action: TutorialAction;
  /** Where the cursor rests, as a percentage of the stage. */
  readonly cursor: { readonly x: number; readonly y: number };
  /** Multiplier on the auto-advance dwell time (longer steps get more). */
  readonly weight: number;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'add-image',
    title: 'Add your image',
    caption: 'Drop, browse or paste',
    body: 'Drag any picture onto the left panel, click it to browse, or simply paste from the clipboard — Ctrl/Cmd+V works anywhere on the Studio page. JPEG, PNG, WebP, GIF and SVG are all decoded locally. Images larger than 2048 px are downscaled once, up front, so a 12-megapixel photo costs no more than a small one.',
    tip: 'Nothing is uploaded. The file is read with a browser object URL and never leaves your device.',
    region: 'dropzone',
    action: 'drop',
    cursor: { x: 21, y: 27 },
    weight: 1.2,
  },
  {
    id: 'choose-mode',
    title: 'Choose a conversion mode',
    caption: 'Relief, Extrude, Voxel or Points',
    body: 'The four modes read the same height field in four different ways. Relief makes a smooth displaced surface — best for photos and terrain. Extrude turns everything above a brightness cut-off into a solid slab with straight walls — best for logos and 3D printing. Voxel stacks coloured boxes and hides the faces you cannot see. Points scatters coloured particles at their depth.',
    tip: 'Unsure? Start with Relief. Switching modes keeps the depth, smoothing and contrast you already tuned.',
    region: 'mode',
    action: 'click',
    cursor: { x: 30, y: 44 },
    weight: 1.1,
  },
  {
    id: 'tune',
    title: 'Shape the depth',
    caption: 'Detail, Depth, Smoothing, Contrast',
    body: 'Open the Geometry panel. Detail sets the sampling grid — 32 to 512 cells along the longest edge, and triangle count grows with its square, so 512 is around 250× the work of 32. Depth scales the height. Smoothing blurs the height field to kill JPEG noise; Detail recovery is an unsharp mask that brings crisp edges back afterwards. Contrast applies a gamma curve to push mid-tones apart.',
    tip: 'For a logo on a transparent background, switch "Height from" to Transparency so the alpha channel drives the depth.',
    region: 'sliders',
    action: 'drag',
    cursor: { x: 33, y: 62 },
    weight: 1.4,
  },
  {
    id: 'generate',
    title: 'Generate the model',
    caption: 'One button, or automatic',
    body: 'Press Generate model. The image is sampled onto the grid and a web worker builds the geometry off the main thread, so the interface stays responsive even on a 512 × 512 grid. With Live regeneration switched on, the model rebuilds by itself about a fifth of a second after you stop moving a slider; switch it off and the button becomes the only trigger, which is what you want for heavy grids on a slower machine.',
    tip: 'Moving a slider cancels the run already in flight and starts a new one — you never queue up stale work.',
    region: 'generate',
    action: 'click',
    cursor: { x: 27, y: 80 },
    weight: 1.3,
  },
  {
    id: 'inspect',
    title: 'Inspect it from every angle',
    caption: 'Orbit, zoom, and change the material',
    body: 'Drag to orbit, scroll to zoom, right-drag to pan. The Appearance panel switches between the source image as a texture, baked vertex colours, a solid colour or matte clay, and lets you toggle wireframe to see the mesh you actually built. The Viewport panel changes the background and turns the grid on and off. The stats under the viewport show vertex and triangle counts and how long the build took.',
    tip: 'Wireframe is the fastest way to see what the Detail slider really did to your mesh.',
    region: 'viewport',
    action: 'orbit',
    cursor: { x: 68, y: 45 },
    weight: 1.2,
  },
  {
    id: 'export',
    title: 'Export the mesh',
    caption: 'GLB, OBJ, STL, PLY or a PNG preview',
    body: 'The Export bar writes a real file to your downloads folder. GLB carries geometry, normals, the texture and vertex colours — use it for the web, AR and game engines. OBJ is the most widely imported format. STL is triangles only, and is what slicers expect. PLY keeps per-vertex colour and suits research tooling. The camera button saves the current viewport as a PNG.',
    tip: 'Exporting an STL for printing? Turn on the solid base first, so the mesh is closed and watertight.',
    region: 'export',
    action: 'click',
    cursor: { x: 72, y: 88 },
    weight: 1.3,
  },
  {
    id: 'save',
    title: 'Save it and come back',
    caption: 'Projects live in this browser',
    body: 'Save stores the project in localStorage — the image, the settings and the presentation, but not the geometry, which is rebuilt deterministically in a few hundred milliseconds when you reopen it. The gallery shows every saved model with a thumbnail; open one to drop straight back into the Studio with your settings intact. Deleting shows an undo toast.',
    tip: 'Roughly 5 MB of storage per site means about 10–25 projects. Clearing site data deletes them, so export a GLB for anything you want to keep.',
    region: 'save',
    action: 'click',
    cursor: { x: 88, y: 88 },
    weight: 1.2,
  },
];

/** Base dwell time for a step, before its weight and caption length are applied. */
export const STEP_BASE_MS = 3600;

/** Extra dwell time per character of body copy, so denser steps get longer. */
export const STEP_MS_PER_CHAR = 16;

export const STEP_MIN_MS = 4000;
export const STEP_MAX_MS = 11_000;

export function stepDuration(step: TutorialStep): number {
  const weighted = (STEP_BASE_MS + step.body.length * STEP_MS_PER_CHAR) * step.weight;
  return Math.min(STEP_MAX_MS, Math.max(STEP_MIN_MS, Math.round(weighted)));
}
