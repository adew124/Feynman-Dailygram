import { makeCurve, type Curve, type Pt } from './geometry';

/** How an edge is drawn. Fermions = arrow, photon/W/Z = wavy, gluon = curly, Higgs = dashed. */
export type LineKind = 'fermion' | 'photon' | 'gluon' | 'higgs' | 'unknown';

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function poly(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p.x)} ${f(p.y)}`).join('');
}

/** Sine wave along the centerline (W, Z, photon). Ends on the centerline. */
export function wavyPath(c: Curve, wavelength = 15, amplitude = 4.5): string {
  const waves = Math.max(2, Math.round(c.length / wavelength));
  const n = Math.max(24, Math.ceil(c.length / 2.5));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = amplitude * Math.sin(2 * Math.PI * waves * t);
    const p = c.point(t);
    const nr = c.normal(t);
    pts.push({ x: p.x + nr.x * o, y: p.y + nr.y * o });
  }
  return poly(pts);
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Coil (prolate cycloid) for gluons; coils flatten near the endpoints. */
export function curlyPath(c: Curve, coilLength = 17, loopSize = 2.3): string {
  const coils = Math.max(3, Math.round(c.length / coilLength));
  const k = c.length / (2 * Math.PI * coils); // advance per radian
  const d = k * loopSize; // > k makes loops
  const total = 2 * Math.PI * coils;
  const steps = coils * 18;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const phi = (i / steps) * total;
    const e = smooth(Math.min(phi, total - phi) / (2 * Math.PI * 0.8));
    const along = k * phi - d * e * Math.sin(phi);
    const side = -d * e * Math.cos(phi);
    const t = Math.min(1, Math.max(0, along / c.length));
    const p = c.point(t);
    const nr = c.normal(t);
    pts.push({ x: p.x + nr.x * side, y: p.y + nr.y * side });
  }
  return poly(pts);
}

/** Filled triangle for a fermion arrow centered at `at`, pointing along `dir`. */
export function arrowHead(at: Pt, dir: Pt, size = 8): string {
  const tip = { x: at.x + dir.x * size * 0.6, y: at.y + dir.y * size * 0.6 };
  const bx = at.x - dir.x * size * 0.6;
  const by = at.y - dir.y * size * 0.6;
  const w = size * 0.5;
  const l = { x: bx - dir.y * w, y: by + dir.x * w };
  const r = { x: bx + dir.y * w, y: by - dir.x * w };
  return `M${f(tip.x)} ${f(tip.y)}L${f(l.x)} ${f(l.y)}L${f(r.x)} ${f(r.y)}Z`;
}

/** Path for the visible stroke of an edge of the given kind. */
export function strokePath(kind: LineKind, p0: Pt, p1: Pt, bend: number): { d: string; curve: Curve } {
  const curve = makeCurve(p0, p1, bend);
  switch (kind) {
    case 'photon':
      return { d: wavyPath(curve), curve };
    case 'gluon':
      return { d: curlyPath(curve), curve };
    default:
      return { d: curve.path, curve };
  }
}
