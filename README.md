# ElocAvataR-TS

An Angular and TypeScript application that brings a VRM avatar to life with local webcam tracking. MediaPipe Holistic processes the body, both hands, and face together. Three.js and three-vrm render a skinned character with articulated fingers and basic facial expressions.

## Requirements

- Node.js **24.15 or later in the 24.x line**, or Node.js 26 or later, and npm.
- A recent Chrome or Edge with Web Workers, OffscreenCanvas, WebGL 2, WebAssembly, and camera access enabled.
- A webcam for live tracking. The synthetic motion demo works without one.

This branch uses Angular 22, TypeScript 6.0, and the explicitly requested legacy package `@mediapipe/holistic` pinned to `0.5.1675471629`.

## Quick start

```sh
npm ci
npm run setup-assets
npm run dev
```

Open the local URL printed in the terminal, normally <http://127.0.0.1:5173>. Click **Start camera** and allow camera access. Keep your body, hands, and face visible in good lighting. Click **Stop** or press **Esc** to release the camera. Stop capture before selecting another camera.

On Windows PowerShell, use `npm.cmd` if your execution policy blocks `npm.ps1`:

```powershell
cd D:\ElocAvataR-TS
npm.cmd ci
npm.cmd run setup-assets
npm.cmd run dev
```

After dependencies and assets have been prepared, only `npm run dev` is needed. Camera access requires localhost or HTTPS; serve the application instead of opening `index.html` directly.

## Review this branch

```sh
git fetch origin
git switch feature/angular-holistic
npm ci
npm run setup-assets
npm run dev
```

The original implementation is retained on `main`. This branch replaces inline HTML and separate Pose/Hand Tasks with Angular components and a unified Holistic pipeline. It does not change repository visibility or deploy a public website.

## Angular project structure

Templates are stored in `.html` files. TypeScript components contain state, lifecycle methods, and event handlers. There are no inline component templates or `innerHTML` application markup.

```text
src/
  main.ts                              Angular bootstrap only
  app/
    app.component.ts                   Studio controls and application lifecycle
    app.component.html                 Header, layout, settings, and status
    camera/
      camera-panel.component.ts        Video sizing and landmark overlay
      camera-panel.component.html      Camera preview, device selection, tracking indicators
    avatar/
      avatar-panel.component.ts        VRM loading, views, independent render loop
      avatar-panel.component.html      Avatar canvas, model import, view controls
    services/
      capture.service.ts               Camera lifecycle, signals, async capture scheduling
  tracking/
    holistic.worker.ts                 Unified Holistic inference in a classic Web Worker
    holistic-result.ts                 Numeric results and coordinate adaptation
    protocol.ts                        Typed worker messages
  tracker.ts                           Worker initialization, cancellation, one-frame backpressure
  motion.ts                            Numeric body, hand, and face data types
  rig.ts                               Body, wrist, and finger bone rotations
  face.ts                              Basic blink and mouth-opening estimates
  avatar.ts                            Three.js scene and VRM rendering
  overlay.ts                           Body, hand, and sparse facial contours
  demo.ts                              Synthetic motion without camera access
  style.css                            Shared visual styles
angular.json                           Angular CLI development and production configuration
```

The application uses standalone Angular components, signals, external templates, strict template checking, and Angular's default zoneless change detection. Angular CLI builds the application and worker; no separate Vite configuration is needed.

## Unified and asynchronous tracking

```text
Webcam video on the browser main thread
  -> createImageBitmap (asynchronous capture)
  -> transferable ImageBitmap to a dedicated Web Worker
  -> await Holistic.send -> Holistic.onResults
       body image/world landmarks + anatomical left/right hands + face landmarks
  -> typed numeric MotionFrame returned to Angular
  -> independent requestAnimationFrame rendering -> VRM / WebGL
```

Only one frame can be in flight, including bitmap creation and inference. Frames arriving while the worker is busy are skipped instead of queued. The next submission uses the latest decoded video frame. Worker initialization and capture are cancellable; stopping releases the camera, terminates the worker, rejects pending startup, and discards late results. A frame timeout reports a stalled worker.

The rendering loop remains on the main thread and runs independently of inference. Asynchronism and backpressure prevent synchronous inference from blocking Angular directly; overall smoothness and frame rate still depend on GPU resources, the browser, and hardware. No universal speed improvement or real-webcam accuracy is claimed.

Holistic provides anatomical hand labels, so there is no separate hand detector or wrist-distance reassignment. Body world landmarks drive the body rig. The legacy package supplies hand coordinates relative to the image: the adapter makes them wrist-relative and corrects the vertical axis for video aspect ratio before deriving finger and palm orientations. These hand coordinates are **not metric hand world coordinates**.

Face landmarks feed a status indicator, sparse camera contours, and approximate VRM `blinkLeft`, `blinkRight`, and `aa` expressions when the model supports them. Expressions use geometric eye/mouth ratios, not model-provided blendshapes. Missing face data restores neutral expressions. Head rotation still comes from the body pose. This is not calibrated facial capture or phoneme recognition.

