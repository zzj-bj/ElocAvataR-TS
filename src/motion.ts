export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Side = 'left' | 'right';
export interface HandMotion {
  image: Landmark[];
  world: Landmark[];
}
export interface MotionFrame {
  timestamp: number;
  pose: Landmark[];
  world: Landmark[];
  hands: Partial<Record<Side, HandMotion>>;
}

export const emptyMotion = (timestamp = 0): MotionFrame => ({ timestamp, pose: [], world: [], hands: {} });
export const valid = (p: Landmark | undefined, threshold = 0): p is Landmark =>
  !!p && [p.x, p.y, p.z].every(Number.isFinite) && (p.visibility ?? 1) >= threshold;

/** Associate in the original, unmirrored image. Pose wrists avoid selfie handedness ambiguity. */
export function associateHands(pose: Landmark[], images: Landmark[][], worlds: Landmark[][]): MotionFrame['hands'] {
  const hands: MotionFrame['hands'] = {};
  const candidates: { side: Side; index: number; distance: number }[] = [];
  for (const [side, wrist] of [['left', 15], ['right', 16]] as const) {
    if (!valid(pose[wrist], 0.5)) continue;
    images.forEach((points, index) => {
      if (points.length !== 21 || worlds[index]?.length !== 21 ||
          !points.every(p => valid(p)) || !worlds[index].every(p => valid(p))) return;
      const distance = Math.hypot(points[0].x - pose[wrist].x, points[0].y - pose[wrist].y);
      if (distance < 0.22) candidates.push({ side, index, distance });
    });
  }
  // At most two hands: maximize matched wrists, then minimize total image distance.
  let best: typeof candidates = [];
  let cost = Infinity;
  for (const a of [undefined, ...candidates.filter(c => c.side === 'left')]) {
    for (const b of [undefined, ...candidates.filter(c => c.side === 'right')]) {
      if (a && b && a.index === b.index) continue;
      const assignment = [a, b].filter((c): c is NonNullable<typeof c> => !!c);
      const distance = assignment.reduce((sum, c) => sum + c.distance, 0);
      if (assignment.length > best.length || (assignment.length === best.length && distance < cost)) {
        best = assignment;
        cost = distance;
      }
    }
  }
  for (const c of best) hands[c.side] = { image: images[c.index], world: worlds[c.index] };
  return hands;
}
