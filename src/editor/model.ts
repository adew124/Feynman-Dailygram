import { physicalParticle } from '../engine/orientation';
import { antiparticle, getParticle, isParticleId, type ParticleId } from '../engine/particles';
import type { Diagram, DiagramEdge, DiagramNode } from '../engine/types';

/**
 * Editor model. Unlike the engine's Diagram, each edge here stores the PHYSICAL
 * particle (what a student would write on the line, forward in time). The
 * engine's along-the-arrow form is derived in toDiagram(), so moving a vertex
 * never silently changes what a line means.
 */
export const BOUNDS = { minX: 0, maxX: 8, minY: 0, maxY: 5 };
export const SNAP = 0.5;
export const LIMITS = { vertices: 16, externals: 12, edges: 30, hidden: 8, title: 60, message: 280 };

export interface EdNode {
  id: string;
  kind: 'vertex' | 'external';
  x: number;
  y: number;
}

export interface EdEdge {
  id: string;
  /** Endpoints as drawn (for vertical lines, a -> b is taken as the direction of time). */
  a: string;
  b: string;
  /** Physical particle, or null while unassigned. */
  p: ParticleId | null;
  hidden: boolean;
  /** Sideways bulge in layout units, relative to a -> b (usually undefined = automatic). */
  bend?: number;
}

export interface EditorModel {
  nodes: EdNode[];
  edges: EdEdge[];
  title: string;
  message: string;
  /** Counter for generating ids. */
  seq: number;
}

export function emptyModel(): EditorModel {
  return { nodes: [], edges: [], title: '', message: '', seq: 0 };
}

const clone = (m: EditorModel): EditorModel => JSON.parse(JSON.stringify(m)) as EditorModel;

export function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

export function clampPoint(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, snap(x))),
    y: Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, snap(y))),
  };
}

export function countKind(m: EditorModel, kind: EdNode['kind']): number {
  return m.nodes.filter((n) => n.kind === kind).length;
}

export function nodeAt(m: EditorModel, x: number, y: number, eps = 0.01): EdNode | undefined {
  return m.nodes.find((n) => Math.abs(n.x - x) < eps && Math.abs(n.y - y) < eps);
}

export type Result<T> = { ok: true; model: EditorModel; value: T } | { ok: false; error: string };

export function addVertex(m: EditorModel, x: number, y: number): Result<string> {
  if (countKind(m, 'vertex') >= LIMITS.vertices) return { ok: false, error: `At most ${LIMITS.vertices} vertices.` };
  const p = clampPoint(x, y);
  if (nodeAt(m, p.x, p.y)) return { ok: false, error: 'Something is already there.' };
  const n = clone(m);
  const id = `v${++n.seq}`;
  n.nodes.push({ id, kind: 'vertex', x: p.x, y: p.y });
  return { ok: true, model: n, value: id };
}

function hasNode(m: EditorModel, id: string, kind?: EdNode['kind']): boolean {
  return m.nodes.some((n) => n.id === id && (!kind || n.kind === kind));
}

export function addEdge(m: EditorModel, a: string, b: string): Result<string> {
  if (a === b || !hasNode(m, a, 'vertex') || !hasNode(m, b, 'vertex')) return { ok: false, error: 'Connect two different vertices.' };
  if (m.edges.length >= LIMITS.edges) return { ok: false, error: `At most ${LIMITS.edges} lines.` };
  const n = clone(m);
  const id = `e${++n.seq}`;
  n.edges.push({ id, a, b, p: null, hidden: false });
  return { ok: true, model: n, value: id };
}

/** Add an external leg from `vertex` ending at a new external point (x, y). */
export function addExternalLeg(m: EditorModel, vertex: string, x: number, y: number): Result<string> {
  if (!hasNode(m, vertex, 'vertex')) return { ok: false, error: 'Legs start at a vertex.' };
  if (countKind(m, 'external') >= LIMITS.externals) return { ok: false, error: `At most ${LIMITS.externals} external legs.` };
  if (m.edges.length >= LIMITS.edges) return { ok: false, error: `At most ${LIMITS.edges} lines.` };
  const p = clampPoint(x, y);
  if (nodeAt(m, p.x, p.y)) return { ok: false, error: 'Something is already there.' };
  const n = clone(m);
  const xid = `x${++n.seq}`;
  const id = `e${++n.seq}`;
  n.nodes.push({ id: xid, kind: 'external', x: p.x, y: p.y });
  n.edges.push({ id, a: vertex, b: xid, p: null, hidden: false });
  return { ok: true, model: n, value: id };
}

