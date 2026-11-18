import type { MotionFrame } from '../motion';

export type WorkerRequest =
  | { type: 'initialize'; assetBase: string }
  | { type: 'frame'; image: ImageBitmap; timestamp: number };
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; motion: MotionFrame }
  | { type: 'error'; message: string };
