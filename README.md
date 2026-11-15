# Image → 3D Studio

Turn any image — photo, logo, sketch, sprite — into a real, exportable 3D model.
Everything runs in the browser: no backend, no uploads, no account. Projects are
saved to `localStorage`, so the app keeps working offline once it has loaded.

Built with Angular 22 (zoneless, standalone, signals) and three.js.

---

## Features

|                           |                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Four conversion modes** | Relief (smooth displaced surface), Extrude (flat-topped silhouette), Voxel (blocky cube shell), Point cloud |
| **Sized for printing**    | Every length in millimetres; keychain, coin, plaque and lithophane presets                                  |
| **Print check**           | Manifoldness, wall thickness, steep slopes and bed size, reported in plain language before you download     |
| **Live controls**         | Detail grid, depth, smoothing, detail recovery, contrast, invert, height source, cut-off, solid base        |
| **Real exports**          | GLB (textured + vertex colours), OBJ, STL (binary, printable), PLY, plus a PNG viewport snapshot            |
| **Saved projects**        | Gallery with thumbnails, rename, duplicate, delete-with-undo, storage meter                                 |
| **100 % client-side**     | No network calls after the app loads; images never leave the device                                         |
| **Non-blocking**          | All geometry is generated in a web worker; slider drags stay at 60 fps                                      |
| **Polished shell**        | Dark/light themes, keyboard accessible, responsive down to phones                                           |

---

## Quick start

```bash
npm install
npm start          # http://localhost:4200
```

Then drop an image on the studio panel (or paste one from the clipboard), press
**Generate model**, and export. If you would rather be shown, open **How it
works** — the guided walkthrough plays through the whole flow, or you can step
through it with the arrow keys.

To make something you can hold, open the **Print** section of the settings
panel: set the size in millimetres, pick what you are making, and read the print
check under the viewport before you export.

### Scripts

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm start`            | Dev server on `0.0.0.0:4200`                  |
| `npm run build`        | Production build to `dist/image-to-3d-studio` |
| `npm test`             | Unit tests (Vitest, watch mode)               |
| `npm run test:ci`      | Unit tests once                               |
| `npm run lint`         | ESLint over TS + templates                    |
| `npm run lint:fix`     | ESLint with autofix                           |
| `npm run format`       | Prettier write                                |
| `npm run format:check` | Prettier check (used in CI)                   |

Requires Node `^22.22.3`, `^24.15` or `>=26` (Angular 22's engine range).

---

## Learning the app

The **How it works** page (`/guide#how-to-use`) leads with a seven-step walkthrough:

1. Add your image — drag & drop, browse, or paste
2. Choose a conversion mode
3. Shape the depth with the geometry sliders
4. Generate the model
5. Inspect it from every angle
6. Export the mesh
7. Save it and come back to it later

It is video-shaped rather than a video: a playhead, chapter markers you can jump
from, `←`/`→` to step, `Space` to play or pause, `Home` to restart, and a
transcript of the whole script. The "screen" is a miniature of the studio drawn
in markup rather than recorded, so it costs no bandwidth, works offline like the
rest of the app, and cannot drift out of sync with the real UI. Animation is
disabled under `prefers-reduced-motion`.

Below the player the same seven steps are written out in full, alongside
shortcuts and a troubleshooting table.

The **Generate model** button lives at the top of the Conversion panel and stays
visible whether or not live regeneration is on — running it by hand is always
available, even when the app would otherwise do it for you.

## How the conversion works

There is no AI model and no server. The pipeline is deterministic geometry, and
every step is a pure function you can unit-test:

```
 image ──▶ decode ──▶ sample grid ──▶ height field ──▶ geometry ──▶ three.js ──▶ export
          (2048px)    (32–512²)      (worker)        (worker)      (render)     (GLB/OBJ/STL/PLY)
```

1. **Decode & downscale** — the file is decoded once and capped at 2048 px. That
   copy becomes the texture; a ~1200 px copy is what gets persisted.
2. **Sample onto a grid** — the browser resamples the image onto the working grid
   (`resolution` cells along the longest edge). High-quality canvas resampling
   doubles as anti-aliasing for the heights.
