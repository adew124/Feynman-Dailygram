export interface Pt {
  x: number;
  y: number;
}

export interface Curve {
  /** Point at parameter t in [0,1]. */
  point(t: number): Pt;
  /** Unit tangent at t, pointing from p0 toward p1. */
  tangent(t: number): Pt;
  /** Unit normal at t (tangent rotated +90 degrees; SVG coords, y down). */
  normal(t: number): Pt;
  length: number;
  /** SVG path 'M..Q..' / 'M..L..' of the centerline. */
  path: string;
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * Centerline between two points. bend = max sideways deviation in px
 * (0 -> straight). Positive bend bulges toward `normal`.
 */
export function makeCurve(p0: Pt, p1: Pt, bend = 0): Curve {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const chord = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / chord;
  const uy = dy / chord;
  const nx = -uy;
  const ny = ux;
  // quadratic bezier whose midpoint deviates by `bend`: control offset = 2*bend
  const c: Pt = { x: (p0.x + p1.x) / 2 + nx * 2 * bend, y: (p0.y + p1.y) / 2 + ny * 2 * bend };
  const straight = Math.abs(bend) < 1e-6;

  const point = (t: number): Pt => {
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    return { x: a * p0.x + b * c.x + d * p1.x, y: a * p0.y + b * c.y + d * p1.y };
  };
  const tangent = (t: number): Pt => {
    if (straight) return { x: ux, y: uy };
    const tx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x);
    const ty = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y);
    const l = Math.hypot(tx, ty) || 1e-6;
    return { x: tx / l, y: ty / l };
  };
  const normal = (t: number): Pt => {
    const T = tangent(t);
    return { x: -T.y, y: T.x };
  };

  let length = chord;
  if (!straight) {
    length = 0;
    let prev = point(0);
    for (let i = 1; i <= 32; i++) {
      const q = point(i / 32);
      length += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
  }
  const path = straight
    ? `M${f(p0.x)} ${f(p0.y)}L${f(p1.x)} ${f(p1.y)}`
    : `M${f(p0.x)} ${f(p0.y)}Q${f(c.x)} ${f(c.y)} ${f(p1.x)} ${f(p1.y)}`;
  return { point, tangent, normal, length, path };
}
