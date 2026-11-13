import { describeContent, getHadron, hadronAcceptsContent, isHadronId } from './hadrons';
import { fundamentalMassMeV } from './masses';
import { physicalParticle } from './orientation';
import type { ParticleId } from './particles';
import type { Diagram, DiagramEdge, DiagramNode, HadronGroup } from './types';
import { structuralErrors, validateDiagram, type ValidationResult } from './validator';

export type HadronIssueCode =
  | 'hadron-structure'
  | 'hadron-side'
  | 'hadron-size'
  | 'hadron-content'
  | 'kinematics';

export interface HadronIssue {
  code: HadronIssueCode;
  /** The group concerned (absent for kinematics, which concerns the whole decay). */
  groupId?: string;
  message: string;
}

export type GroupStatus = 'ok' | 'incomplete' | 'invalid';

export interface HadronReport {
  groups: Record<string, GroupStatus>;
  issues: HadronIssue[];
}

const nodeMap = (d: Diagram) => new Map(d.nodes.map((n) => [n.id, n]));

/** The single edge attached to an external node, or undefined. */
export function legEdge(d: Diagram, nodeId: string): DiagramEdge | undefined {
  const es = d.edges.filter((e) => e.from === nodeId || e.to === nodeId);
  return es.length === 1 ? es[0] : undefined;
}

/** The other end of an external node's edge. */
function otherEnd(e: DiagramEdge, nodeId: string): string {
  return e.from === nodeId ? e.to : e.from;
}

/**
 * Quark content of a group: the physical particle on each leg (what propagates forward in time),
 * or null while any leg is unassigned. Not valid for groups whose structure is broken.
 */
export function groupContent(d: Diagram, g: HadronGroup): ParticleId[] | null {
  const out: ParticleId[] = [];
  for (const nid of g.nodes) {
    const e = legEdge(d, nid);
    if (!e) return null;
    const p = physicalParticle(d, e);
    if (p === null) return null;
    out.push(p);
  }
  return out;
}

/** Group-level checks: structure, in/out side, size and quark content. */
export function validateHadrons(d: Diagram): HadronReport {
  const groups: Record<string, GroupStatus> = {};
  const issues: HadronIssue[] = [];
  const nodes = nodeMap(d);
  const used = new Set<string>();

  for (const g of d.hadrons ?? []) {
    const bad = (code: HadronIssueCode, message: string) => {
      issues.push({ code, groupId: g.id, message });
      groups[g.id] = 'invalid';
    };
    if (g.hadron !== null && !isHadronId(g.hadron)) {
      bad('hadron-structure', `Unknown hadron "${g.hadron}".`);
      continue;
    }
    let structural = true;
    for (const nid of g.nodes) {
      const n = nodes.get(nid);
      if (!n || n.kind !== 'external' || used.has(nid) || !legEdge(d, nid)) {
        bad('hadron-structure', 'A hadron must be made of distinct external quark lines.');
        structural = false;
        break;
      }
      used.add(nid);
      const e = legEdge(d, nid)!;
      const o = nodes.get(otherEnd(e, nid));
      if (o && ((g.side === 'in' && n.x > o.x) || (g.side === 'out' && n.x < o.x))) {
        bad('hadron-side', 'The quark lines of this hadron point the wrong way in time for an initial/final-state hadron.');
        structural = false;
        break;
      }
    }
    if (!structural) continue;
    if (g.hadron === null) {
      groups[g.id] = 'incomplete';
      continue;
    }
    const h = getHadron(g.hadron);
    const size = h.components[0].quarks.length;
    if (g.nodes.length !== size) {
      bad('hadron-size', `A ${h.symbol} has ${size} quark lines; this group has ${g.nodes.length}.`);
      continue;
    }
    const content = groupContent(d, g);
    if (content === null) {
      groups[g.id] = 'incomplete';
      continue;
    }
    if (hadronAcceptsContent(h, content)) {
      groups[g.id] = 'ok';
    } else {
      const want = h.components.map((c) => describeContent(c.quarks)).join(' or ');
      bad('hadron-content', `These quark lines (${describeContent(content)}) do not make a ${h.symbol}; a ${h.symbol} is ${want}.`);
    }
  }
  return { groups, issues };
}

