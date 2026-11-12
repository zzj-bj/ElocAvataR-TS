import './style.css';
import { AvatarStage } from './avatar.ts';
import { demoMotion } from './demo.ts';
import { emptyMotion, type MotionFrame } from './motion.ts';
import { drawOverlay } from './overlay.ts';
import { MotionTracker } from './tracker.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./"><span class="brand-icon">E</span><span>ElocAvataR<small>VRM MOTION STUDIO</small></span></a>
    <div class="local-badge"><i></i> Local · No video uploads</div>
  </header>
  <main>
    <div class="intro"><div><p class="eyebrow">YOUR MOVEMENT, A NEW FORM</p><h1>Your motion. Your avatar.</h1><p>Bring your avatar to life with real-time body and finger tracking.</p></div>
      <div class="session-chip"><span id="mode-dot"></span><span id="mode">Idle</span></div></div>
    <div class="workspace">
      <section class="panel camera-panel" aria-labelledby="camera-title">
        <div class="panel-title"><div><span class="index">01</span><h2 id="camera-title">Motion capture</h2></div><span class="tag">CAMERA INPUT</span></div>
        <div class="camera-view" id="camera-view">
          <div class="camera-media mirrored" id="camera-media"><video id="video" autoplay muted playsinline></video><canvas id="overlay"></canvas></div>
          <div class="placeholder" id="placeholder"><div class="camera-icon">◎</div><h3>It starts with a move</h3><p>Turn on your camera and keep your body and hands in view.<br>Or try the motion demo to explore your avatar first.</p></div>
          <div class="view-label"><i></i> <span id="camera-label">Camera off</span></div>
        </div>
        <div class="tracking-row"><span><i id="body-dot"></i> Body <b id="body-state">—</b></span><span><i id="left-dot"></i> Left hand <b id="left-state">—</b></span><span><i id="right-dot"></i> Right hand <b id="right-state">—</b></span><span class="fps" id="fps">— FPS</span></div>
        <div class="camera-actions"><button class="primary" id="start">Start camera <span>↗</span></button><button id="stop" disabled>Stop</button></div>
        <label class="select-label">Camera<select id="device"><option value="">System default camera</option></select></label>
      </section>
      <section class="panel avatar-panel" aria-labelledby="avatar-title">
        <div class="panel-title"><div><span class="index">02</span><h2 id="avatar-title">Virtual avatar</h2></div><span class="tag vrm-tag">VRM 0.x / 1.0</span></div>
        <div class="avatar-view mirrored" id="avatar-view"></div>
        <div class="avatar-toolbar"><div class="segmented" aria-label="Avatar view"><button data-focus="body" class="selected">Full body</button><button data-focus="left">Left hand</button><button data-focus="right">Right hand</button></div><button id="reset" class="quiet">↺ Reset view</button></div>
        <div class="model-row"><div><span class="model-icon">◇</span><div><strong id="model-name">Loading sample avatar…</strong><small id="model-detail">VRM humanoid · Articulated fingers</small></div></div><label class="button" for="model-file">Import VRM <span>↑</span></label><input id="model-file" type="file" accept=".vrm" hidden /></div>
      </section>
    </div>
    <section class="settings" aria-label="Tracking settings">
      <div class="setting"><span class="setting-label">Preview options</span><label class="check"><input id="mirror" type="checkbox" checked /> Mirror preview</label><label class="check"><input id="skeleton" type="checkbox" checked /> Show landmarks</label></div>
      <label class="setting slider-label"><span class="setting-label">Motion smoothing <output id="smooth-value">0.10 s</output></span><input id="smooth" type="range" min="0" max="0.4" value="0.10" step="0.01" /></label>
      <label class="setting slider-label"><span class="setting-label">Visibility threshold <output id="visibility-value">0.50</output></span><input id="visibility" type="range" min="0.2" max="0.9" value="0.5" step="0.05" /></label>
      <button id="demo" class="demo-button" disabled>▷ Motion demo</button>
    </section>
    <div id="notice" class="notice" role="status" aria-live="polite">Loading the local VRM sample…</div>
    <footer><span>Drag to orbit · Scroll to zoom · Right-drag to pan · R to reset · Esc to stop</span><span>TypeScript / MediaPipe / Three.js / VRM</span></footer>
  </main>`;

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const video = element<HTMLVideoElement>('video');
const overlay = element<HTMLCanvasElement>('overlay');
const start = element<HTMLButtonElement>('start');
const stop = element<HTMLButtonElement>('stop');
const demo = element<HTMLButtonElement>('demo');
const device = element<HTMLSelectElement>('device');
const smooth = element<HTMLInputElement>('smooth');
const visibility = element<HTMLInputElement>('visibility');
function describeError(error: unknown): string {
  const messages: Record<string, string> = {
    NotAllowedError: 'Camera permission was denied.',
    NotFoundError: 'No camera was found.',
    NotReadableError: 'The camera is unavailable or in use by another application.',
    OverconstrainedError: 'The selected camera cannot provide the requested video settings.',
    SecurityError: 'Camera access is blocked. Use localhost or HTTPS and check browser permissions.',
    AbortError: 'The operation was interrupted. Please try again.',
  };
  if (error instanceof Error && messages[error.name]) return messages[error.name];
  const message = error instanceof Error ? error.message : String(error);
  return /\p{Script=Han}/u.test(message) ? 'An unexpected error occurred. Please try again.' : message;
}
const notice = (message: string, error = false) => {
  element('notice').textContent = message;
  element('notice').classList.toggle('error', error);
};
let stage: AvatarStage;
let tracker: MotionTracker | undefined;
let stream: MediaStream | undefined;
let motion = emptyMotion();
let running = false;
let starting = false;
let demonstrating = false;
let session = 0;
let lastVideoTime = -1;
let lastInference = 0;
let fps = 0;
let previous = performance.now();
let raf = 0;
let disposed = false;

function fitVideo(): void {
  const host = element('camera-view');
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  const height = Math.min(host.clientHeight, host.clientWidth / aspect);
  element('camera-media').style.width = `${height * aspect}px`;
  element('camera-media').style.height = `${height}px`;
}
const cameraObserver = new ResizeObserver(fitVideo);
cameraObserver.observe(element('camera-view'));
video.addEventListener('loadedmetadata', fitVideo);

function status(frame: MotionFrame): void {
  for (const [part, tracked] of [['body', frame.world.length > 0], ['left', !!frame.hands.left], ['right', !!frame.hands.right]] as const) {
    element(`${part}-dot`).classList.toggle('active', tracked);
    element(`${part}-state`).textContent = tracked ? 'Tracked' : '—';
  }
  element('mode').textContent = demonstrating ? 'Synthetic demo' : running ? 'Live capture' : 'Idle';
  element('mode-dot').classList.toggle('active', running || demonstrating);
}

function stopCamera(): void {
  session++;
  running = false;
  starting = false;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.pause();
  video.srcObject = null;
  tracker?.close();
  tracker = undefined;
  motion = emptyMotion();
  lastVideoTime = -1;
  lastInference = 0;
  fps = 0;
  start.disabled = false;
  start.innerHTML = 'Start camera <span>↗</span>';
  stop.disabled = true;
  device.disabled = false;
  element('placeholder').hidden = false;
  element('camera-label').textContent = 'Camera off';
  element('fps').textContent = '— FPS';
  drawOverlay(overlay, emptyMotion(), 0.5);
  status(motion);
}

async function updateDevices(): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  const selected = stream?.getVideoTracks()[0]?.getSettings().deviceId ?? device.value;
  device.replaceChildren(new Option('System default camera', ''));
  devices.forEach((d, i) => device.add(new Option(d.label && !/\p{Script=Han}/u.test(d.label) ? d.label : `Camera ${i + 1}`, d.deviceId)));
  if (devices.some(d => d.deviceId === selected)) device.value = selected;
}

async function startCamera(): Promise<void> {
  if (starting || running) return;
  demonstrating = false;
  demo.textContent = '▷ Motion demo';
  starting = true;
  const token = ++session;
  start.disabled = true;
  start.textContent = 'Preparing…';
  stop.disabled = false;
  device.disabled = true;
  let pendingTracker: MotionTracker | undefined;
  let pendingStream: MediaStream | undefined;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Use localhost or HTTPS and check browser permissions.');
    notice('Requesting camera permission…');
    pendingStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        ...(device.value ? { deviceId: { exact: device.value } } : { facingMode: 'user' }) },
    });
    if (token !== session) { pendingStream.getTracks().forEach(t => t.stop()); return; }
    stream = pendingStream;
    video.srcObject = stream;
    await video.play();
    if (token !== session) return;
    element('placeholder').hidden = true;
    element('camera-label').textContent = 'Local video stream';
    notice('Initializing local body and hand models. First startup may take a few seconds…');
    pendingTracker = await MotionTracker.create();
    if (token !== session) { pendingTracker.close(); return; }
    tracker = pendingTracker;
    running = true;
    starting = false;
    start.textContent = 'Capturing';
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (token === session) { stopCamera(); notice('The camera disconnected. Start it again to resume.', true); }
    }));
    notice('Live tracking is on. Keep your body and hands visible. Occluded fingers return to their rest pose.');
    await updateDevices().catch(() => {});
  } catch (error) {
    pendingStream?.getTracks().forEach(track => track.stop());
    if (token !== session) return;
    stopCamera();
    const message = describeError(error);
    notice(`Unable to start: ${message} Check camera permissions. If models are missing, run npm run setup-assets.`, true);
  }
}

function animate(now: number): void {
  if (disposed) return;
  const dt = Math.min(Math.max((now - previous) / 1000, 0.001), 0.1);
  previous = now;
  if (running && tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastInference >= 50) {
    lastVideoTime = video.currentTime;
    const interval = now - lastInference;
    lastInference = now;
    try {
      motion = tracker.process(video, now);
      fps = fps ? fps * 0.85 + 1000 / interval * 0.15 : 1000 / interval;
      element('fps').textContent = `${fps.toFixed(1)} FPS`;
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      drawOverlay(overlay, motion, Number(visibility.value));
    } catch (error) {
      stopCamera();
      notice(`Tracking failed: ${describeError(error)}`, true);
    }
  }
  const current = demonstrating ? demoMotion(now / 1000) : running && now - motion.timestamp < 300 ? motion : emptyMotion();
  stage.render(current, dt, Number(smooth.value), Number(visibility.value));
  status(current);
  raf = requestAnimationFrame(animate);
}

start.addEventListener('click', () => void startCamera());
stop.addEventListener('click', () => { stopCamera(); notice('Camera stopped. The device has been released.'); });
element('mirror').addEventListener('change', event => {
  const checked = (event.target as HTMLInputElement).checked;
  for (const id of ['camera-media', 'avatar-view']) element(id).classList.toggle('mirrored', checked);
});
element('skeleton').addEventListener('change', event => { overlay.hidden = !(event.target as HTMLInputElement).checked; });
smooth.addEventListener('input', () => { element('smooth-value').textContent = `${Number(smooth.value).toFixed(2)} s`; });
visibility.addEventListener('input', () => { element('visibility-value').textContent = Number(visibility.value).toFixed(2); });
element('reset').addEventListener('click', () => {
  stage.resetView();
  document.querySelectorAll('[data-focus]').forEach(b => b.classList.toggle('selected', (b as HTMLElement).dataset.focus === 'body'));
});
document.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach(button => button.addEventListener('click', () => {
  stage.setFocus(button.dataset.focus as 'body' | 'left' | 'right');
  document.querySelectorAll('[data-focus]').forEach(b => b.classList.toggle('selected', b === button));
}));
demo.addEventListener('click', () => {
  const next = !demonstrating;
  stopCamera();
  demonstrating = next;
  demo.textContent = next ? 'Ⅱ Stop demo' : '▷ Motion demo';
  notice(next ? 'Synthetic motion demo: preview body and individual finger joints. This does not measure real camera tracking accuracy.' : 'Demo stopped. You can now start the camera.');
});
element<HTMLInputElement>('model-file').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.vrm')) { notice('Please select a .vrm file.', true); input.value = ''; return; }
  const url = URL.createObjectURL(file);
  notice('Loading the VRM model…');
  try {
    if (await stage.load(url)) {
      element('model-name').textContent = /\p{Script=Han}/u.test(file.name) ? 'Imported VRM' : file.name;
      demo.disabled = false;
      notice('VRM loaded. Start the camera or try the motion demo.');
    }
  } catch (error) { notice(`Model loading failed: ${describeError(error)}`, true); }
  finally { URL.revokeObjectURL(url); input.value = ''; }
});
window.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).matches('input,select,textarea')) return;
  if (event.key.toLowerCase() === 'r') element('reset').click();
  if (event.key === 'Escape') {
    demonstrating = false;
    demo.textContent = '▷ Motion demo';
    stopCamera();
    notice('Stopped.');
  }
});
window.addEventListener('pagehide', () => {
  disposed = true;
  stopCamera();
  cancelAnimationFrame(raf);
  cameraObserver.disconnect();
  stage?.dispose();
});
navigator.mediaDevices?.addEventListener('devicechange', () => void updateDevices().catch(() => {}));

try {
  stage = new AvatarStage(element('avatar-view'));
  raf = requestAnimationFrame(animate);
  void stage.load(`${import.meta.env.BASE_URL}avatar/sample.vrm`).then(loaded => {
    if (!loaded) return;
    element('model-name').textContent = 'pixiv · VRM Twist Sample';
    demo.disabled = false;
    notice('Ready. Start the camera or try the motion demo to preview the VRM rig. Sample avatar © pixiv Inc.');
  }).catch(error => {
    element('model-name').textContent = 'Import a VRM model';
    notice(`Sample model unavailable: ${describeError(error)} Run npm run setup-assets or import your own .vrm file.`, true);
  });
  void updateDevices().catch(() => {});
} catch (error) {
  start.disabled = true;
  notice(`Unable to create the 3D view: ${describeError(error)} Enable WebGL and hardware acceleration in your browser.`, true);
}
