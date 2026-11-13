import { checkAnswer } from '../engine/answer';
import type { ParticleId } from '../engine/particles';
import type { Diagram } from '../engine/types';
import type { Puzzle } from '../puzzle/types';

export const MAX_ATTEMPTS = 3;

/** G = both end vertices valid, Y = one of two valid, R = none valid. */
export type Mark = 'G' | 'Y' | 'R';

export interface Guess {
  answers: Record<string, ParticleId>;
  /** One mark per hidden edge, in puzzle.hidden order. */
  marks: Mark[];
}

export interface GameState {
  puzzleId: string;
  /** Current selections (stored along-the-arrow convention). */
  answers: Record<string, ParticleId | null>;
  guesses: Guess[];
  status: 'playing' | 'won' | 'lost';
  gaveUp: boolean;
}

export interface Feedback {
  correct: boolean;
  marks: Record<string, Mark>;
  vertexStates: Record<string, 'ok' | 'error'>;
  /** Hint messages for failing vertices, left-to-right numbered. */
  messages: { vertexId: string; vertexNumber: number; text: string }[];
}

export function newGame(p: Puzzle): GameState {
  return {
    puzzleId: p.id,
    answers: Object.fromEntries(p.hidden.map((id) => [id, null])),
    guesses: [],
    status: 'playing',
    gaveUp: false,
  };
}

/** Number vertices 1..n by time (x), then y, so hints can say "vertex 2". */
export function vertexNumbers(d: Diagram): Record<string, number> {
  const vs = d.nodes.filter((n) => n.kind === 'vertex').sort((a, b) => a.x - b.x || a.y - b.y);
  return Object.fromEntries(vs.map((v, i) => [v.id, i + 1]));
}

export function setAnswer(s: GameState, edgeId: string, stored: ParticleId | null): GameState {
  if (s.status !== 'playing' || !(edgeId in s.answers)) return s;
  return { ...s, answers: { ...s.answers, [edgeId]: stored } };
}

export function isComplete(p: Puzzle, s: GameState): boolean {
  return p.hidden.every((id) => s.answers[id]);
}

/** The reference answer from the library (one of possibly several valid ones). */
export function solutionOf(p: Puzzle): Record<string, ParticleId> {
  const out: Record<string, ParticleId> = {};
  for (const id of p.hidden) out[id] = p.diagram.edges.find((e) => e.id === id)!.particle!;
  return out;
}

/** Evaluate a complete set of answers. Any valid completion is correct. */
export function evaluate(p: Puzzle, answers: Record<string, ParticleId | null | undefined>): Feedback {
  const check = checkAnswer(p.diagram, p.hidden, answers);
  const nums = vertexNumbers(p.diagram);
  const kind = new Map(p.diagram.nodes.map((n) => [n.id, n.kind]));

  const vertexStates: Feedback['vertexStates'] = {};
  const messages: Feedback['messages'] = [];
  for (const [vid, r] of Object.entries(check.validation.vertices)) {
    if (r.status === 'ok') vertexStates[vid] = 'ok';
    else if (r.status === 'invalid') {
      vertexStates[vid] = 'error';
      for (const i of r.issues) messages.push({ vertexId: vid, vertexNumber: nums[vid], text: i.message });
    }
  }
  messages.sort((a, b) => a.vertexNumber - b.vertexNumber);

  const marks: Record<string, Mark> = {};
  for (const id of p.hidden) {
    const e = p.diagram.edges.find((e) => e.id === id)!;
    const ends = [e.from, e.to].filter((n) => kind.get(n) === 'vertex');
    const ok = ends.filter((n) => vertexStates[n] === 'ok').length;
    marks[id] = ok === ends.length ? 'G' : ok === 0 ? 'R' : 'Y';
  }
  return { correct: check.correct, marks, vertexStates, messages };
}

/** Submit the current answers as a guess. No-op unless complete and still playing. */
export function submit(p: Puzzle, s: GameState): GameState {
  if (s.status !== 'playing' || !isComplete(p, s)) return s;
  const fb = evaluate(p, s.answers);
  const guess: Guess = {
    answers: Object.fromEntries(p.hidden.map((id) => [id, s.answers[id] as ParticleId])),
    marks: p.hidden.map((id) => fb.marks[id]),
  };
  const guesses = [...s.guesses, guess];
  const status = fb.correct ? 'won' : guesses.length >= MAX_ATTEMPTS ? 'lost' : 'playing';
  return { ...s, guesses, status };
}

export function giveUp(s: GameState): GameState {
  if (s.status !== 'playing') return s;
  return { ...s, status: 'lost', gaveUp: true };
}

/** Do the current answers equal the last submitted guess? (Then its feedback is still relevant.) */
export function matchesLastGuess(p: Puzzle, s: GameState): boolean {
  const last = s.guesses[s.guesses.length - 1];
  return !!last && p.hidden.every((id) => s.answers[id] === last.answers[id]);
}

const EMOJI: Record<Mark, string> = { G: '🟩', Y: '🟨', R: '🟥' };

/** Spoiler-free emoji summary (no process name, no particle names). */
export function shareText(
  p: Puzzle,
  s: GameState,
  opts: { dayNumber?: number | null; url?: string; label?: string } = {},
): string {
  const result = s.status === 'won' ? `${s.guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  const stars = '★'.repeat(p.difficulty) + '☆'.repeat(7 - p.difficulty);
  const head = `${opts.label ?? 'Feynman Puzzle'}${opts.dayNumber ? ` #${opts.dayNumber}` : ''} ${result}`;
  const rows = s.guesses.map((g) => g.marks.map((m) => EMOJI[m]).join(''));
  return [head, stars, ...rows, ...(opts.url ? [opts.url] : [])].join('\n');
}
