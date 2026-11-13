import type { Diagram, DiagramEdge } from '../engine/types';
import type { Pt } from './geometry';
import { arrowHead, strokePath, type LineKind } from './lines';
import type { EdgeState, EdgeView } from './view';

export interface SceneEdge {
  id: string;
  kind: LineKind;
  state: EdgeState;
  /** Visible stroke (straight / wavy / curly). */
  d: string;
  /** Smooth centerline used for tap targets. */
  hitD: string;
  /** Arrowhead triangle path (fermions and unknown edges drawn with an arrow). */
  arrow: string | null;
  label: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null;
}

export interface SceneVertex {
  id: string;
  x: number;
  y: number;
  state: 'normal' | 'ok' | 'error';
  /** Small number drawn next to the vertex (used by hints: "vertex 2"). */
  label?: string;
}

export interface Scene {
  width: number;
  height: number;
  edges: SceneEdge[];
  vertices: SceneVertex[];
  /** Layout-unit -> pixel mapping, so editors can convert pointer positions back. */
  transform: { offX: number; offY: number; scale: number; minX: number; minY: number };
  /** Position of the small "time" arrow drawn at the bottom. */
  timeAxis: { x0: number; x1: number; y: number };
}

export interface SceneOptions {
  width?: number;
  maxHeight?: number;
  minHeight?: number;
  padding?: number;
  vertexStates?: Record<string, 'ok' | 'error'>;
  vertexLabels?: Record<string, string>;
  /** Fixed layout bounds (editor): keeps the scale constant while nodes move. */
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
  /** Draw an arrowhead on unknown (hidden) edges? Default false: an arrow would leak "this is a fermion". */
  arrowOnUnknown?: boolean;
}

/**
 * Compute the sideways bulge (in layout units) for each edge.
 * Explicit `bend` wins; otherwise parallel edges between the same two nodes
 * are fanned out so loops (penguins, boxes, self-energy) are visible.
 */
