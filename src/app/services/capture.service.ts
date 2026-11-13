import { Injectable, computed, signal } from '@angular/core';
import { emptyMotion, type MotionFrame } from '../../motion.ts';
import { demoMotion } from '../../demo.ts';
import { MotionTracker } from '../../tracker.ts';

export function describeError(error: unknown): string {
  const messages: Record<string, string> = {
    NotAllowedError: 'Camera permission was denied.', NotFoundError: 'No camera was found.',
    NotReadableError: 'The camera is unavailable or in use by another application.',
    OverconstrainedError: 'The selected camera cannot provide the requested video settings.',
    SecurityError: 'Camera access is blocked. Use localhost or HTTPS.',
    AbortError: 'The operation was interrupted. Please try again.',
  };
  if (error instanceof Error && messages[error.name]) return messages[error.name];
  const message = error instanceof Error ? error.message : String(error);
  return /\p{Script=Han}/u.test(message) ? 'An unexpected error occurred. Please try again.' : message;
}

@Injectable({ providedIn: 'root' })
export class CaptureService {
  readonly running = signal(false);
  readonly starting = signal(false);
  readonly demonstrating = signal(false);
  readonly frame = signal(emptyMotion());
  readonly fps = signal(0);
  readonly notice = signal('Loading the local VRM sample…');
  readonly noticeError = signal(false);
  readonly devices = signal<{ id: string; label: string }[]>([]);
  readonly mode = computed(() => this.demonstrating() ? 'Synthetic demo' : this.running() ? 'Live capture' : 'Idle');
  readonly bodyTracked = computed(() => this.demonstrating() || this.frame().world.length > 0);
  readonly leftTracked = computed(() => this.demonstrating() || !!this.frame().hands.left);
  readonly rightTracked = computed(() => this.demonstrating() || !!this.frame().hands.right);
  readonly faceTracked = computed(() => this.frame().face.length > 0);
  private stream?: MediaStream;
  private video?: HTMLVideoElement;
  private tracker?: MotionTracker;
  private abort?: AbortController;
  private session = 0;
  private raf = 0;
  private lastResult = 0;
  private lastVideoTime = -1;
  private lastSubmitted = 0;

  setNotice(message: string, error = false): void { this.notice.set(message); this.noticeError.set(error); }

  async updateDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.devices.set(devices.filter(d => d.kind === 'videoinput').map((d, i) => ({
      id: d.deviceId, label: d.label && !/\p{Script=Han}/u.test(d.label) ? d.label : `Camera ${i + 1}`,
    })));
  }

  async start(video: HTMLVideoElement, deviceId: string): Promise<void> {
    if (this.starting() || this.running()) return;
    this.demonstrating.set(false);
    this.starting.set(true);
    this.video = video;
    const token = ++this.session;
    const abort = this.abort = new AbortController();
    let pending: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Use localhost or HTTPS.');
      this.setNotice('Requesting camera permission…');
      pending = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
      } });
      if (token !== this.session) { pending.getTracks().forEach(t => t.stop()); return; }
      this.stream = pending;
      video.srcObject = pending;
      await video.play();
      if (token !== this.session) return;
      this.setNotice('Initializing local Holistic body, hand, and face models in a background worker…');
      const tracker = await MotionTracker.create(motion => {
        if (token !== this.session) return;
        const now = performance.now();
        const interval = now - this.lastResult;
        this.fps.update(fps => this.lastResult ? (fps ? fps * 0.85 + 1000 / interval * 0.15 : 1000 / interval) : 0);
        this.lastResult = now;
        this.frame.set(motion);
      }, error => {
        if (token !== this.session) return;
        this.stop(false);
        this.setNotice(`Tracking failed: ${describeError(error)}`, true);
      }, abort.signal);
      if (token !== this.session) { tracker.close(); return; }
      this.tracker = tracker;
      this.running.set(true);
      this.starting.set(false);
      pending.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (token === this.session) { this.stop(false); this.setNotice('The camera disconnected. Start it again to resume.', true); }
      }));
      this.setNotice('Live tracking is on. Holistic processes body, hands, and face together in a background worker.');
      this.raf = requestAnimationFrame(this.captureFrame);
      await this.updateDevices().catch(() => {});
    } catch (error) {
      pending?.getTracks().forEach(t => t.stop());
      if (token !== this.session) return;
      this.stop(false);
      this.setNotice(`Unable to start: ${describeError(error)} Check camera permissions and run npm run setup-assets if assets are missing.`, true);
    }
  }

  private captureFrame = (now: number): void => {
    if (!this.running() || !this.video) return;
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime && now - this.lastSubmitted >= 33) {
      this.lastVideoTime = this.video.currentTime;
      this.lastSubmitted = now;
      this.tracker?.submit(this.video, now);
    }
    this.raf = requestAnimationFrame(this.captureFrame);
  };

  currentMotion(now: number): MotionFrame {
    if (this.demonstrating()) return demoMotion(now / 1000);
    return this.running() && now - this.lastResult < 500 ? this.frame() : emptyMotion();
  }

  stop(notify = true): void {
    this.session++;
    cancelAnimationFrame(this.raf);
    this.abort?.abort();
    this.abort = undefined;
    this.tracker?.close();
    this.tracker = undefined;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.running.set(false);
    this.starting.set(false);
    this.frame.set(emptyMotion());
    this.fps.set(0);
    this.lastResult = 0;
    this.lastVideoTime = -1;
    this.lastSubmitted = 0;
    if (notify) this.setNotice('Camera stopped. The device has been released.');
  }

  toggleDemo(): void {
    const next = !this.demonstrating();
    this.stop(false);
    this.demonstrating.set(next);
    this.setNotice(next ? 'Synthetic motion demo: preview body and individual finger joints. This does not measure real camera tracking accuracy.' : 'Demo stopped. You can now start the camera.');
  }
}
