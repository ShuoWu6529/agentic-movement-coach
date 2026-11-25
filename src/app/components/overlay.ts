// Skeleton overlay (R-F5, AC 5). Drawn straight onto a canvas from the frame loop, not through React.
// One neutral colour: the overlay never encodes movement advice (R-S1). When tracking is unreliable
// the skeleton is faded, which says only that the camera can't see the patient well.

import { imagePoint, SKELETON_EDGES } from '../../core/pose';

export type Ctx2d = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'arc' | 'fill' | 'lineWidth' | 'strokeStyle' | 'fillStyle' | 'globalAlpha'
>;

const COLOUR = '#7fd1ff';

export function drawPose(
  ctx: Ctx2d,
  lm: readonly number[] | null,
  size: { width: number; height: number },
  required: readonly number[],
  reliable: boolean,
): void {
  const { width: w, height: h } = size;
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const scale = Math.max(w, h) / 640;
  ctx.globalAlpha = reliable ? 1 : 0.35;
  ctx.strokeStyle = COLOUR;
  ctx.fillStyle = COLOUR;
  ctx.lineWidth = 3 * scale;
  for (const [a, b] of SKELETON_EDGES) {
    const p = imagePoint(lm, a);
    const q = imagePoint(lm, b);
    if (p.visibility < 0.3 || q.visibility < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
    ctx.stroke();
  }
  for (const i of required) {
    const p = imagePoint(lm, i);
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
