import type { ProcessEntry, Puzzle, SuppressionReason } from '../puzzle/types';

/** The reasons offered in the "Allowed or suppressed?" puzzle (the three CKM cases are one choice). */
export type ReasonGroup = 'ckm' | 'helicity' | 'ozi' | 'color' | 'loop-gim' | 'isospin';

export const REASON_GROUPS: { id: ReasonGroup; label: string; help: string }[] = [
  { id: 'ckm', label: 'Cabibbo / CKM', help: 'A weak vertex uses a small CKM element (c → d, W → u s̄, b → u instead of b → c)' },
  { id: 'helicity', label: 'Helicity', help: 'Angular momentum forces a lepton helicity that the light lepton rarely has' },
  { id: 'ozi', label: 'OZI rule', help: 'The quark lines are disconnected between the initial and the final hadrons' },
  { id: 'color', label: 'Color', help: 'The W is emitted inside the diagram and the quark colors must match up' },
  { id: 'loop-gim', label: 'Loop / GIM', help: 'A flavor-changing neutral transition that needs a loop (penguin or box)' },
  { id: 'isospin', label: 'Isospin / G-parity', help: 'The strong interaction forbids it; only isospin breaking allows it' },
];

const GROUP_OF: Record<SuppressionReason, ReasonGroup> = {
  'cabibbo-single': 'ckm',
  'cabibbo-double': 'ckm',
  'ckm-b-u': 'ckm',
  helicity: 'helicity',
  ozi: 'ozi',
  color: 'color',
  'loop-gim': 'loop-gim',
  isospin: 'isospin',
};

/** The reason choices that apply to a decay (unique, in the order of REASON_GROUPS). */
export function reasonGroupsOf(reasons: readonly SuppressionReason[]): ReasonGroup[] {
  const set = new Set(reasons.map((r) => GROUP_OF[r]));
  return REASON_GROUPS.map((g) => g.id).filter((id) => set.has(id));
}

export const MAX_REASON_TRIES = 2;

export type Category = 'allowed' | 'suppressed';

export interface ClassifyState {
  puzzleId: string;
  /** The player's verdict, once given. */
  category: Category | null;
  /** Reason selections that were submitted (suppressed decays only). */
  tries: ReasonGroup[][];
  status: 'playing' | 'won' | 'lost';
}

/** Build the puzzle for a library decay (a decay with classification data). */
export function makeClassifyPuzzle(entry: ProcessEntry): Puzzle | null {
  if (!entry.decay) return null;
  return {
    id: `classify:${entry.id}`,
    processId: entry.id,
    name: entry.name,
    difficulty: entry.difficulty,
    explanation: entry.explanation,
    kind: 'classify',
    diagram: entry.diagram,
    hidden: [],
  };
}

export function newClassify(p: Puzzle): ClassifyState {
  return { puzzleId: p.id, category: null, tries: [], status: 'playing' };
}

/** Step 1: allowed or suppressed. A wrong verdict ends the game; "allowed" is right with no further step. */
export function pickCategory(entry: ProcessEntry, s: ClassifyState, cat: Category): ClassifyState {
  if (s.status !== 'playing' || s.category !== null || !entry.decay) return s;
  if (cat !== entry.decay.category) return { ...s, category: cat, status: 'lost' };
  return { ...s, category: cat, status: cat === 'allowed' ? 'won' : 'playing' };
}

export interface ReasonFeedback {
  /** Picked and correct. */
  right: number;
  /** Picked but not a reason for this decay. */
  extra: number;
  /** Reasons of the decay that were not picked. */
  missing: number;
}

export function reasonFeedback(entry: ProcessEntry, picks: readonly ReasonGroup[]): ReasonFeedback {
  const truth = new Set(reasonGroupsOf(entry.decay?.reasons ?? []));
  const p = new Set(picks);
  return {
    right: [...p].filter((x) => truth.has(x)).length,
    extra: [...p].filter((x) => !truth.has(x)).length,
    missing: [...truth].filter((x) => !p.has(x)).length,
  };
}

/** Step 2: pick every reason that applies. Exact match wins; two tries. */
export function guessReasons(entry: ProcessEntry, s: ClassifyState, picks: readonly ReasonGroup[]): ClassifyState {
  if (s.status !== 'playing' || s.category !== 'suppressed' || picks.length === 0) return s;
  const fb = reasonFeedback(entry, picks);
  const tries = [...s.tries, [...new Set(picks)]];
  if (fb.extra === 0 && fb.missing === 0) return { ...s, tries, status: 'won' };
  return { ...s, tries, status: tries.length >= MAX_REASON_TRIES ? 'lost' : 'playing' };
}

export function giveUpClassify(s: ClassifyState): ClassifyState {
  return s.status === 'playing' ? { ...s, status: 'lost' } : s;
}

/** Spoiler-free share card: the verdict, then one row per reason attempt. */
export function classifyShareText(entry: ProcessEntry, s: ClassifyState, label = 'Feynman Verdict'): string {
  const stars = '★'.repeat(entry.difficulty) + '☆'.repeat(7 - entry.difficulty);
  const rows: string[] = [];
  if (s.category !== null) rows.push(s.category === entry.decay?.category ? '🟩' : '🟥');
  for (const t of s.tries) {
    const fb = reasonFeedback(entry, t);
    rows.push(fb.extra === 0 && fb.missing === 0 ? '🟩' : fb.right > 0 ? '🟨' : '🟥');
  }
  const result = s.status === 'won' ? '✓' : 'X';
  return [`${label} ${result}`, stars, rows.join(' ')].join('\n');
}
