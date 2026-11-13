import type { Diagram } from '../engine/types';

/** fill = hide edge labels; external = hide external legs only; forbidden = find the one illegal vertex; classify = allowed or suppressed? (decays). */
export type PuzzleKind = 'fill' | 'external' | 'forbidden' | 'classify';

/** Why a decay is suppressed relative to the parent's best available route. */
export type SuppressionReason =
  | 'cabibbo-single'
  | 'cabibbo-double'
  | 'ckm-b-u'
  | 'helicity'
  | 'ozi'
  | 'color'
  | 'loop-gim'
  | 'isospin';

export interface DecayInfo {
  /** Relative to the parent's best route, not in absolute terms. */
  category: 'allowed' | 'suppressed';
  interaction: 'strong' | 'em' | 'weak';
  /** Empty for allowed decays. */
  reasons: SuppressionReason[];
  /** Library id of the allowed decay this one should be compared with (suppressed decays). */
  compareWith?: string;
  /** Branching ratio as a fraction (0.0123 = 1.23 %). */
  br: number;
  /** Display text for the branching ratio, e.g. "(1.23 ± 0.02) × 10⁻⁴". */
  brText: string;
}

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
  /** True for one particle in, two or more out. */
  isDecay: boolean;
  /** Classification, present for the curated hadron/particle decays. */
  decay?: DecayInfo;
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
  /** Hadron groups the player must identify (decays at the quark level). */
  hiddenGroups?: string[];
  /** Optional message from a puzzle creator (shared puzzles). */
  title?: string;
  message?: string;
  /** Only for kind 'forbidden': `diagram` is fully labelled but one external leg was swapped. */
  forbidden?: ForbiddenInfo;
}

export interface ForbiddenInfo {
  /** The one vertex that breaks the rules. */
  vertexId: string;
  /** The external edge whose label was swapped. */
  edgeId: string;
  /** The edge's correct (stored, along-the-arrow) particle. */
  original: string;
}