export function moveNode(m: EditorModel, id: string, x: number, y: number): Result<void> {
  const p = clampPoint(x, y);
  const cur = m.nodes.find((n) => n.id === id);
  if (!cur) return { ok: false, error: 'No such point.' };
  if (cur.x === p.x && cur.y === p.y) return { ok: true, model: m, value: undefined };
  const other = nodeAt(m, p.x, p.y);
  if (other && other.id !== id) return { ok: false, error: 'Something is already there.' };
  const n = clone(m);
  const node = n.nodes.find((q) => q.id === id)!;
  node.x = p.x;
  node.y = p.y;
  return { ok: true, model: n, value: undefined };
}

/** Delete a vertex (with its lines) or an external point (with its line). */
export function deleteNode(m: EditorModel, id: string): EditorModel {
  const n = clone(m);
  n.nodes = n.nodes.filter((q) => q.id !== id);
  n.edges = n.edges.filter((e) => e.a !== id && e.b !== id);
  const used = new Set(n.edges.flatMap((e) => [e.a, e.b]));
  n.nodes = n.nodes.filter((q) => q.kind === 'vertex' || used.has(q.id)); // drop orphaned external points
  return n;
}

export function deleteEdge(m: EditorModel, id: string): EditorModel {
  const n = clone(m);
  n.edges = n.edges.filter((e) => e.id !== id);
  const used = new Set(n.edges.flatMap((e) => [e.a, e.b]));
  n.nodes = n.nodes.filter((q) => q.kind === 'vertex' || used.has(q.id));
  return n;
}

export function setParticle(m: EditorModel, edgeId: string, physical: ParticleId | null): EditorModel {
  if (physical !== null && !isParticleId(physical)) return m;
  const n = clone(m);
  const e = n.edges.find((q) => q.id === edgeId);
  if (e) e.p = physical;
  return n;
}

export function toggleHidden(m: EditorModel, edgeId: string): EditorModel {
  const n = clone(m);
  const e = n.edges.find((q) => q.id === edgeId);
  if (e) e.hidden = !e.hidden;
  return n;
}

export function setText(m: EditorModel, title: string, message: string): EditorModel {
  return { ...m, title: title.slice(0, LIMITS.title), message: message.slice(0, LIMITS.message) };
}

export function hiddenIds(m: EditorModel): string[] {
  return m.edges.filter((e) => e.hidden).map((e) => e.id);
}

/**
 * Convert to the engine's graph. The arrow of a fermion line points along
 * fermion flow: forward in time for particles, BACKWARD in time for
 * antiparticles. Edges between nodes at the same x have no time direction, so
 * they keep the drawn direction a -> b and store the physical particle as is.
 */
export function toDiagram(m: EditorModel): Diagram {
  const nodes: DiagramNode[] = m.nodes.map((n) => ({ ...n }));
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const edges: DiagramEdge[] = [];
  for (const e of m.edges) {
    const A = byId.get(e.a);
    const B = byId.get(e.b);
    if (!A || !B) continue;
    // earlier node first (ties keep drawing order)
    let from = e.a;
    let to = e.b;
    if (B.x < A.x) {
      from = e.b;
      to = e.a;
    }
    let particle: ParticleId | null = e.p;
    if (e.p !== null) {
      const p = getParticle(e.p);
      const strictlyOrdered = A.x !== B.x;
      if (p.fermion && p.isAnti && strictlyOrdered) {
        // antifermion: arrow points backward in time, stored particle is the antiparticle
        [from, to] = [to, from];
        particle = antiparticle(e.p);
      }
    }
    const edge: DiagramEdge = { id: e.id, from, to, particle };
    if (e.bend !== undefined) edge.bend = from === e.a ? e.bend : -e.bend;
    edges.push(edge);
  }
  return { nodes, edges };
}

