import { validateDiagram } from '../engine/validator';
import type { Puzzle } from '../puzzle/types';
import { MAX_ATTEMPTS } from './state';

export interface ForbiddenState {
  puzzleId: string;
  /** Vertex ids the player has tapped, in order. */
  guesses: string[];
  status: 'playing' | 'won' | 'lost';
}

export function newForbidden(p: Puzzle): ForbiddenState {
  return { puzzleId: p.id, guesses: [], status: 'playing' };
}

/** Tap a vertex as the answer. Repeat taps and taps after the end are ignored. */
export function guessVertex(p: Puzzle, s: ForbiddenState, vertexId: string): ForbiddenState {
  if (s.status !== 'playing' || !p.forbidden || s.guesses.includes(vertexId)) return s;
  const guesses = [...s.guesses, vertexId];
  const status = vertexId === p.forbidden.vertexId ? 'won' : guesses.length >= MAX_ATTEMPTS ? 'lost' : 'playing';
  return { ...s, guesses, status };
}

export function giveUpForbidden(s: ForbiddenState): ForbiddenState {
  return s.status === 'playing' ? { ...s, status: 'lost' } : s;
}

/** Why the bad vertex is forbidden (the validator's hint message). */
export function forbiddenReason(p: Puzzle): string {
  const r = validateDiagram(p.diagram).vertices[p.forbidden!.vertexId];
  return r?.issues[0]?.message ?? 'This vertex is not allowed.';
}

/** After 2 misses, a coarse hint: which kind of rule is broken. */
export function forbiddenHint(p: Puzzle): string {
  const code = validateDiagram(p.diagram).vertices[p.forbidden!.vertexId]?.issues[0]?.code;
  switch (code) {
    case 'charge':
      return 'Hint: electric charge is not conserved at the bad vertex.';
    case 'baryon':
      return 'Hint: baryon number is not conserved at the bad vertex.';
    case 'lepton-e':
    case 'lepton-mu':
    case 'lepton-tau':
      return 'Hint: a lepton family number is not conserved at the bad vertex.';
    default:
      return 'Hint: the bad vertex conserves the charges but has no Standard Model coupling.';
  }
}

export function forbiddenShareText(p: Puzzle, s: ForbiddenState, label = 'Feynman Spot'): string {
  const result = s.status === 'won' ? `${s.guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  const stars = '★'.repeat(p.difficulty) + '☆'.repeat(7 - p.difficulty);
  const rows = s.guesses.map((g) => (g === p.forbidden?.vertexId ? '🟩' : '🟥')).join('');
  return [`${label} ${result}`, stars, rows].join('\n');
}
