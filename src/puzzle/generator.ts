import { solveWithInfo } from '../engine/solver';
import type { Diagram } from '../engine/types';
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
}

export function analyzeHideSet(d: Diagram, hidden: readonly string[]): HideReport {
  const info = solveWithInfo(d, hidden, MAX_SOLUTIONS + 1);
  const sols = info.solutions;
  const ambiguousExternals = hidden.filter(
    (id) => isExternalEdge(d, id) && new Set(sols.map((s) => s[id])).size !== 1,
  );
  return {
    solutions: sols.length,
    tooOpen: sols.length > MAX_SOLUTIONS || (!info.exhausted && sols.length < MAX_SOLUTIONS + 1),
    ambiguousExternals,
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
  return r.solutions >= 1 && !r.tooOpen && r.ambiguousExternals.length === 0;
}

/** How many edges to hide, by difficulty. */
export function hiddenCountFor(difficulty: number, edgeCount: number): number {
  const k = difficulty <= 2 ? 2 : difficulty <= 4 ? 3 : 4;
  return Math.max(1, Math.min(k, edgeCount - 2));
}

function sortByDiagram(d: Diagram, ids: readonly string[]): string[] {
  const order = new Map(d.edges.map((e, i) => [e.id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Choose which edges to hide, deterministically from `seed`. */
export function chooseHidden(entry: ProcessEntry, seed: string): string[] {
  const rng = rngFor(`hide:${seed}:${entry.id}`);
  const d = entry.diagram;
  for (const set of shuffle(rng, entry.hideSets ?? [])) {
    if (acceptableHideSet(d, set)) return sortByDiagram(d, set);
  }
  const ids = d.edges.map((e) => e.id);
  const k = hiddenCountFor(entry.difficulty, ids.length);
  for (let attempt = 0; attempt < 200; attempt++) {
    const subset = shuffle(rng, ids).slice(0, k);
    if (acceptableHideSet(d, subset)) return sortByDiagram(d, subset);
  }
  for (const id of shuffle(rng, ids)) if (acceptableHideSet(d, [id])) return [id];
  throw new Error(`No valid hide set for process ${entry.id}`);
}

export function makePuzzle(entry: ProcessEntry, seed: string): Puzzle {
  const hidden = chooseHidden(entry, seed);
  const d = entry.diagram;
  return {
    id: `${entry.id}:${hidden.join('+')}`,
    processId: entry.id,
    name: entry.name,
    difficulty: entry.difficulty,
    explanation: entry.explanation,
    kind: hidden.every((id) => isExternalEdge(d, id)) ? 'external' : 'fill',
    diagram: d,
    hidden,
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
