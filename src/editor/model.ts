import { groupContent } from '../engine/decays';
import { getHadron, isHadronId } from '../engine/hadrons';
import { physicalParticle } from '../engine/orientation';
import { antiparticle, getParticle, isParticleId, type ParticleId } from '../engine/particles';
import type { Diagram, DiagramEdge, DiagramNode, HadronGroup } from '../engine/types';

/**
 * Editor model. Unlike the engine's Diagram, each edge here stores the PHYSICAL
 * particle (what a student would write on the line, forward in time). The
 * engine's along-the-arrow form is derived in toDiagram(), so moving a vertex
 * never silently changes what a line means.
 */
export const BOUNDS = { minX: 0, maxX: 8, minY: 0, maxY: 5 };
export const SNAP = 0.5;
export const LIMITS = { vertices: 16, externals: 12, edges: 30, hidden: 8, groups: 6, title: 60, message: 280 };

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

/**
 * A hadron drawn as its quark lines: a stack of external points (one per quark) that the player connects to
 * vertices, or to the points of a hadron on the other side (spectator lines).
 */
export interface EdGroup {
  id: string;
  /** Hadron id from the hadron table. */
  hadron: string;
  /** Which quark component of a mixed state is drawn (index into the hadron's components). */
  comp: number;
  /** External point ids, one per quark, top to bottom. */
  nodes: string[];
  hidden: boolean;
}

export interface EditorModel {
  nodes: EdNode[];
  edges: EdEdge[];
  groups: EdGroup[];
  title: string;
  message: string;
  /** Counter for generating ids. */
  seq: number;
}

export function emptyModel(): EditorModel {
  return { nodes: [], edges: [], groups: [], title: '', message: '', seq: 0 };
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

export function groupOfNode(m: EditorModel, nodeId: string): EdGroup | undefined {
  return m.groups.find((g) => g.nodes.includes(nodeId));
}

/** Incoming (left half of the canvas) or outgoing hadron, from where it sits. */
export function groupSide(m: EditorModel, g: EdGroup): 'in' | 'out' {
  const xs = g.nodes.map((id) => m.nodes.find((n) => n.id === id)?.x ?? 0);
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return mean < (BOUNDS.minX + BOUNDS.maxX) / 2 ? 'in' : 'out';
}

/** The quark of the drawn component that belongs to external point `nodeId` of group `g`. */
export function quarkOf(g: EdGroup, nodeId: string): ParticleId | null {
  const h = getHadron(g.hadron);
  const comp = h.components[Math.min(g.comp, h.components.length - 1)];
  return comp.quarks[g.nodes.indexOf(nodeId)] ?? null;
}

const isUsed = (m: EditorModel, id: string) => m.edges.some((e) => e.a === id || e.b === id);

/**
 * Connect two points with a line. Allowed: two vertices; a vertex and a free quark point of a hadron; a free
 * quark point of an incoming hadron and one of an outgoing hadron (a spectator quark). A line to a quark point
 * is created with that quark's particle already chosen.
 */
export function addEdge(m: EditorModel, a: string, b: string): Result<string> {
  const A = m.nodes.find((n) => n.id === a);
  const B = m.nodes.find((n) => n.id === b);
  if (!A || !B || a === b) return { ok: false, error: 'Connect two different points.' };
  if (m.edges.length >= LIMITS.edges) return { ok: false, error: `At most ${LIMITS.edges} lines.` };
  const ga = groupOfNode(m, a);
  const gb = groupOfNode(m, b);
  let p: ParticleId | null = null;
  if (A.kind === 'vertex' && B.kind === 'vertex') {
    // plain internal line
  } else if (A.kind === 'vertex' && gb) {
    if (isUsed(m, b)) return { ok: false, error: 'That quark line is already connected.' };
    p = quarkOf(gb, b);
  } else if (B.kind === 'vertex' && ga) {
    if (isUsed(m, a)) return { ok: false, error: 'That quark line is already connected.' };
    p = quarkOf(ga, a);
  } else if (ga && gb) {
    if (ga.id === gb.id) return { ok: false, error: 'Connect a quark line to a vertex, or to the other hadron.' };
    if (isUsed(m, a) || isUsed(m, b)) return { ok: false, error: 'That quark line is already connected.' };
    if (groupSide(m, ga) === groupSide(m, gb)) return { ok: false, error: 'A spectator quark runs from an incoming hadron to an outgoing one.' };
    p = groupSide(m, ga) === 'in' ? quarkOf(ga, a) : quarkOf(gb, b);
  } else {
    return { ok: false, error: 'Connect two vertices, a vertex and a quark line of a hadron, or two hadrons.' };
  }
  const n = clone(m);
  const id = `e${++n.seq}`;
  n.edges.push({ id, a, b, p, hidden: false });
  return { ok: true, model: n, value: id };
}

/** Place a hadron as a vertical stack of quark points around (x, y). */
export function addGroup(m: EditorModel, hadronId: string, comp: number, x: number, y: number): Result<string> {
  if (!isHadronId(hadronId)) return { ok: false, error: 'Unknown hadron.' };
  const h = getHadron(hadronId);
  const k = h.components[0].quarks.length;
  if (m.groups.length >= LIMITS.groups) return { ok: false, error: `At most ${LIMITS.groups} hadrons.` };
  if (countKind(m, 'external') + k > LIMITS.externals) return { ok: false, error: `At most ${LIMITS.externals} external points.` };
  const c = clampPoint(x, y);
  let top = c.y - Math.floor((k - 1) / 2) * SNAP;
  top = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY - (k - 1) * SNAP, top));
  const pts = Array.from({ length: k }, (_, i) => ({ x: c.x, y: top + i * SNAP }));
  if (pts.some((p) => nodeAt(m, p.x, p.y))) return { ok: false, error: 'Something is already there.' };
  const n = clone(m);
  const ids = pts.map((p) => {
    const id = `x${++n.seq}`;
    n.nodes.push({ id, kind: 'external', x: p.x, y: p.y });
    return id;
  });
  const gid = `g${++n.seq}`;
  n.groups.push({ id: gid, hadron: hadronId, comp: Math.max(0, Math.min(comp, h.components.length - 1)), nodes: ids, hidden: false });
  return { ok: true, model: n, value: gid };
}

