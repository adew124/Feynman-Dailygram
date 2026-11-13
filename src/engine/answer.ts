import type { ParticleId } from './particles';
import type { Diagram } from './types';
import { validateDiagram, type ValidationResult } from './validator';

export interface AnswerCheck {
  /** Player's answer fully valid. */
  correct: boolean;
  /** Hidden edges the player has not filled in yet. */
  missing: string[];
  /** Answer keys that name edges which are not hidden (ignored, flagged). */
  illegal: string[];
  validation: ValidationResult;
}

/**
 * Check a player's answer. `puzzle` holds the revealed particles on all
 * non-hidden edges (hidden edges' contents are ignored). `answer` maps hidden
 * edge ids to the player's choice, in the stored along-the-arrow convention.
 *
 * Any assignment that makes the whole diagram valid is accepted — there is no
 * answer key. Revealed edges can't be changed: answer entries for them are
 * discarded and reported in `illegal`.
 */
export function checkAnswer(
  puzzle: Diagram,
  hidden: readonly string[],
  answer: Record<string, ParticleId | null | undefined>,
): AnswerCheck {
  const hiddenSet = new Set(hidden);
  const illegal = Object.keys(answer).filter((k) => !hiddenSet.has(k));
  const composed: Diagram = {
    ...puzzle,
    edges: puzzle.edges.map((e) =>
      hiddenSet.has(e.id) ? { ...e, particle: answer[e.id] ?? null } : { ...e },
    ),
  };
  const missing = hidden.filter((id) => !answer[id]);
  const validation = validateDiagram(composed);
  return {
    correct: illegal.length === 0 && missing.length === 0 && validation.valid,
    missing,
    illegal,
    validation,
  };
}
