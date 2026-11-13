import { valid, type Landmark } from './motion.ts';

export interface FaceExpressions { blinkLeft: number; blinkRight: number; aa: number }

/** Approximate geometric expression ratios; these are not Holistic blendshape outputs. */
export function solveFace(points: Landmark[], aspect: number): FaceExpressions {
  const rest: FaceExpressions = { blinkLeft: 0, blinkRight: 0, aa: 0 };
  if (points.length < 468 || !Number.isFinite(aspect) || aspect <= 0) return rest;
  const distance = (a: number, b: number): number => {
    if (!valid(points[a]) || !valid(points[b])) return NaN;
    return Math.hypot(points[a].x - points[b].x, (points[a].y - points[b].y) / aspect);
  };
  const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const blink = (upper: number, lower: number, outer: number, inner: number) => {
    const width = distance(outer, inner);
    return width > 1e-6 ? clamp((0.26 - distance(upper, lower) / width) / 0.17) : 0;
  };
  const mouthWidth = distance(61, 291);
  return {
    blinkLeft: blink(386, 374, 362, 263),
    blinkRight: blink(159, 145, 33, 133),
    aa: mouthWidth > 1e-6 ? clamp((distance(13, 14) / mouthWidth - 0.02) * 3) : 0,
  };
}
