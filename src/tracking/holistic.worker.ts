import type { Holistic, InputMap } from '@mediapipe/holistic';
import { extractHolistic, type HolisticResult } from './holistic-result.ts';
import { emptyMotion, type MotionFrame } from '../motion.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope & {
  Holistic: typeof Holistic;
  createMediapipeSolutionsPackedAssets: { locateFile: (file: string) => string };
};
let holistic: Holistic | undefined;
let processing = false;
let timestamp = 0;
let aspect = 1;
let output: MotionFrame | undefined;
const post = (message: WorkerResponse) => scope.postMessage(message);

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === 'initialize') {
      const probe = new OffscreenCanvas(1, 1).getContext('webgl2');
      if (!probe) throw new Error('Holistic background inference requires OffscreenCanvas with WebGL 2. Enable hardware acceleration or update your browser.');
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      // The legacy worker loader otherwise resolves packed data/WASM beside the worker URL.
      scope.createMediapipeSolutionsPackedAssets = { locateFile: file => new URL(file, data.assetBase).href };
      scope.importScripts(new URL('holistic.js', data.assetBase).href);
      holistic = new scope.Holistic({ locateFile: file => new URL(file, data.assetBase).href });
      holistic.setOptions({
        selfieMode: false, modelComplexity: 1, smoothLandmarks: true,
        enableSegmentation: false, refineFaceLandmarks: true,
        minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      holistic.onResults(result => {
        output = extractHolistic(result as HolisticResult, timestamp, aspect);
        // Holistic creates an output bitmap even though only numbers cross the worker boundary.
        if (result.image instanceof ImageBitmap) result.image.close();
      });
      await holistic.initialize();
      post({ type: 'ready' });
    } else {
      if (processing || !holistic) { data.image.close(); return; }
      processing = true;
      timestamp = data.timestamp;
      aspect = data.image.width / data.image.height;
      output = undefined;
      try {
        // The legacy declaration omits ImageBitmap, which its WebGL texture upload supports.
        await holistic.send({ image: data.image } as unknown as InputMap);
      } finally {
        data.image.close();
        processing = false;
      }
      post({ type: 'result', motion: output ?? emptyMotion(timestamp) });
    }
  } catch (error) {
    console.error('Holistic worker error:', error);
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
