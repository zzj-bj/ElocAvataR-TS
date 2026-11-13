import { valid, type Landmark, type MotionFrame } from './motion.ts';

const poseEdges = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32],[7,8]];
const handEdges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const faceEdges = [[33,160],[160,158],[158,133],[133,153],[153,144],[144,33],[362,385],[385,387],[387,263],[263,373],[373,380],[380,362],[61,40],[40,0],[0,270],[270,291],[291,321],[321,17],[17,91],[91,61],[1,4],[4,168]];

export function drawOverlay(canvas: HTMLCanvasElement, motion: MotionFrame, threshold: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const draw = (points: Landmark[], edges: number[][], color: string, visibility: number) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = '#eefaff';
    ctx.lineWidth = 3;
    for (const [a, b] of edges) {
      if (!valid(points[a], visibility) || !valid(points[b], visibility)) continue;
      ctx.beginPath();
      ctx.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
      ctx.lineTo(points[b].x * canvas.width, points[b].y * canvas.height);
      ctx.stroke();
    }
    for (const p of points) if (valid(p, visibility)) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  };
  draw(motion.pose, poseEdges, '#75dcca', threshold);
  // Draw sparse facial contours instead of all 478 points to keep the preview readable.
  if (motion.face.length) {
    ctx.strokeStyle = '#c0a8ed';
    ctx.lineWidth = 1.5;
    for (const [a, b] of faceEdges) if (valid(motion.face[a]) && valid(motion.face[b])) {
      ctx.beginPath();
      ctx.moveTo(motion.face[a].x * canvas.width, motion.face[a].y * canvas.height);
      ctx.lineTo(motion.face[b].x * canvas.width, motion.face[b].y * canvas.height);
      ctx.stroke();
    }
  }
  for (const side of ['left', 'right'] as const) {
    const hand = motion.hands[side];
    if (hand) draw(hand.image, handEdges, side === 'left' ? '#ffd486' : '#8faeff', 0);
  }
}