export interface DecayEntity {
  /** Display symbol of the particle or hadron. */
  symbol: string;
  massMeV: number;
  side: 'in' | 'out';
}

/**
 * The external particles of a diagram: each hadron group counts once (with its hadron mass),
 * every other external line is a fundamental particle. Returns null when something is hidden or
 * unassigned, so a mass sum cannot be formed yet.
 */
export function externalEntities(d: Diagram): DecayEntity[] | null {
  const nodes = nodeMap(d);
  const grouped = new Set<string>();
  const out: DecayEntity[] = [];
  for (const g of d.hadrons ?? []) {
    for (const nid of g.nodes) grouped.add(nid);
    if (g.hadron === null || !isHadronId(g.hadron)) return null;
    const h = getHadron(g.hadron);
    out.push({ symbol: h.symbol, massMeV: h.massMeV, side: g.side });
  }
  const vx = d.nodes.filter((n) => n.kind === 'vertex').map((n) => n.x);
  const midX = vx.length ? vx.reduce((a, b) => a + b, 0) / vx.length : 0;
  for (const n of d.nodes) {
    if (n.kind !== 'external' || grouped.has(n.id)) continue;
    const e = legEdge(d, n.id);
    if (!e) return null;
    const p = physicalParticle(d, e);
    if (p === null) return null;
    const o = nodes.get(otherEnd(e, n.id)) as DiagramNode | undefined;
    if (o && o.kind === 'external') continue; // loose spectator line outside any hadron
    const side = o && n.x !== o.x ? (n.x < o.x ? 'in' : 'out') : n.x <= midX ? 'in' : 'out';
    out.push({ symbol: p, massMeV: fundamentalMassMeV(p), side });
  }
  return out;
}

const fmt = (x: number) => String(Math.round(x * 10) / 10);

/** A decay (one particle in, two or more out) needs parent mass > sum of product masses. */
export function checkKinematics(d: Diagram): HadronIssue | null {
  const ents = externalEntities(d);
  if (!ents) return null;
  const ins = ents.filter((e) => e.side === 'in');
  const outs = ents.filter((e) => e.side === 'out');
  if (ins.length !== 1 || outs.length < 2) return null;
  const sum = outs.reduce((a, e) => a + e.massMeV, 0);
  if (ins[0].massMeV > sum) return null;
  return {
    code: 'kinematics',
    message: `Not enough energy for this decay: the parent has mass ${fmt(ins[0].massMeV)} MeV but the products need at least ${fmt(sum)} MeV.`,
  };
}

export interface FullValidation {
  /** Per-vertex validation (unchanged engine behaviour). */
  vertices: ValidationResult;
  hadrons: HadronReport;
  kinematics: HadronIssue | null;
  /** Every vertex ok, every hadron ok, structure fine, and (for decays) enough energy. */
  valid: boolean;
}

/**
 * Whole-diagram validation including hadron content and decay kinematics. `kinematics` defaults to
 * on when the diagram has hadron groups; pass `true` to also check quark-level decays such as t → b W.
 */
export function validateFull(d: Diagram, opts: { kinematics?: boolean } = {}): FullValidation {
  const vertices = validateDiagram(d);
  const hadrons = validateHadrons(d);
  const wantKin = opts.kinematics ?? (d.hadrons?.length ?? 0) > 0;
  const kinematics = wantKin ? checkKinematics(d) : null;
  const structural = structuralErrors(d).length === 0;
  const valid =
    vertices.valid &&
    structural &&
    hadrons.issues.length === 0 &&
    Object.values(hadrons.groups).every((s) => s === 'ok') &&
    kinematics === null;
  return { vertices, hadrons, kinematics, valid };
}
