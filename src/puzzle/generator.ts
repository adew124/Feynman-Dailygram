import { checkKinematics, groupContent, legEdge } from '../engine/decays';
import { hadronsWithContent } from '../engine/hadrons';
import { solveWithInfo } from '../engine/solver';
import type { Diagram, HadronGroup } from '../engine/types';
import { weekday } from '../game/dates';
import { LIBRARY } from './library';
import { pick, rngFor, shuffle } from './rng';
import type { ProcessEntry, Puzzle } from './types';

const MAX_SOLUTIONS = 60;

export function isExternalEdge(d: Diagram, edgeId: string): boolean {
  const e = d.edges.find((e) => e.id === edgeId);
  if (!e) return false;
  const kind = new Map(d.nodes.map((n) => [n.id, n.kind]));
  return kind.get(e.from) === 'external' || kind.get(e.to) === 'external';
}

export interface HideReport {
  /** Number of valid completions found (capped at MAX_SOLUTIONS + 1). */
  solutions: number;
  /** More than MAX_SOLUTIONS valid completions (or the search budget ran out). */
  tooOpen: boolean;
  /** Hidden external legs that could be more than one particle (the process could change). */
  ambiguousExternals: string[];
  /** Hidden hadron groups that more than one table hadron could fill (after the energy check). */
  ambiguousGroups: string[];
}

/** Ids of the hadron groups of a diagram. */
export function groupIdSet(d: Diagram): Set<string> {
  return new Set((d.hadrons ?? []).map((g) => g.id));
}

/** Edge ids of the quark lines the player must fill in when hiding hadron groups `groupIds`. */
export function hiddenGroupLegs(d: Diagram, groupIds: readonly string[]): string[] {
  const hidden = new Set(groupIds);
  const groupOfNode = new Map<string, HadronGroup>();
  for (const g of d.hadrons ?? []) for (const n of g.nodes) groupOfNode.set(n, g);
  const out = new Set<string>();
  for (const g of d.hadrons ?? []) {
    if (!hidden.has(g.id)) continue;
    for (const nid of g.nodes) {
      const e = legEdge(d, nid);
      if (!e) continue;
      const other = e.from === nid ? e.to : e.from;
      const og = groupOfNode.get(other);
      // a spectator line is shared with the group at its other end: it stays visible unless that group is hidden too
      if (og && !hidden.has(og.id)) continue;
      out.add(e.id);
    }
  }
  return [...out];
}

/** The table hadrons that could fill hidden group `g` in the diagram `withSolution`, energy check included. */
export function hadronsFittingGroup(withSolution: Diagram, g: HadronGroup): string[] {
  const content = groupContent(withSolution, g);
  if (!content) return [];
  return hadronsWithContent(content)
    .filter((h) => {
      const trial: Diagram = {
        ...withSolution,
        hadrons: (withSolution.hadrons ?? []).map((x) => (x.id === g.id ? { ...x, hadron: h.id } : x)),
      };
      return checkKinematics(trial) === null;
    })
    .map((h) => h.id);
}

/**
 * Analyse a hide set. `hidden` may contain edge ids and hadron-group ids; a hidden group frees its
 * quark lines, and the group counts as determined only if exactly one table hadron fits it.
 */
export function analyzeHideSet(d: Diagram, hidden: readonly string[]): HideReport {
  const groups = groupIdSet(d);
  const hiddenGroups = hidden.filter((h) => groups.has(h));
  const edgeHidden = hidden.filter((h) => !groups.has(h));
  const free = [...new Set([...edgeHidden, ...hiddenGroupLegs(d, hiddenGroups)])];
  const info = solveWithInfo(d, free, MAX_SOLUTIONS + 1);
  let sols = info.solutions;
  const fits = new Map<string, Set<string>>(hiddenGroups.map((g) => [g, new Set<string>()]));
  if (hiddenGroups.length) {
    sols = sols.filter((sol) => {
      const withSol: Diagram = { ...d, edges: d.edges.map((e) => (sol[e.id] ? { ...e, particle: sol[e.id] } : e)) };
      let ok = true;
      for (const gid of hiddenGroups) {
        const g = (d.hadrons ?? []).find((x) => x.id === gid)!;
        const fit = hadronsFittingGroup(withSol, g);
        if (fit.length === 0) ok = false;
        for (const h of fit) fits.get(gid)!.add(h);
      }
      return ok;
    });
  }
  const groupLegs = new Set(hiddenGroupLegs(d, hiddenGroups));
  const ambiguousExternals = edgeHidden.filter(
    (id) => !groupLegs.has(id) && isExternalEdge(d, id) && new Set(sols.map((s) => s[id])).size !== 1,
  );
  const ambiguousGroups = hiddenGroups.filter((g) => fits.get(g)!.size !== 1);
  return {
    solutions: sols.length,
    tooOpen: sols.length > MAX_SOLUTIONS || (!info.exhausted && sols.length < MAX_SOLUTIONS + 1),
    ambiguousExternals,
    ambiguousGroups,
  };
}

