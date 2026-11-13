import { ALL_PARTICLE_IDS } from '../engine/particles';
import { validateDiagram } from '../engine/validator';
import { lineKindForParticle } from '../render/view';
import { isExternalEdge } from './generator';
import { rngFor, shuffle } from './rng';
import type { ProcessEntry, Puzzle } from './types';

/**
 * "Spot the forbidden vertex": take a valid library diagram and swap the label of ONE external
 * leg so exactly one vertex breaks the rules. Only external legs are swapped (an internal line
 * touches two vertices, which would break both). Swaps that keep the same line style (e.g.
 * another fermion for a fermion) are preferred so the line shape does not give the answer away.
 * Returns null if no swap leaves exactly one invalid vertex.
 */
export function makeForbiddenPuzzle(entry: ProcessEntry, seed: string): Puzzle | null {
  const rng = rngFor(`forbid:${seed}:${entry.id}`);
  const d = entry.diagram;
  // swapping one quark leg would also break its hadron, so decays drawn with hadrons are not used
  if (d.hadrons?.length) return null;
  const externals = shuffle(rng, d.edges.filter((e) => isExternalEdge(d, e.id)));
  const swaps: { edgeId: string; from: string; to: string; sameKind: boolean }[] = [];
  for (const e of externals) {
    for (const p of shuffle(rng, ALL_PARTICLE_IDS)) {
      if (p === e.particle) continue;
      swaps.push({ edgeId: e.id, from: e.particle!, to: p, sameKind: lineKindForParticle(p) === lineKindForParticle(e.particle!) });
    }
  }
  const ordered = [...swaps.filter((s) => s.sameKind), ...swaps.filter((s) => !s.sameKind)];
  for (const s of ordered) {
    const corrupted = { ...d, edges: d.edges.map((e) => (e.id === s.edgeId ? { ...e, particle: s.to } : e)) };
    const bad = Object.values(validateDiagram(corrupted).vertices).filter((v) => v.status !== 'ok');
    if (bad.length === 1 && bad[0].status === 'invalid') {
      return {
        id: `forbidden:${entry.id}:${s.edgeId}=${s.to}`,
        processId: entry.id,
        name: entry.name,
        difficulty: entry.difficulty,
        explanation: entry.explanation,
        kind: 'forbidden',
        diagram: corrupted,
        hidden: [],
        forbidden: { vertexId: bad[0].vertexId, edgeId: s.edgeId, original: s.from },
      };
    }
  }
  return null;
}
