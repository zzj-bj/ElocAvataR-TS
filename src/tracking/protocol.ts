import type { MotionFrame } from '../motion.ts';

export type WorkerRequest =
  | { type: 'initialize'; assetBase: string }
  | { type: 'frame'; image: ImageBitmap; timestamp: number };
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; motion: MotionFrame }
  | { type: 'error'; message: string };
