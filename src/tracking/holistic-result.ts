import { emptyMotion, valid, type Landmark, type MotionFrame } from '../motion.ts';

export interface HolisticResult {
  poseLandmarks?: Landmark[];
  poseWorldLandmarks?: Landmark[];
  // The pinned legacy package minifies this output key to `za` in its public result object.
  za?: Landmark[];
  faceLandmarks?: Landmark[];
  leftHandLandmarks?: Landmark[];
  rightHandLandmarks?: Landmark[];
}

function copy(points: Landmark[] | undefined, count: number): Landmark[] {
  return points?.length === count && points.every(p => valid(p))
    ? points.map(p => ({ x: p.x, y: p.y, z: p.z, ...(p.visibility === undefined ? {} : { visibility: p.visibility }) }))
    : [];
}

/** Holistic supplies anatomical hand labels. Hand depth is relative, not metric world space. */
export function extractHolistic(result: HolisticResult, timestamp: number, aspect: number): MotionFrame {
  const motion = emptyMotion(timestamp);
  motion.pose = copy(result.poseLandmarks, 33);
  motion.world = copy(result.poseWorldLandmarks ?? result.za, 33);
  motion.face = copy(result.faceLandmarks, result.faceLandmarks?.length === 478 ? 478 : 468);
  if (!Number.isFinite(aspect) || aspect <= 0) return motion;
  motion.aspect = aspect;
  for (const [side, landmarks] of [['left', result.leftHandLandmarks], ['right', result.rightHandLandmarks]] as const) {
    const image = copy(landmarks, 21);
    if (!image.length) continue;
    const wrist = image[0];
    motion.hands[side] = {
      image,
      local: image.map(p => ({ x: p.x - wrist.x, y: (p.y - wrist.y) / aspect, z: p.z - wrist.z })),
    };
  }
  return motion;
}
