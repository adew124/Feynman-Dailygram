import type { Diagram } from '../engine/types';

/** fill = hide edge labels; external = hide external legs only; forbidden = find the bad vertex (later phase). */
export type PuzzleKind = 'fill' | 'external' | 'forbidden';

/** A process in the curated library. */
export interface ProcessEntry {
  id: string;
  name: string;
  /** 1 (easy) .. 7 (hard). */
  difficulty: number;
  /** 2-3 sentence explanation shown after solving. */
  explanation: string;
  /** The complete, valid diagram (every edge assigned). */
  diagram: Diagram;
  /**
   * Optional curated sets of edge ids that make good puzzles. If omitted,
   * the generator picks random subsets.
   */
  hideSets?: string[][];
}

/** A playable puzzle: a library process plus the chosen hidden edges. */
export interface Puzzle {
  /** Unique per (process, hidden set); used to validate saved progress. */
  id: string;
  processId: string;
  name: string;
  difficulty: number;
  explanation: string;
  kind: PuzzleKind;
  diagram: Diagram;
  hidden: string[];
  /** Optional message from a puzzle creator (shared puzzles). */
  title?: string;
  message?: string;
}
