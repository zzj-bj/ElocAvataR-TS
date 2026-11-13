import { type Landmark, type MotionFrame } from './motion.ts';

/** Deterministic synthetic landmarks, explicitly separate from real camera tracking. */
export function demoMotion(time: number): MotionFrame {
  const world: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const set = (index: number, x: number, y: number, z = 0) => { world[index] = { x, y, z, visibility: 1 }; };
  set(0, 0, -0.72, -0.12); set(7, 0.08, -0.72); set(8, -0.08, -0.72);
  set(11, 0.2, -0.5); set(12, -0.2, -0.5);
  set(23, 0.12, 0); set(24, -0.12, 0);
  set(25, 0.12, 0.42); set(26, -0.12, 0.42);
  set(27, 0.12, 0.83); set(28, -0.12, 0.83);
  set(31, 0.12, 0.88, -0.13); set(32, -0.12, 0.88, -0.13);
  const hands: MotionFrame['hands'] = {};
  for (const [side, sign, offset] of [['left', 1, 0], ['right', -1, 1]] as const) {
    const wave = 0.1 * Math.sin(time * 1.2 + offset);
    set(13 + offset, sign * 0.43, -0.34, -0.06);
    set(15 + offset, sign * (0.48 + wave), -0.63, -0.12);
    const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    for (let finger = 0; finger < 5; finger++) {
      const start = 1 + finger * 4;
      const curl = (1 + Math.sin(time * 1.8 + finger * 1.1 + offset * 1.7)) * 0.65;
      let y = -0.045;
      let z = 0;
      const x = sign * (finger - 2) * 0.02;
      points[start] = { x, y, z };
      for (let j = 1; j < 4; j++) {
        y -= Math.cos(curl * j) * 0.022;
        z -= Math.sin(curl * j) * 0.022;
        points[start + j] = { x, y, z };
      }
    }
    hands[side] = { image: points, local: points };
  }
  return { timestamp: performance.now(), aspect: 1, pose: [], world, face: [], hands };
}
