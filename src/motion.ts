export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Side = 'left' | 'right';
export interface HandMotion {
  image: Landmark[];
  local: Landmark[];
}
export interface MotionFrame {
  timestamp: number;
  aspect: number;
  pose: Landmark[];
  world: Landmark[];
  face: Landmark[];
  hands: Partial<Record<Side, HandMotion>>;
}

export const emptyMotion = (timestamp = 0): MotionFrame => ({ timestamp, aspect: 1, pose: [], world: [], face: [], hands: {} });
export const valid = (p: Landmark | undefined, threshold = 0): p is Landmark =>
  !!p && [p.x, p.y, p.z].every(Number.isFinite) && (p.visibility ?? 1) >= threshold;