## Local assets and legacy compatibility

`npm run setup-assets` copies the installed Holistic scripts, WASM, graph, packed models, and Full pose model into `public/holistic`. It also downloads the official pixiv sample VRM into `public/avatar`. Runtime inference uses local URLs and requires no CDN. There is no `@mediapipe/tasks-vision` dependency and no `.task` model loading.

The pinned legacy package has defects on its existing worker path. Setup applies two exact, guarded edits to the copied `holistic.js`: it restores Emscripten's mangled `majorVersion` option and assigns the initialized WebGL context used for texture uploads. It does not modify the installed package or WASM. The worker also configures absolute local asset paths for the packed loader. The result adapter recognizes the package's minified body-world output key `za`, as well as `poseWorldLandmarks`.

These compatibility edits are specific to the pinned package. Setup stops if its expected code markers change, so review them before upgrading. `@mediapipe/holistic` is a legacy Solutions package, not the newer Holistic Landmarker Tasks API. The dependency is retained explicitly for this migration request.

Large downloaded/copied assets, dependencies, test screenshots, caches, and build output are excluded from Git. Re-run setup after cloning or switching to this branch. Existing ignored assets from older branches can remain on disk; the Angular build copies only `public/avatar` and `public/holistic`, so old Task models are not shipped. Setup and builds do not clear directories.

## Controls

| Control | Action |
| --- | --- |
| Start camera / Stop | Start unified tracking or release the camera and worker |
| Camera selector | Choose a camera while capture is stopped |
| Import VRM | Load a local `.vrm` file; VRM 0.x and 1.0 are supported |
| Full body / Left hand / Right hand | Switch to the full avatar or a hand close-up |
| Left drag / Wheel / Right drag | Orbit / zoom / pan |
| R / Reset view | Restore the full-body view |
| Esc | Stop camera capture and the synthetic demo |
| Mirror preview | Mirror video, landmarks, and avatar display |
| Show landmarks | Toggle body, hand, and face contours |
| Motion smoothing | Adjust rotation and expression smoothing time in seconds |
| Visibility threshold | Filter body landmarks by visibility |
| Motion demo | Preview synthetic body and independent finger motion |

Mirroring changes only the display, preserving anatomical left/right data. Higher smoothing values reduce jitter and add latency. The demo has no facial input and does not establish real tracking accuracy. Imported VRM files are loaded locally through Blob URLs.

## Production build and preview

```sh
npm run setup-assets
npm run build
npm run preview
```

Angular outputs the application, worker, and local runtime assets to `dist/angular/browser`. The production preview runs at <http://127.0.0.1:4173>. Build output is preserved rather than deleted automatically.

## Verification

```sh
npm test
npm run typecheck
npm run test:browser
npm run build
```

Unit tests cover unified-result extraction, anatomical sides, the legacy world-coordinate key, aspect-correct hand coordinates, invalid/missing data, depth conversion, hierarchical body/finger rotations, independent expressions, tracking-loss reset, and time-based smoothing.

Browser tests use installed Chrome with a synthetic camera on port 5174. They check Angular bootstrap and English templates, a real VRM, model imports, local Holistic/WASM inference, one-frame backpressure, worker termination, camera cancellation and permissions, interactive controls, and narrow-screen layout. Screenshots are written to `artifacts`.

**Synthetic-camera and mathematical tests do not verify real webcam accuracy with a person.**

## Limitations and privacy

- The avatar keeps its original proportions and fixed root position. There is no global translation recovery, ground-contact constraint, or foot IK.
- Optional missing humanoid bones or facial expressions are skipped. Failed model imports preserve the previous avatar.
- Monocular depth, occlusion, overlapping fingers, fast movement, and small hands in the frame can introduce errors.
- Holistic uses GPU inference. Unsupported OffscreenCanvas/WebGL 2 devices receive an English startup error; there is no silent main-thread or Tasks fallback.
- There is no recording or calibrated lip sync. Camera frames are processed locally and are not uploaded. Worker messages return numeric landmarks, not camera images.
- Asset setup is a separate network download step. Automated tests save synthetic-camera and demo screenshots.

## Third-party assets and references

The sample is `VRM1_Constraint_Twist_Sample` v1.0.1, copyright 2022 pixiv Inc., from the [official three-vrm v3.5.5 examples](https://github.com/pixiv/three-vrm/tree/v3.5.5/packages/three-vrm/examples/models). The [VRM Public License 1.0](https://vrm.dev/licenses/1.0/) and embedded usage conditions apply. Redistribution and modification with redistribution are permitted; antisocial and hate usage is prohibited. Original metadata is preserved in `public/avatar/sample-meta.json`. Respect the license of any imported model.

References: [Angular version compatibility](https://angular.dev/reference/versions), [MediaPipe Holistic Solutions](https://chuoling.github.io/mediapipe/solutions/holistic.html), [three-vrm](https://github.com/pixiv/three-vrm), and [normalized humanoid bones](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html).