/** Convert an engine diagram to an editor model (used for "start from a library process"). */
export function modelFromDiagram(d: Diagram, hidden: readonly string[] = [], title = ''): EditorModel {
  const xs = d.nodes.map((n) => n.x);
  const ys = d.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bw = Math.max(maxX - minX, 0.001);
  const bh = Math.max(maxY - minY, 0.001);
  const s = Math.min((BOUNDS.maxX - BOUNDS.minX - 1) / bw, (BOUNDS.maxY - BOUNDS.minY - 1) / bh, 1.8);
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2 - ((minX + maxX) / 2) * s;
  const cy = (BOUNDS.minY + BOUNDS.maxY) / 2 - ((minY + maxY) / 2) * s;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const hid = new Set(hidden);
  let seq = 0;
  const rename = new Map<string, string>();
  const nodes: EdNode[] = d.nodes.map((n) => {
    const id = `${n.kind === 'vertex' ? 'v' : 'x'}${++seq}`;
    rename.set(n.id, id);
    return { id, kind: n.kind, x: r2(n.x * s + cx), y: r2(n.y * s + cy) };
  });
  const edges: EdEdge[] = d.edges.map((e) => {
    const out: EdEdge = {
      id: `e${++seq}`,
      a: rename.get(e.from)!,
      b: rename.get(e.to)!,
      p: e.particle === null ? null : physicalParticle(d, e),
      hidden: hid.has(e.id),
    };
    if (e.bend !== undefined) out.bend = e.bend * s;
    return out;
  });
  return { nodes, edges, title: title.slice(0, LIMITS.title), message: '', seq };
}

/** Coerce untrusted JSON (e.g. a saved draft) into a safe model; falls back to empty. */
export function sanitizeModel(raw: unknown): EditorModel {
  if (!raw || typeof raw !== 'object') return emptyModel();
  const r = raw as Partial<EditorModel>;
  if (!Array.isArray(r.nodes) || !Array.isArray(r.edges)) return emptyModel();
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const nodes: EdNode[] = [];
  const ids = new Set<string>();
  for (const n of r.nodes as Partial<EdNode>[]) {
    if (!n || typeof n.id !== 'string' || n.id.length > 12 || ids.has(n.id)) return emptyModel();
    if (n.kind !== 'vertex' && n.kind !== 'external') return emptyModel();
    if (!num(n.x) || !num(n.y)) return emptyModel();
    ids.add(n.id);
    nodes.push({
      id: n.id,
      kind: n.kind,
      x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, n.x as number)),
      y: Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, n.y as number)),
    });
  }
  const edges: EdEdge[] = [];
  const eids = new Set<string>();
  for (const e of r.edges as Partial<EdEdge>[]) {
    if (!e || typeof e.id !== 'string' || e.id.length > 12 || eids.has(e.id)) return emptyModel();
    if (typeof e.a !== 'string' || typeof e.b !== 'string' || !ids.has(e.a) || !ids.has(e.b) || e.a === e.b) return emptyModel();
    if (e.p !== null && !(typeof e.p === 'string' && isParticleId(e.p))) return emptyModel();
    const edge: EdEdge = { id: e.id, a: e.a, b: e.b, p: e.p ?? null, hidden: e.hidden === true };
    if (num(e.bend)) edge.bend = Math.max(-3, Math.min(3, e.bend as number));
    eids.add(e.id);
    edges.push(edge);
  }
  if (nodes.length > 40 || edges.length > 60) return emptyModel();
  return {
    nodes,
    edges,
    title: typeof r.title === 'string' ? r.title.slice(0, LIMITS.title) : '',
    message: typeof r.message === 'string' ? r.message.slice(0, LIMITS.message) : '',
    seq: num(r.seq) ? Math.max(0, Math.floor(r.seq as number)) : nodes.length + edges.length,
  };
}

