# ElocAvataR-TS

A TypeScript application that brings a VRM avatar to life with webcam body and finger tracking. The camera preview appears on the left; a 3D character with a skinned humanoid rig appears on the right. MediaPipe landmarks drive the body, wrists, and individual joints of all ten fingers.

This is the browser version of the original Python ElocAvataR project.

## Requirements

- **Node.js 24 or later** and npm.
- Chrome or Edge with WebGL, WebAssembly, and camera access enabled.
- A webcam for live tracking. The synthetic motion demo works without one.

## Quick start

From the project directory, install dependencies and prepare the local assets:

```sh
npm ci
npm run setup-assets
npm run dev
```

Open the address printed in the terminal, usually <http://127.0.0.1:5173>. Click **Start camera** and allow camera access. Click **Stop** or press **Esc** to release the camera. Stop capture before choosing another camera.

On Windows PowerShell, use `npm.cmd` if your execution policy blocks `npm.ps1`:

```powershell
cd D:\ElocAvataR-TS
npm.cmd run dev
```

If dependencies and assets are already installed, only `npm run dev` is needed.

The asset setup script downloads the official Google Pose Full and Hand Landmarker models and the official pixiv VRM sample. It also copies the matching WASM runtime from the installed MediaPipe package. Files are stored in `public/models`, `public/wasm`, and `public/avatar`. Large models and WASM files are excluded from Git, so run setup after cloning the project. The script does not delete files.

Camera access requires localhost or HTTPS. Serve the application through Vite instead of opening `index.html` directly.

## Controls

| Control | Action |
| --- | --- |
| Start camera / Stop | Start live tracking or release the camera |
| Camera selector | Choose a camera while capture is stopped |
| Import VRM | Load a local `.vrm` file; VRM 0.x and 1.0 are supported |
| Full body / Left hand / Right hand | Switch between the full avatar and a hand close-up |
| Left mouse drag | Orbit the avatar |
| Mouse wheel | Zoom in or out |
| Right mouse drag | Pan the view |
| R / Reset view | Restore the full-body view |
| Esc | Stop camera capture and the motion demo |
| Mirror preview | Mirror the video, landmark overlay, and avatar display |
| Show landmarks | Toggle the body and hand landmark overlay |
| Motion smoothing | Adjust the rotation smoothing time in seconds |
| Visibility threshold | Filter body landmarks by visibility |
| Motion demo | Preview synthetic body and independent finger movements |

Higher smoothing values reduce jitter and add latency. Mirroring affects the display; inference always reads the original video and retains anatomical left/right assignments. Imported VRM files are loaded locally using Blob URLs.

The motion demo does not open the webcam. Starting live capture ends the demo. Synthetic animation demonstrates rig behavior and does not establish real camera tracking accuracy.

## Production build

Prepare assets before building:

```sh
npm run setup-assets
npm run build
npm run preview
```

The `dist` directory includes the application, local inference models, WASM runtime, and sample VRM. The build preserves existing output files rather than clearing the output directory automatically.

## Architecture

```text
Webcam video
  -> MediaPipe PoseLandmarker + HandLandmarker (same video frame, local inference)
  -> MotionFrame (body world coordinates, image landmarks, hand world coordinates)
  -> AvatarRig (parent transforms, palm orientation, finger rotations, smoothing)
  -> three-vrm normalized humanoid bones
  -> VRM.update -> Three.js / WebGL
```

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Interface, camera permissions, device lifecycle, and render loop |
| `src/tracker.ts` | MediaPipe body and hand detection |
| `src/motion.ts` | Numeric data types and hand association using pose wrist positions |
| `src/rig.ts` | VRM body, wrist, and individual finger rotations; receives no camera images |
| `src/avatar.ts` | VRM loading, WebGL scene, and view controls |
| `src/overlay.ts` | Camera landmark overlay |
| `src/demo.ts` | Synthetic motion independent of the camera |
| `scripts/setup-assets.ts` | Download models and VRM assets; prepare local WASM |

Body and hand detection use separate MediaPipe Tasks, processed sequentially on the same frame. Hands are associated with anatomical pose wrists by image-space distance, avoiding assumptions about mirrored handedness labels. Missing, invalid, or occluded joints return smoothly to the avatar's rest pose. Hands are not driven independently when valid body wrist landmarks are unavailable.

The avatar retains its original shape and bone lengths. Tracking drives rotations and does not stretch the mesh to match camera estimates. Optional bones that are absent from a model are skipped. A failed model import preserves the previous avatar.

## Limitations

- The avatar root stays in place. Global body translation, ground contact constraints, and foot IK are not implemented.
- Facial expressions, lip sync, and recording are not implemented.
- Inference runs synchronously on the main thread, capped at approximately 20 detection cycles per second. Actual performance depends on the machine, and slower devices may experience interface stutter.
- Rendering uses `requestAnimationFrame`, and rotation smoothing uses elapsed time.
- Single-camera depth, occlusion, overlapping hands, crossed wrists, and fast movement can introduce errors. Wrist-distance association can swap hands when wrists cross.

For best results, keep your upper body and both hands visible in good lighting. Use a hand close-up to inspect finger movement.

## Verification

```sh
npm test
npm run typecheck
npm run test:browser
npm run build
```

Unit tests cover hand association, invalid data, coordinate and depth conversion, hierarchical bone rotations, independent finger motion, tracking-loss reset, and smoothing over time.

Browser tests use locally installed Chrome. They load a real VRM and check animation, model import failures, local model/WASM inference, device release, camera permission failures, startup cancellation, English interface text, and narrow-screen layout. Screenshots are saved in `artifacts`.

**Browser camera tests use a Chromium synthetic device. They do not verify real webcam tracking or finger recognition accuracy with a person.**

## Privacy and third-party assets

At runtime, camera video is processed locally. The application does not upload frames, record video, or save camera captures. Runtime assets are served locally; `setup-assets` is the separate step that downloads third-party assets. Automated tests save screenshots of the demo and synthetic camera.

The bundled sample is `VRM1_Constraint_Twist_Sample` v1.0.1, copyright 2022 pixiv Inc., from the [official three-vrm v3.5.5 examples](https://github.com/pixiv/three-vrm/tree/v3.5.5/packages/three-vrm/examples/models). It is governed by the [VRM Public License 1.0](https://vrm.dev/licenses/1.0/) and its embedded usage conditions. Redistribution and modification with redistribution are allowed; antisocial and hate usage is prohibited. The original metadata is preserved in `public/avatar/sample-meta.json`. Follow the applicable license for any model you import.

References: [Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [three-vrm](https://github.com/pixiv/three-vrm), and [normalized humanoid bones](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html).
