import { checkKinematics } from '../engine/decays';
import { getHadron, isHadronId } from '../engine/hadrons';
import { physicalParticle, storedFromPhysical } from '../engine/orientation';
import type { ParticleId } from '../engine/particles';
import type { Diagram, HadronGroup } from '../engine/types';
import { validateDiagram } from '../engine/validator';
import { hiddenGroupLegs } from '../puzzle/generator';

/** One way of putting a hadron's quarks on its (hidden) quark legs: stored particle per edge id. */
export type Arrangement = Record<string, ParticleId>;

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  const seen = new Set<string>();
  items.forEach((x, i) => {
    const key = JSON.stringify(x);
    if (seen.has(key)) return;
    seen.add(key);
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

/**
 * Every way the quarks of hadron `hadronId` can sit on the hidden legs of group `g`: any component of a mixed
 * state, any order. Legs that stay visible (spectator lines) are fixed, so the quarks left over fill the hidden legs.
 * Edge particles are returned in the engine's along-the-arrow convention.
 */
export function arrangementsFor(d: Diagram, g: HadronGroup, hadronId: string, hiddenLegs: ReadonlySet<string>): Arrangement[] {
  if (!isHadronId(hadronId)) return [];
  const h = getHadron(hadronId);
  const slots: { edgeId: string; hidden: boolean; fixed: ParticleId | null }[] = [];
  for (const nid of g.nodes) {
    const e = d.edges.find((x) => x.from === nid || x.to === nid);
    if (!e) return [];
    if (hiddenLegs.has(e.id)) slots.push({ edgeId: e.id, hidden: true, fixed: null });
    else {
      slots.push({ edgeId: e.id, hidden: false, fixed: physicalParticle(d, e) });
    }
  }
  const free = slots.filter((s) => s.hidden);
  const out: Arrangement[] = [];
  for (const comp of h.components) {
    if (comp.quarks.length !== slots.length) continue;
    const left = [...comp.quarks];
    let ok = true;
    for (const s of slots) {
      if (s.hidden) continue;
      const i = s.fixed === null ? -1 : left.indexOf(s.fixed);
      if (i < 0) ok = false;
      else left.splice(i, 1);
    }
    if (!ok) continue;
    for (const perm of permutations(left)) {
      const arr: Arrangement = {};
      free.forEach((s, i) => {
        const edge = d.edges.find((x) => x.id === s.edgeId)!;
        arr[s.edgeId] = storedFromPhysical(d, edge, perm[i]);
      });
      out.push(arr);
    }
  }
  return out;
}

export interface HadronEvaluation {
  /** The diagram with the best arrangement of the chosen hadrons and the player's edge answers applied. */
  applied: Diagram;
  /** Number of invalid vertices in `applied` (0 = every vertex is fine). */
  invalid: number;
  /** All vertices fine, every hadron matches its quark lines and the decay has enough energy. */
  correct: boolean;
  /** Kinematics hint, when the vertices are fine but there is not enough energy. */
  energyMessage: string | null;
  /** Hidden groups whose chosen hadron has no arrangement at all (never fits its fixed spectator quarks). */
  impossible: string[];
}

/**
 * Evaluate a player's answers on a puzzle with hidden hadrons: try every arrangement of the chosen hadrons'
 * quarks on the hidden quark legs and keep the one with the fewest broken vertices. Any valid arrangement wins.
 * `base` is the puzzle diagram with the player's answers for hidden edges already applied.
 */
export function evaluateHadrons(
  base: Diagram,
  hiddenGroupIds: readonly string[],
  groupAnswers: Record<string, string | null | undefined>,
): HadronEvaluation {
  const groups = (base.hadrons ?? []).filter((g) => hiddenGroupIds.includes(g.id));
  const hiddenLegs = new Set(hiddenGroupLegs(base, hiddenGroupIds));
  const impossible: string[] = [];
  const options = groups.map((g) => {
    const ans = groupAnswers[g.id];
    const arrs = ans ? arrangementsFor(base, g, ans, hiddenLegs) : [];
    if (arrs.length === 0) impossible.push(g.id);
    return arrs;
  });
  const withHadrons = (d: Diagram): Diagram => ({
    ...d,
    hadrons: (d.hadrons ?? []).map((g) => (hiddenGroupIds.includes(g.id) ? { ...g, hadron: groupAnswers[g.id] ?? null } : g)),
  });

  let best: { d: Diagram; invalid: number } | null = null;
  const combos: Arrangement[] = [];
  const rec = (i: number, acc: Arrangement) => {
    if (i === options.length) {
      combos.push(acc);
      return;
    }
    for (const a of options[i]) {
      let conflict = false;
      for (const [k, v] of Object.entries(a)) if (k in acc && acc[k] !== v) conflict = true;
      if (!conflict) rec(i + 1, { ...acc, ...a });
    }
  };
  rec(0, {});
  for (const acc of combos) {
    const d = withHadrons({ ...base, edges: base.edges.map((e) => (e.id in acc ? { ...e, particle: acc[e.id] } : e)) });
    const r = validateDiagram(d);
    const invalid = Object.values(r.vertices).filter((v) => v.status === 'invalid').length + (r.complete ? 0 : 99);
    if (!best || invalid < best.invalid) best = { d, invalid };
    if (invalid === 0) break;
  }
  const applied = best?.d ?? withHadrons(base);
  const invalid = best?.invalid ?? 99;
  const kin = invalid === 0 ? checkKinematics(applied) : null;
  return {
    applied,
    invalid,
    correct: impossible.length === 0 && invalid === 0 && kin === null,
    energyMessage: kin?.message ?? null,
    impossible,
  };
}

/** Diagram with the player's edge answers filled in (hadron groups untouched). */
export function applyEdgeAnswers(d: Diagram, hidden: readonly string[], answers: Record<string, ParticleId | null | undefined>): Diagram {
  const set = new Set(hidden);
  return { ...d, edges: d.edges.map((e) => (set.has(e.id) ? { ...e, particle: answers[e.id] ?? null } : e)) };
}
