import { valid, type Landmark, type MotionFrame } from './motion.ts';

const poseEdges = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32],[7,8]];
const handEdges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

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
  for (const side of ['left', 'right'] as const) {
    const hand = motion.hands[side];
    if (hand) draw(hand.image, handEdges, side === 'left' ? '#ffd486' : '#8faeff', 0);
  }
}
