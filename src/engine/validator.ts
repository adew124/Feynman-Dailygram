import { incomingAt } from './orientation';
import { getParticle, sumQuantumNumbers, type ParticleId } from './particles';
import type { Diagram, DiagramEdge } from './types';
import { findRule, MAX_VERTEX_DEGREE, MIN_VERTEX_DEGREE, type VertexRule } from './vertices';

export type IssueCode =
  | 'unassigned'
  | 'bad-degree'
  | 'self-loop'
  | 'charge'
  | 'baryon'
  | 'lepton-e'
  | 'lepton-mu'
  | 'lepton-tau'
  | 'no-coupling';

export interface Issue {
  vertexId: string;
  code: IssueCode;
  /** Student-facing hint text. */
  message: string;
  /** Edges meeting at the offending vertex. */
  edgeIds: string[];
}

export interface VertexReport {
  vertexId: string;
  /** ok = allowed + conserving; incomplete = has unassigned edges; invalid = broken. */
  status: 'ok' | 'incomplete' | 'invalid';
  rule?: VertexRule;
  issues: Issue[];
}

export interface ValidationResult {
  /** Every vertex ok and every edge assigned. */
  valid: boolean;
  /** Every edge has a particle. */
  complete: boolean;
  vertices: Record<string, VertexReport>;
  issues: Issue[];
}

function fmtThirds(n: number, unit = ''): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const a = Math.abs(n);
  const whole = Math.floor(a / 3);
  const rem = a % 3;
  let s: string;
  if (rem === 0) s = String(whole);
  else s = whole === 0 ? `${rem}/3` : `${whole} ${rem}/3`;
  return `${sign}${s}${unit}`;
}

/** Edges touching a vertex (self-loops are reported separately). */
export function edgesAt(d: Diagram, vertexId: string): DiagramEdge[] {
  return d.edges.filter((e) => e.from === vertexId || e.to === vertexId);
}

function couplingHint(incoming: ParticleId[]): string {
  const ps = incoming.map(getParticle);
  const has = (id: string) => incoming.includes(id);
  if (has('gamma') && ps.some((p) => p.fermion && p.charge3 === 0)) {
    return 'The photon only couples to electrically charged particles.';
  }
  if (has('g') && ps.some((p) => p.kind === 'lepton')) {
    return 'Gluons couple only to quarks and other gluons — leptons have no color.';
  }
  if (has('H') && ps.some((p) => p.kind === 'lepton' && p.charge3 === 0)) {
    return 'In the Standard Model the Higgs does not couple to (massless) neutrinos.';
  }
  if (has('Z') && ps.some((p) => p.fermion) ) {
    return 'The Z couples a fermion to its own antiparticle only — Z vertices never change flavor.';
  }
  if (has('W+') || has('W-')) {
    return 'A W changes an up-type fermion into a down-type one (ν↔ℓ, u/c/t↔d/s/b) and carries away the charge difference.';
  }
  if (has('g')) {
    return 'Gluons attach to a quark line (q q̄ g) or to other gluons; they never change quark flavor.';
  }
  return 'All conserved quantities check out, but the Standard Model has no vertex with these particles.';
}

/** Validate a single vertex. Exported for per-vertex hints. */
export function validateVertex(d: Diagram, vertexId: string): VertexReport {
  const edges = edgesAt(d, vertexId);
  const edgeIds = edges.map((e) => e.id);
  const issues: Issue[] = [];
  const mk = (code: IssueCode, message: string): Issue => ({ vertexId, code, message, edgeIds });

  if (edges.some((e) => e.from === e.to)) {
    issues.push(mk('self-loop', 'An edge cannot start and end on the same vertex.'));
    return { vertexId, status: 'invalid', issues };
  }
  if (edges.length < MIN_VERTEX_DEGREE || edges.length > MAX_VERTEX_DEGREE) {
    issues.push(mk('bad-degree', `A vertex joins 3 or 4 lines; this one joins ${edges.length}.`));
    return { vertexId, status: 'invalid', issues };
  }
  if (edges.some((e) => e.particle === null)) {
    return { vertexId, status: 'incomplete', issues: [] };
  }

  const incoming = edges.map((e) => incomingAt(e, vertexId) as ParticleId);
  const s = sumQuantumNumbers(incoming);
  if (s.charge3 !== 0) {
    issues.push(mk('charge', `Electric charge is not conserved here (net ${fmtThirds(s.charge3, ' e')}).`));
  }
  if (s.baryon3 !== 0) {
    issues.push(mk('baryon', `Baryon number is not conserved here (net ${fmtThirds(s.baryon3)}).`));
  }
  if (s.le !== 0) {
    issues.push(mk('lepton-e', `Electron lepton number is not conserved here (net ${s.le > 0 ? '+' : '−'}${Math.abs(s.le)}).`));
  }
  if (s.lmu !== 0) {
    issues.push(mk('lepton-mu', `Muon lepton number is not conserved here (net ${s.lmu > 0 ? '+' : '−'}${Math.abs(s.lmu)}).`));
  }
  if (s.ltau !== 0) {
    issues.push(mk('lepton-tau', `Tau lepton number is not conserved here (net ${s.ltau > 0 ? '+' : '−'}${Math.abs(s.ltau)}).`));
  }
  if (issues.length > 0) return { vertexId, status: 'invalid', issues };

  const found = findRule(incoming);
  if (!found) {
    issues.push(mk('no-coupling', couplingHint(incoming)));
    return { vertexId, status: 'invalid', issues };
  }
  return { vertexId, status: 'ok', rule: found, issues: [] };
}

/** Validate every vertex of a diagram. */
export function validateDiagram(d: Diagram): ValidationResult {
  const vertices: Record<string, VertexReport> = {};
  const issues: Issue[] = [];
  for (const n of d.nodes) {
    if (n.kind !== 'vertex') continue;
    const r = validateVertex(d, n.id);
    vertices[n.id] = r;
    issues.push(...r.issues);
  }
  const complete = d.edges.every((e) => e.particle !== null);
  const valid = complete && Object.values(vertices).every((v) => v.status === 'ok');
  return { valid, complete, vertices, issues };
}

/** Sanity check the graph structure itself (dangling node ids, ...). */
export function structuralErrors(d: Diagram): string[] {
  const errs: string[] = [];
  const ids = new Set(d.nodes.map((n) => n.id));
  for (const e of d.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) errs.push(`Edge ${e.id} references a missing node.`);
  }
  for (const n of d.nodes) {
    if (n.kind === 'external' && edgesAt(d, n.id).length !== 1) {
      errs.push(`External point ${n.id} must have exactly one edge.`);
    }
  }
  return errs;
}
