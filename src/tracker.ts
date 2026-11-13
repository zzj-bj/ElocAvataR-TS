import type { MotionFrame } from './motion.ts';
import type { WorkerRequest, WorkerResponse } from './tracking/protocol.ts';

export class MotionTracker {
  private worker: Worker;
  private busy = false;
  private disposed = false;
  private frameTimeout?: ReturnType<typeof setTimeout>;
  private rejectInitialization?: (error: Error) => void;

  private constructor(worker: Worker) { this.worker = worker; }

  static async create(onResult: (motion: MotionFrame) => void, onError: (error: Error) => void, signal: AbortSignal): Promise<MotionTracker> {
    if (!globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap) {
      throw new Error('Holistic tracking requires a browser with Web Workers, OffscreenCanvas, and ImageBitmap support. Use a recent Chrome or Edge.');
    }
    const worker = new Worker(new URL('./tracking/holistic.worker', import.meta.url), { name: 'holistic-inference' });
    const tracker = new MotionTracker(worker);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => tracker.rejectInitialization?.(new Error('Holistic initialization timed out. Check the local assets.')), 60_000);
        const finish = () => { clearTimeout(timeout); tracker.rejectInitialization = undefined; };
        tracker.rejectInitialization = error => { finish(); reject(error); };
        const fail = (error: Error) => {
          if (tracker.disposed) return;
          if (tracker.rejectInitialization) tracker.rejectInitialization(error);
          else onError(error);
        };
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          if (tracker.disposed) return;
          if (data.type === 'ready') { finish(); resolve(); }
          else if (data.type === 'error') fail(new Error(data.message));
          else {
            clearTimeout(tracker.frameTimeout);
            tracker.busy = false;
            onResult(data.motion);
          }
        };
        worker.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'The Holistic worker failed.')); };
        signal.addEventListener('abort', () => tracker.close(), { once: true });
        if (signal.aborted) { tracker.close(); return; }
        worker.postMessage({ type: 'initialize', assetBase: new URL('holistic/', document.baseURI).href } satisfies WorkerRequest);
      });
      tracker.reportError = onError;
      return tracker;
    } catch (error) { tracker.close(); throw error; }
  }

  private reportError: (error: Error) => void = () => {};

  /** Skip frames while busy. Never queue video frames behind a slow inference. */
  submit(video: HTMLVideoElement, timestamp: number): void {
    if (this.busy || this.disposed) return;
    this.busy = true;
    void createImageBitmap(video).then(image => {
      if (this.disposed) { image.close(); return; }
      try {
        this.worker.postMessage({ type: 'frame', image, timestamp } satisfies WorkerRequest, [image]);
        this.frameTimeout = setTimeout(() => {
          if (!this.disposed) this.reportError(new Error('Holistic stopped responding. Restart the camera.'));
        }, 30_000);
      } catch (error) { image.close(); throw error; }
    }).catch(error => {
      this.busy = false;
      if (!this.disposed) this.reportError(error instanceof Error ? error : new Error(String(error)));
    });
  }

  close(): void {
    if (this.disposed) return;
    this.rejectInitialization?.(new Error('Tracking startup was cancelled.'));
    this.disposed = true;
    clearTimeout(this.frameTimeout);
    this.worker.terminate();
  }
}