/** Choose which component of a mixed state is drawn; quark lines already attached are relabelled. */
export function setGroupComponent(m: EditorModel, groupId: string, comp: number): EditorModel {
  const n = clone(m);
  const g = n.groups.find((q) => q.id === groupId);
  if (!g) return m;
  g.comp = Math.max(0, Math.min(comp, getHadron(g.hadron).components.length - 1));
  const side = groupSide(n, g);
  for (const nid of g.nodes) {
    const e = n.edges.find((q) => q.a === nid || q.b === nid);
    if (!e) continue;
    const other = n.nodes.find((q) => q.id === (e.a === nid ? e.b : e.a));
    if (other?.kind === 'vertex' || side === 'in') e.p = quarkOf(g, nid);
  }
  return n;
}

export function toggleGroupHidden(m: EditorModel, groupId: string): EditorModel {
  const n = clone(m);
  const g = n.groups.find((q) => q.id === groupId);
  if (g) g.hidden = !g.hidden;
  return n;
}

export function hiddenGroupIds(m: EditorModel): string[] {
  return m.groups.filter((g) => g.hidden).map((g) => g.id);
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
  const g = groupOfNode(m, id);
  if (g) {
    // a hadron moves as one block
    let dx = p.x - cur.x;
    let dy = p.y - cur.y;
    const pts = g.nodes.map((nid) => m.nodes.find((q) => q.id === nid)!);
    dx = Math.max(BOUNDS.minX - Math.min(...pts.map((q) => q.x)), Math.min(BOUNDS.maxX - Math.max(...pts.map((q) => q.x)), dx));
    dy = Math.max(BOUNDS.minY - Math.min(...pts.map((q) => q.y)), Math.min(BOUNDS.maxY - Math.max(...pts.map((q) => q.y)), dy));
    if (dx === 0 && dy === 0) return { ok: true, model: m, value: undefined };
    const moved = new Set(g.nodes);
    if (pts.some((q) => m.nodes.some((o) => !moved.has(o.id) && Math.abs(o.x - (q.x + dx)) < 0.01 && Math.abs(o.y - (q.y + dy)) < 0.01))) {
      return { ok: false, error: 'Something is already there.' };
    }
    const n = clone(m);
    for (const q of n.nodes) if (moved.has(q.id)) {
      q.x += dx;
      q.y += dy;
    }
    return { ok: true, model: n, value: undefined };
  }
  if (cur.x === p.x && cur.y === p.y) return { ok: true, model: m, value: undefined };
  const other = nodeAt(m, p.x, p.y);
  if (other && other.id !== id) return { ok: false, error: 'Something is already there.' };
  const n = clone(m);
  const node = n.nodes.find((q) => q.id === id)!;
  node.x = p.x;
  node.y = p.y;
  return { ok: true, model: n, value: undefined };
}

