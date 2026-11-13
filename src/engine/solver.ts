import { incomingAt } from './orientation';
import { ALL_PARTICLE_IDS, type ParticleId } from './particles';
import type { Diagram } from './types';
import { edgesAt } from './validator';
import { findRule, partialMatchExists } from './vertices';

export type Assignment = Record<string, ParticleId>;

function vertexIds(d: Diagram): string[] {
  return d.nodes.filter((n) => n.kind === 'vertex').map((n) => n.id);
}

/** Is vertex `v` still satisfiable (or satisfied) given the current assignments? */
function vertexConsistent(d: Diagram, v: string): boolean {
  const edges = edgesAt(d, v);
  if (edges.some((e) => e.from === e.to)) return false;
  const known: ParticleId[] = [];
  for (const e of edges) {
    const p = incomingAt(e, v);
    if (p !== null) known.push(p);
  }
  if (known.length === edges.length) return findRule(known) !== undefined;
  return partialMatchExists(known, edges.length);
}

/**
 * Enumerate every way of filling the `free` edges (all other edges keep the
 * particle already in `diagram`) so that every vertex is an allowed SM vertex
 * with all conservation laws satisfied. Stops after `limit` solutions.
 * Assignments are in the stored (along-the-arrow) convention.
 */
export function solve(diagram: Diagram, free: readonly string[], limit = 1000): Assignment[] {
  const work: Diagram = {
    nodes: diagram.nodes,
    edges: diagram.edges.map((e) => (free.includes(e.id) ? { ...e, particle: null } : { ...e })),
  };
  const byId = new Map(work.edges.map((e) => [e.id, e]));
  const verts = vertexIds(work);
  const touching = (edgeId: string) => {
    const e = byId.get(edgeId)!;
    return verts.filter((v) => v === e.from || v === e.to);
  };

  if (!verts.every((v) => vertexConsistent(work, v))) return [];

  const results: Assignment[] = [];
  const rec = (i: number) => {
    if (results.length >= limit) return;
    if (i === free.length) {
      const a: Assignment = {};
      for (const id of free) a[id] = byId.get(id)!.particle!;
      results.push(a);
      return;
    }
    const e = byId.get(free[i])!;
    for (const p of ALL_PARTICLE_IDS) {
      e.particle = p;
      if (touching(e.id).every((v) => vertexConsistent(work, v))) rec(i + 1);
      if (results.length >= limit) break;
    }
    e.particle = null;
  };
  rec(0);
  return results;
}