/**
 * Is `hidden` a good set of edges to hide?
 *  - solvable: the engine finds at least one valid completion (the reference
 *    answer guarantees this, but we re-check so bad library data is caught);
 *  - not wildly open: at most MAX_SOLUTIONS valid completions;
 *  - the process is not changed: a hidden external leg must be forced to a
 *    single particle (e.g. "what is the other decay product?" has one answer),
 *    while internal lines may legitimately have several valid answers.
 */
export function acceptableHideSet(d: Diagram, hidden: readonly string[]): boolean {
  if (hidden.length === 0) return false;
  const r = analyzeHideSet(d, hidden);
  return r.solutions >= 1 && !r.tooOpen && r.ambiguousExternals.length === 0 && r.ambiguousGroups.length === 0;
}

/** How many edges to hide, by difficulty. */
export function hiddenCountFor(difficulty: number, edgeCount: number): number {
  const k = difficulty <= 2 ? 2 : difficulty <= 4 ? 3 : 4;
  return Math.max(1, Math.min(k, edgeCount - 2));
}

function sortByDiagram(d: Diagram, ids: readonly string[]): string[] {
  const order = new Map<string, number>(d.edges.map((e, i) => [e.id, i]));
  (d.hadrons ?? []).forEach((g, i) => order.set(g.id, d.edges.length + i));
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/**
 * Items a puzzle may hide: internal lines, external lines that are not part of a hadron, and whole
 * hadrons. Single quark legs of a hadron are never hidden on their own.
 */
export function hideCandidates(d: Diagram): string[] {
  const grouped = new Set((d.hadrons ?? []).flatMap((g) => g.nodes));
  return [
    ...d.edges.filter((e) => !grouped.has(e.from) && !grouped.has(e.to)).map((e) => e.id),
    // a line between a vertex and a quark leg of a hadron is a hadron leg, not a candidate
    ...(d.hadrons ?? []).map((g) => g.id),
  ];
}

/** Choose what to hide (edge ids and hadron-group ids), deterministically from `seed`. */
export function chooseHidden(entry: ProcessEntry, seed: string): string[] {
  const rng = rngFor(`hide:${seed}:${entry.id}`);
  const d = entry.diagram;
  for (const set of shuffle(rng, entry.hideSets ?? [])) {
    if (acceptableHideSet(d, set)) return sortByDiagram(d, set);
  }
  const ids = hideCandidates(d);
  const k = hiddenCountFor(entry.difficulty, ids.length);
  for (let attempt = 0; attempt < 200; attempt++) {
    const subset = shuffle(rng, ids).slice(0, k);
    if (acceptableHideSet(d, subset)) return sortByDiagram(d, subset);
  }
  for (const id of shuffle(rng, ids)) if (acceptableHideSet(d, [id])) return [id];
  throw new Error(`No valid hide set for process ${entry.id}`);
}

export function makePuzzle(entry: ProcessEntry, seed: string): Puzzle {
  const chosen = chooseHidden(entry, seed);
  const d = entry.diagram;
  const groups = groupIdSet(d);
  const hidden = chosen.filter((c) => !groups.has(c));
  const hiddenGroups = chosen.filter((c) => groups.has(c));
  return {
    id: `${entry.id}:${chosen.join('+')}`,
    processId: entry.id,
    name: entry.name,
    difficulty: entry.difficulty,
    explanation: entry.explanation,
    kind: hidden.every((id) => isExternalEdge(d, id)) ? 'external' : 'fill',
    diagram: d,
    hidden,
    ...(hiddenGroups.length ? { hiddenGroups } : {}),
  };
}

/** Target difficulty by weekday: Monday = 1 (easy) ... Sunday = 7 (hard). */
export function weekdayDifficulty(dateKey: string): number {
  return weekday(dateKey);
}

/** Entries whose difficulty is closest to `target` (all entries at the minimal distance). */
export function entriesNear(library: readonly ProcessEntry[], target: number): ProcessEntry[] {
  const best = Math.min(...library.map((e) => Math.abs(e.difficulty - target)));
  return library.filter((e) => Math.abs(e.difficulty - target) === best);
}

/** The same puzzle for everyone on a given local date. */
export function dailyPuzzle(dateKey: string, library: readonly ProcessEntry[] = LIBRARY): Puzzle {
  const rng = rngFor(`daily:${dateKey}`);
  const entry = pick(rng, entriesNear(library, weekdayDifficulty(dateKey)));
  return makePuzzle(entry, dateKey);
}