export function edgeBends(d: Diagram): Record<string, number> {
  const groups = new Map<string, DiagramEdge[]>();
  for (const e of d.edges) {
    const key = [e.from, e.to].sort().join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const out: Record<string, number> = {};
  for (const [key, es] of groups) {
    const canonFrom = key.split('|')[0];
    es.forEach((e, i) => {
      if (e.bend !== undefined) {
        out[e.id] = e.bend;
        return;
      }
      if (es.length === 1) {
        out[e.id] = 0;
        return;
      }
      const b = (i - (es.length - 1) / 2) * 0.7; // canonical a->b direction
      out[e.id] = e.from === canonFrom ? b : -b;
    });
  }
  return out;
}

export function buildScene(d: Diagram, views: Record<string, EdgeView>, o: SceneOptions = {}): Scene {
  const W = o.width ?? 520;
  const pad = o.padding ?? 56;
  const maxH = o.maxHeight ?? 420;
  const minH = o.minHeight ?? 220;

  const bends = edgeBends(d);
  const xs = d.nodes.map((n) => n.x);
  const ys = d.nodes.map((n) => n.y);
  // include the midpoints of bent edges so loops never poke outside the frame
  const nodeById = new Map(d.nodes.map((n) => [n.id, n]));
  for (const e of d.edges) {
    const b = bends[e.id] ?? 0;
    const a = nodeById.get(e.from);
    const c = nodeById.get(e.to);
    if (!b || !a || !c) continue;
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    xs.push((a.x + c.x) / 2 - ((c.y - a.y) / len) * b);
    ys.push((a.y + c.y) / 2 + ((c.x - a.x) / len) * b);
  }
  const minX = o.bounds ? o.bounds.minX : Math.min(...xs);
  const maxX = o.bounds ? o.bounds.maxX : Math.max(...xs);
  const minY = o.bounds ? o.bounds.minY : Math.min(...ys);
  const maxY = o.bounds ? o.bounds.maxY : Math.max(...ys);
  const bw = Math.max(maxX - minX, 1e-6);
  const bh = Math.max(maxY - minY, 1e-6);
  // leave room at the bottom for the time axis
  const axisRoom = 26;
  const scale = Math.min((W - 2 * pad) / bw, (maxH - 2 * pad - axisRoom) / bh);
  const contentH = bh * scale;
  const H = Math.max(minH, contentH + 2 * pad + axisRoom);
  const offX = (W - bw * scale) / 2;
  const offY = (H - axisRoom - contentH) / 2;
  const P = (id: string): Pt => {
    const n = d.nodes.find((n) => n.id === id)!;
    return { x: offX + (n.x - minX) * scale, y: offY + (n.y - minY) * scale };
  };

  const vertexNodes = d.nodes.filter((n) => n.kind === 'vertex');
  const pool = vertexNodes.length ? vertexNodes : d.nodes;
  const centroid: Pt = {
    x: pool.reduce((a, n) => a + P(n.id).x, 0) / pool.length,
    y: pool.reduce((a, n) => a + P(n.id).y, 0) / pool.length,
  };

  const kindOf = new Map(d.nodes.map((n) => [n.id, n.kind]));
  const edges: SceneEdge[] = [];
  for (const e of d.edges) {
    if (e.from === e.to) continue; // self-loops are not drawable (and not valid)
    const v = views[e.id] ?? { kind: 'unknown' as LineKind, label: null, state: 'normal' as EdgeState };
    const p0 = P(e.from);
    const p1 = P(e.to);
    const { d: pathD, curve } = strokePath(v.kind, p0, p1, (bends[e.id] ?? 0) * scale);

    const wantsArrow = v.kind === 'fermion' || (v.kind === 'unknown' && o.arrowOnUnknown === true);
    const external = kindOf.get(e.from) === 'external' || kindOf.get(e.to) === 'external';
    const arrow = wantsArrow ? arrowHead(curve.point(0.5), curve.tangent(0.5)) : null;

    let label: SceneEdge['label'] = null;
    if (v.label) {
      const OFF = 20;
      if (external && kindOf.get(e.from) !== kindOf.get(e.to)) {
        const extIsFrom = kindOf.get(e.from) === 'external';
        const ext = extIsFrom ? p0 : p1;
        const inner = extIsFrom ? p1 : p0;
        const dx = ext.x - inner.x;
        const dy = ext.y - inner.y;
        const l = Math.hypot(dx, dy) || 1;
        const ux = dx / l;
        const uy = dy / l;
        const anchor = ux > 0.35 ? 'start' : ux < -0.35 ? 'end' : 'middle';
        // nudge sideways more when anchored at the start/end so text clears the leg
        label = { text: v.label, x: ext.x + ux * 12, y: ext.y + uy * 14 + (Math.abs(uy) < 0.35 ? 0 : 4), anchor };
      } else {
        const m = curve.point(0.5);
        const n = curve.normal(0.5);
        const dot = n.x * (m.x - centroid.x) + n.y * (m.y - centroid.y);
        const side = dot >= 0 ? 1 : -1;
        label = { text: v.label, x: m.x + n.x * side * OFF, y: m.y + n.y * side * OFF, anchor: 'middle' };
      }
    }
    edges.push({ id: e.id, kind: v.kind, state: v.state, d: pathD, hitD: curve.path, arrow, label });
  }

  const vertices: SceneVertex[] = vertexNodes.map((n) => ({
    id: n.id,
    ...P(n.id),
    state: o.vertexStates?.[n.id] ?? 'normal',
    label: o.vertexLabels?.[n.id],
  }));

  const axisY = H - 14;
  return {
    width: W,
    height: H,
    edges,
    vertices,
    transform: { offX, offY, scale, minX, minY },
    timeAxis: { x0: W / 2 - 34, x1: W / 2 + 34, y: axisY },
  };
}