3. **Build a height field** — each sample becomes a scalar:
   `luma → (optional invert) → box blur → unsharp mask → normalise → gamma`.
   Pixels with no contrast keep their level rather than collapsing to zero, so a
   solid-grey logo still extrudes and voxelises.
4. **Generate geometry** (in a worker):
   - **Relief** — indexed surface with area-weighted smooth normals; closed by a
     seal that _shares_ the surface's own rim vertices, so the result is welded
     rather than merely looking closed.
   - **Extrude** — binary threshold per cell, flat top, straight walls, base cap.
     Non-indexed, so the crisp flat shading survives export.
   - **Voxel** — one cube per stack level; faces hidden by an equally tall
     neighbour are culled. Every level of a column is considered, so the stack
     closes into a solid instead of leaving a floating lid.
   - **Points** — coloured particles at their sampled depth.
5. **Check & render & export** — the mesh is analysed as a slicer would see it
   (see [Printing](#printing)), three.js draws it with image-based lighting
   (PMREM + room environment), and the exact same `Object3D` is serialised by the
   official exporters.

### Coordinate conventions

Y is up, the model is centred on the origin and `widthMm` millimetres across its
longest edge, front faces are counter-clockwise, and vertex colours are
linear-space RGB (what three.js and glTF expect). Those conventions are asserted
by the unit tests, because a flipped winding or an sRGB/linear mix-up is easy to
introduce and hard to spot in a screenshot.

---

## Printing

STL, OBJ and PLY carry **no unit field**: every slicer reads the raw numbers as
millimetres. So the engine works in millimetres from end to end — Depth, Base
thickness and Size are real dimensions, and a model set to 100 mm leaves the app
100 mm wide.

| Piece           | What it does                                                          |
| --------------- | --------------------------------------------------------------------- |
| **Size**        | Longest edge in millimetres (20–300).                                 |
| **Print as**    | Plain slab, Keychain (with a hanging loop), Coin, Plaque, Lithophane. |
| **Print check** | Runs the same analysis a slicer does, and says what to change.        |

### Presets shape the outline, not just the numbers

The grid is warped onto a superellipse rather than clipped, so a coin really is
round: the outline is exact, the sampling grid keeps its topology, and the seal
can share vertices with the surface it closes. Each preset also applies the
physical settings that make sense for the object — a lithophane is thin and
inverted so it reads when you hold it up to the light; a keychain is small,
chunky, and gets a loop that interpenetrates the body so slicers union it
cleanly.

### The print check

`checkPrintability()` welds the mesh by position — which is what a slicer does —
and reports, in plain language:

- **Open edges** — the surface is a shell, so inside and outside are undefined
  (blocker: turn on the solid base).
- **Too-thin backing** — under ~0.8 mm a 0.4 mm nozzle cannot lay two walls
  (lithophanes are exempt: light has to get through).
- **Steep slopes** — more than 60° prints as a ragged near-vertical wall.
- **Bed size** — anything past ~220 mm has to be cut up or scaled down.

Older projects stored lengths in abstract model units; on load they are scaled by
the ratio between the old and new model width, so a project saved before this
change reopens at the size it was designed at.

---

## Architecture

```
src/app/
├── core/                  Application layer (Angular-aware)
│   ├── data/              ProjectRepository — persistence + index reconciliation
│   ├── models/            Settings, projects, complexity estimates, validation
│   ├── services/          Generation, images, model building, export, toasts, prefs
│   ├── storage/           localStorage adapter: quota errors, memory fallback
│   └── utils/             Pure helpers (maths, colour, formatting, ids)
├── engine/                Framework-free geometry & rendering library
│   ├── color.ts           sRGB → linear conversion (LUT)
│   ├── image/             Height-field kernels
│   ├── geometry/          Growable typed-array buffers + the four builders
│   ├── three/             SceneEngine (three.js viewport) and texture factory
│   └── workers/           Mesh worker + message contract
├── features/              Routes: studio, gallery, guide
├── shared/ui/             Design-system primitives (icon, button, slider, …)
└── testing/               Test fixtures (spec-only, never bundled)
```

**Layering rule:** `engine/` never imports from `core/`. It is a self-contained
library — which is exactly why the worker can import it without dragging Angular
along — and `core/models` re-exports its types so application code has a single
import surface. Files reachable from the worker (everything under `engine/`) use
relative imports only; the rest of the app uses the `@core/*`, `@engine/*`,
`@features/*`, `@shared/*` and `@app/*` path aliases.

### State

Feature state lives in one injectable store (`StudioStore`) provided by the
studio route, so the model's GPU resources are released on navigation. It is
signals all the way down: `signal` for state, `computed` for derived values, and
`effect` only for genuine side effects (persisting preferences, syncing three.js).
Components are `OnPush`, the app is zoneless, and templates use the built-in
control flow (`@if`, `@for`, `@switch`).

### Persistence

- The **source of truth is `image + settings`**, never the generated mesh. A
  model rebuilds deterministically in a few hundred milliseconds, so there is no
  reason to spend a ~5 MB quota on geometry.
- Keys are namespaced (`i3d:v1:…`) and listed in one file
  (`core/storage/storage-keys.ts`) so the storage contract is reviewable.
- Everything read back from storage is re-validated: unknown modes fall back to
  defaults, out-of-range numbers are clamped, corrupt JSON is dropped, and the
  gallery index is reconciled against the records that actually exist.
- Quota failures are translated into a `StorageQuotaError` and surfaced as a
  toast ("Local storage is full") rather than silently degrading.

### Performance notes

- three.js (~600 kB raw) is loaded only with the studio route, keeping the
  initial bundle at ~300 kB raw / ~84 kB transferred.
- The viewport renders on demand: the animation loop only draws when the camera
  moved, auto-rotate is on, or something in the scene changed.
- Slider changes are debounced (220 ms) and each new run terminates the previous
  worker — the only reliable way to interrupt a synchronous mesh build.
- A closed-form complexity estimate warns before the user builds a 500² grid.

---

## Storage schema

| Key                   | Contents                                                                   |
| --------------------- | -------------------------------------------------------------------------- |
| `i3d:v1:preferences`  | Theme, viewport presentation, live-regeneration, last project              |
| `i3d:v1:index`        | Denormalised `ProjectSummary[]` for the gallery grid                       |
| `i3d:v1:project:<id>` | Full record: name, mode, thumbnail, source image data URL, settings, stats |

Images are stored at ~1200 px (800 px when they have transparency, because PNG is
expensive), which puts a typical project between 100 KB and 600 KB — roughly
10–25 projects in a 5 MB budget. Clearing site data deletes everything; export a
GLB to keep a copy.

---

## Browser support

Chrome/Edge 114+, Firefox 121+, Safari 17+. Requires WebGL2 (or WebGL1) for the
preview, web workers, `OffscreenCanvas`-free canvas sampling, and
`crypto.randomUUID`. Without WebGL the app still generates and exports models,
and the viewport explains why it is blank.

---

## Testing

```bash
npm run test:ci
```

139 unit tests covering the parts where a silent error would be expensive: height
field maths, geometry winding and counts, attribute alignment, millimetre sizing,
manifoldness of the sealed solid, the print check's findings, legacy settings
migration, persistence and re-validation, storage quota handling, the studio and
gallery routes, and the viewport's contract with the three.js engine (which is
injectable precisely so that contract can be tested without a GPU).

Rendering itself is not covered by unit tests — jsdom has no WebGL. It was
verified in headless Chromium instead: upload, all four modes, live
regeneration, every print preset, save, reopen from the gallery, and
GLB/OBJ/STL/PLY export — with the exported STL parsed back and its bounding box
measured to confirm it really is the requested size in millimetres.

---

## Roadmap

- Optional AI depth estimation behind the existing `BuilderSettings` contract
  (a depth map is just another way to fill the height field).
- Multi-image batch conversion and a GLB pack.
- Height-field painting and masking before generation.
- Service worker for offline app loading.

## License

MIT — see the repository for details.
