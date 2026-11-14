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

Then drop an image on the studio panel (or paste one from the clipboard), pick a
mode, and export.

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
   - **Relief** — indexed surface with area-weighted smooth normals; optionally
     closed with a skirt and a back face to make it watertight.
   - **Extrude** — binary threshold per cell, flat top, straight walls, base cap.
     Non-indexed, so the crisp flat shading survives export.
   - **Voxel** — one exposed cube per stack level; faces hidden by an equally
     tall neighbour are culled, which typically halves the triangle count.
   - **Points** — coloured particles at their sampled depth.
5. **Render & export** — three.js with image-based lighting (PMREM + room
   environment), then the exact same `Object3D` is serialised by the official
   exporters.

### Coordinate conventions

Y is up, the model is centred on the origin and `PLANE_SIZE` (2 units) wide on
its longest edge, front faces are counter-clockwise, and vertex colours are
linear-space RGB (what three.js and glTF expect). Those conventions are asserted
by the unit tests, because a flipped winding or an sRGB/linear mix-up is easy to
introduce and hard to spot in a screenshot.

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

67 unit tests covering the parts where a silent error would be expensive: height
field maths, geometry winding and counts, attribute alignment, persistence and
re-validation, storage quota handling, and the studio/gallery routes.

---

## Roadmap

- Optional AI depth estimation behind the existing `BuilderSettings` contract
  (a depth map is just another way to fill the height field).
- Multi-image batch conversion and a GLB pack.
- Height-field painting and masking before generation.
- Service worker for offline app loading.

## License

MIT — see the repository for details.