/** External points that stay even without a line: the quark points of hadrons. */
function keepNodes(n: EditorModel): Set<string> {
  return new Set([...n.edges.flatMap((e) => [e.a, e.b]), ...n.groups.flatMap((g) => g.nodes)]);
}

/** Delete a vertex (with its lines), an external point (with its line) or a whole hadron (via any of its points). */
export function deleteNode(m: EditorModel, id: string): EditorModel {
  const n = clone(m);
  const g = groupOfNode(n, id);
  const gone = new Set(g ? g.nodes : [id]);
  if (g) n.groups = n.groups.filter((q) => q.id !== g.id);
  n.nodes = n.nodes.filter((q) => !gone.has(q.id));
  n.edges = n.edges.filter((e) => !gone.has(e.a) && !gone.has(e.b));
  const used = keepNodes(n);
  n.nodes = n.nodes.filter((q) => q.kind === 'vertex' || used.has(q.id)); // drop orphaned external points
  return n;
}

export function deleteEdge(m: EditorModel, id: string): EditorModel {
  const n = clone(m);
  n.edges = n.edges.filter((e) => e.id !== id);
  const used = keepNodes(n);
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

/** Whether the line ends on a quark point of a hadron (such lines are hidden by hiding the whole hadron). */
export function isHadronLeg(m: EditorModel, edgeId: string): boolean {
  const e = m.edges.find((q) => q.id === edgeId);
  return !!e && (!!groupOfNode(m, e.a) || !!groupOfNode(m, e.b));
}

export function toggleHidden(m: EditorModel, edgeId: string): EditorModel {
  if (isHadronLeg(m, edgeId)) return m;
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
  if (m.groups.length === 0) return { nodes, edges };
  const hadrons: HadronGroup[] = m.groups.map((g) => ({ id: g.id, hadron: g.hadron, side: groupSide(m, g), nodes: [...g.nodes] }));
  return { nodes, edges, hadrons };
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
  const groups: EdGroup[] = [];
  for (const g of d.hadrons ?? []) {
    if (!g.hadron || !isHadronId(g.hadron)) continue;
    const h = getHadron(g.hadron);
    const content = groupContent(d, g);
    const key = (qs: readonly string[]) => [...qs].sort().join(',');
    const comp = content ? Math.max(0, h.components.findIndex((c) => key(c.quarks) === key(content))) : 0;
    groups.push({
      id: `g${++seq}`,
      hadron: g.hadron,
      comp,
      nodes: g.nodes.map((nid) => rename.get(nid)!),
      hidden: hid.has(g.id),
    });
  }
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
  return { nodes, edges, groups, title: title.slice(0, LIMITS.title), message: '', seq };
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
  const groups: EdGroup[] = [];
  const inGroup = new Set<string>();
  for (const g of (Array.isArray(r.groups) ? r.groups : []) as Partial<EdGroup>[]) {
    if (!g || typeof g.id !== 'string' || g.id.length > 12 || typeof g.hadron !== 'string' || !isHadronId(g.hadron)) return emptyModel();
    const h = getHadron(g.hadron);
    if (!Array.isArray(g.nodes) || g.nodes.length !== h.components[0].quarks.length) return emptyModel();
    for (const nid of g.nodes) {
      const node = nodes.find((q) => q.id === nid);
      if (typeof nid !== 'string' || !node || node.kind !== 'external' || inGroup.has(nid)) return emptyModel();
      inGroup.add(nid);
    }
    const comp = Number.isInteger(g.comp) ? (g.comp as number) : 0;
    if (comp < 0 || comp >= h.components.length) return emptyModel();
    groups.push({ id: g.id, hadron: g.hadron, comp, nodes: [...(g.nodes as string[])], hidden: g.hidden === true });
  }
  if (groups.length > LIMITS.groups) return emptyModel();
  return {
    nodes,
    edges,
    groups,
    title: typeof r.title === 'string' ? r.title.slice(0, LIMITS.title) : '',
    message: typeof r.message === 'string' ? r.message.slice(0, LIMITS.message) : '',
    seq: num(r.seq) ? Math.max(0, Math.floor(r.seq as number)) : nodes.length + edges.length,
  };
}

