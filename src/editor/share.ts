import LZString from 'lz-string';
import { isParticleId } from '../engine/particles';
import type { Diagram, DiagramEdge, DiagramNode } from '../engine/types';
import { structuralErrors, validateDiagram } from '../engine/validator';
import { hashString } from '../puzzle/rng';
import { isExternalEdge } from '../puzzle/generator';
import type { Puzzle } from '../puzzle/types';
import { LIMITS } from './model';

/**
 * Share format. A puzzle travels in the URL hash as compressed JSON:
 *   #p=<lz-string compressToEncodedURIComponent(JSON)>
 * Compact JSON (v1):
 *   { v:1, t?:title, m?:message, h:[hidden edge ids],
 *     n:[[id, "v"|"x", x, y], ...], e:[[id, from, to, particle, bend?], ...] }
 * where e uses the engine's along-the-arrow convention and carries the creator's
 * complete, valid answer. Decoding treats the link as untrusted input.
 */
export interface SharedData {
  title: string;
  message: string;
  diagram: Diagram;
  hidden: string[];
}

export const HASH_PREFIX = '#p=';
const MAX_COMPRESSED = 12_000;
const MAX_JSON = 30_000;

type Compact = {
  v: 1;
  t?: string;
  m?: string;
  h: string[];
  n: [string, 'v' | 'x', number, number][];
  e: ([string, string, string, string] | [string, string, string, string, number])[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function encodeShared(data: SharedData): string {
  const c: Compact = {
    v: 1,
    h: data.hidden,
    n: data.diagram.nodes.map((n) => [n.id, n.kind === 'vertex' ? 'v' : 'x', r2(n.x), r2(n.y)]),
    e: data.diagram.edges.map((e) =>
      e.bend === undefined
        ? [e.id, e.from, e.to, e.particle as string]
        : [e.id, e.from, e.to, e.particle as string, r2(e.bend)],
    ),
  };
  if (data.title) c.t = data.title;
  if (data.message) c.m = data.message;
  return LZString.compressToEncodedURIComponent(JSON.stringify(c));
}

export function shareUrl(data: SharedData, base: string): string {
  return `${base}${HASH_PREFIX}${encodeShared(data)}`;
}

export type DecodeResult = { ok: true; data: SharedData; key: string } | { ok: false; error: string };

const fail = (error: string): DecodeResult => ({ ok: false, error });
const isStr = (v: unknown, max = 40): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100;

/** Decode the part after "#p=". Never throws. */
export function decodeShared(compressed: string): DecodeResult {
  try {
    if (!compressed || compressed.length > MAX_COMPRESSED) return fail('This link is empty or too long.');
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json || json.length > MAX_JSON) return fail('This link is damaged.');
    const raw = JSON.parse(json) as Partial<Compact> | null;
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return fail('This link was made by an unknown version.');
    if (!Array.isArray(raw.n) || !Array.isArray(raw.e) || !Array.isArray(raw.h)) return fail('This link is damaged.');
    if (raw.n.length > LIMITS.vertices + LIMITS.externals || raw.e.length > LIMITS.edges) return fail('This puzzle is too large.');

    const nodes: DiagramNode[] = [];
    const nodeIds = new Set<string>();
    for (const n of raw.n) {
      if (!Array.isArray(n) || !isStr(n[0], 12) || (n[1] !== 'v' && n[1] !== 'x') || !isNum(n[2]) || !isNum(n[3])) {
        return fail('This link is damaged.');
      }
      if (nodeIds.has(n[0])) return fail('This link is damaged.');
      nodeIds.add(n[0]);
      nodes.push({ id: n[0], kind: n[1] === 'v' ? 'vertex' : 'external', x: n[2], y: n[3] });
    }
    const edges: DiagramEdge[] = [];
    const edgeIds = new Set<string>();
    for (const e of raw.e) {
      if (!Array.isArray(e) || !isStr(e[0], 12) || !isStr(e[1], 12) || !isStr(e[2], 12) || !isStr(e[3], 20)) {
        return fail('This link is damaged.');
      }
      if (edgeIds.has(e[0]) || !nodeIds.has(e[1]) || !nodeIds.has(e[2]) || e[1] === e[2]) return fail('This link is damaged.');
      if (!isParticleId(e[3])) return fail('This link contains an unknown particle.');
      if (e[4] !== undefined && !isNum(e[4])) return fail('This link is damaged.');
      edgeIds.add(e[0]);
      const edge: DiagramEdge = { id: e[0], from: e[1], to: e[2], particle: e[3] };
      if (e[4] !== undefined) edge.bend = Math.max(-3, Math.min(3, e[4]));
      edges.push(edge);
    }
    const hidden: string[] = [];
    for (const h of raw.h) {
      if (typeof h !== 'string' || !edgeIds.has(h) || hidden.includes(h)) return fail('This link is damaged.');
      hidden.push(h);
    }
    if (hidden.length < 1 || hidden.length > LIMITS.hidden) return fail('This puzzle has no hidden lines to solve.');

    const diagram: Diagram = { nodes, edges };
    if (structuralErrors(diagram).length) return fail('This diagram is not well formed.');
    if (!validateDiagram(diagram).valid) return fail('This diagram breaks a conservation law, so it has no valid answer.');

    return {
      ok: true,
      key: hashString(json).toString(36),
      data: {
        title: typeof raw.t === 'string' ? raw.t.slice(0, LIMITS.title) : '',
        message: typeof raw.m === 'string' ? raw.m.slice(0, LIMITS.message) : '',
        diagram,
        hidden,
      },
    };
  } catch {
    return fail('This link could not be read.');
  }
}

/** Rough difficulty (1-7) from size and loops, for the label and share card. */
export function estimateDifficulty(d: Diagram): number {
  const vertices = d.nodes.filter((n) => n.kind === 'vertex').length;
  const loops = Math.max(0, d.edges.length - d.nodes.length + 1);
  return Math.max(1, Math.min(7, Math.round(1 + 0.8 * vertices + 2 * loops)));
}

const KIND_LABEL: Record<string, string> = {
  QED: 'electromagnetic (photon)',
  QCD: 'strong (gluon)',
  'weak-CC': 'weak charged-current (W)',
  'weak-NC': 'weak neutral-current (Z)',
  Higgs: 'Higgs',
  'gauge-self': 'gauge-boson self-interaction',
};

/** A generic explanation listing the interactions that appear in the diagram. */
export function describeDiagram(d: Diagram): string {
  const kinds = new Set<string>();
  const v = validateDiagram(d);
  for (const r of Object.values(v.vertices)) if (r.rule) kinds.add(KIND_LABEL[r.rule.kind]);
  const list = [...kinds];
  const text = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : (list[0] ?? 'Standard Model');
  return `A custom diagram built in the puzzle editor. Its vertices use ${text} interactions, and every vertex conserves charge, baryon number and each lepton family number.`;
}

/** Build a playable puzzle from decoded share data. */
export function puzzleFromShared(data: SharedData, key: string): Puzzle {
  const name = data.title || 'Custom puzzle';
  return {
    id: `shared:${key}`,
    processId: 'custom',
    name,
    title: name,
    message: data.message || undefined,
    difficulty: estimateDifficulty(data.diagram),
    explanation: describeDiagram(data.diagram),
    kind: data.hidden.every((id) => isExternalEdge(data.diagram, id)) ? 'external' : 'fill',
    diagram: data.diagram,
    hidden: data.hidden,
  };
}
