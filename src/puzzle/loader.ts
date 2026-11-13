import { getParticle, isParticleId } from '../engine/particles';
import type { Diagram, DiagramEdge, DiagramNode } from '../engine/types';
import type { ProcessEntry } from './types';

/**
 * Compact on-disk format for library processes (see README, "Adding a process").
 *
 *   vertices:  { "v1": [x, y] }          interaction points; x = time, y grows downward
 *   externals: { "a":  [x, y] }          open ends of external legs
 *   legs:      [id, "in"|"out", ext, vertex, PHYSICAL particle]
 *   edges:     [id, from, to, particle, bend?]   internal lines
 *
 * Legs are written with the physical particle (what a student would label the
 * leg); the loader works out arrow direction and the stored along-the-arrow
 * particle. For internal edges, `particle` is the particle traveling along the
 * arrow from `from` to `to` (fermion arrows follow fermion flow, even backward in time).
 */
export interface RawProcess {
  id: string;
  name: string;
  difficulty: number;
  explanation: string;
  vertices: Record<string, [number, number]>;
  externals: Record<string, [number, number]>;
  legs: [string, 'in' | 'out', string, string, string][];
  edges?: ([string, string, string, string] | [string, string, string, string, number])[];
  hideSets?: string[][];
}

function fail(id: string, msg: string): never {
  throw new Error(`Process "${id}": ${msg}`);
}

export function parseProcess(raw: RawProcess): ProcessEntry {
  const id = raw.id;
  if (!id) throw new Error('Process without id');
  if (!(raw.difficulty >= 1 && raw.difficulty <= 7)) fail(id, 'difficulty must be 1..7');

  const nodes: DiagramNode[] = [
    ...Object.entries(raw.vertices).map(([nid, [x, y]]) => ({ id: nid, kind: 'vertex' as const, x, y })),
    ...Object.entries(raw.externals).map(([nid, [x, y]]) => ({ id: nid, kind: 'external' as const, x, y })),
  ];
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (nodeIds.size !== nodes.length) fail(id, 'duplicate node id');

  const edges: DiagramEdge[] = [];
  for (const [eid, dir, ext, vertex, physical] of raw.legs) {
    if (!(ext in raw.externals)) fail(id, `leg ${eid}: unknown external ${ext}`);
    if (!(vertex in raw.vertices)) fail(id, `leg ${eid}: unknown vertex ${vertex}`);
    if (!isParticleId(physical)) fail(id, `leg ${eid}: unknown particle ${physical}`);
    const p = getParticle(physical);
    // Antifermions are drawn with the arrow pointing backward in time.
    const flip = p.fermion && p.isAnti;
    const stored = flip ? p.antiId : physical;
    const forwardFromExt = dir === 'in'; // incoming arrow points from ext into the vertex
    const fromExt = forwardFromExt !== flip;
    edges.push({
      id: eid,
      from: fromExt ? ext : vertex,
      to: fromExt ? vertex : ext,
      particle: stored,
    });
  }
  for (const [eid, from, to, particle, bend] of raw.edges ?? []) {
    if (!nodeIds.has(from) || !nodeIds.has(to)) fail(id, `edge ${eid}: unknown node`);
    if (!isParticleId(particle)) fail(id, `edge ${eid}: unknown particle ${particle}`);
    edges.push(bend === undefined ? { id: eid, from, to, particle } : { id: eid, from, to, particle, bend });
  }
  const ids = new Set(edges.map((e) => e.id));
  if (ids.size !== edges.length) fail(id, 'duplicate edge id');
  for (const set of raw.hideSets ?? []) {
    for (const e of set) if (!ids.has(e)) fail(id, `hideSet references unknown edge ${e}`);
  }

  const diagram: Diagram = { nodes, edges };
  return {
    id,
    name: raw.name,
    difficulty: raw.difficulty,
    explanation: raw.explanation,
    diagram,
    hideSets: raw.hideSets,
  };
}
