import { describe, expect, it } from 'vitest';
import {
  evaluate,
  isComplete,
  MAX_ATTEMPTS,
  matchesLastGuess,
  newGame,
  setGroupAnswer,
  shareText,
  solutionGroups,
  submit,
} from '../src/game/state';
import { acceptableHideSet, makePuzzle } from '../src/puzzle/generator';
import { findProcess } from '../src/puzzle/library';
import type { Puzzle } from '../src/puzzle/types';
import { sanitizeGameState } from '../src/storage';

/** A puzzle of library decay `id` that hides exactly `hide` (edge and/or hadron-group ids). */
function puzzleOf(id: string, hide: string[]): Puzzle {
  const entry = findProcess(id)!;
  expect(acceptableHideSet(entry.diagram, hide), `${id} hide ${hide}`).toBe(true);
  return makePuzzle({ ...entry, hideSets: [hide] }, 'x');
}

describe('hidden hadron puzzles: state', () => {
  const p = puzzleOf('dec-ks-pipi', ['PiP']);

  it('hides the hadron group, not single quark legs', () => {
    expect(p.hidden).toEqual([]);
    expect(p.hiddenGroups).toEqual(['PiP']);
    expect(solutionGroups(p)).toEqual({ PiP: 'pi+' });
  });

  it('is only complete once every hidden hadron has an answer', () => {
    let s = newGame(p);
    expect(s.groupAnswers).toEqual({ PiP: null });
    expect(isComplete(p, s)).toBe(false);
    s = setGroupAnswer(s, 'PiP', 'pi+');
    expect(isComplete(p, s)).toBe(true);
    expect(setGroupAnswer(s, 'nope', 'pi+')).toBe(s);
  });

  it('the reference hadron wins', () => {
    expect(evaluate(p, {}, { PiP: 'pi+' }).correct).toBe(true);
  });

  it('a hadron with the wrong quarks is wrong, and marked red', () => {
    const fb = evaluate(p, {}, { PiP: 'pi0' }); // W+ cannot make a neutral u u-bar / d d-bar pair
    expect(fb.correct).toBe(false);
    expect(fb.groupMarks.PiP).toBe('R');
    expect(fb.messages.length).toBeGreaterThan(0);
  });

  it('K⁺ also fits the W vertex (u s̄) but there is not enough energy for K_S → K⁺ π⁻', () => {
    const fb = evaluate(p, {}, { PiP: 'K+' });
    expect(fb.correct).toBe(false);
    expect(fb.groupMarks.PiP).toBe('Y');
  });

  it('a hadron with the right quarks but not enough energy gives the "not enough energy" hint', () => {
    // ρ⁺ is made of u d̄ like the π⁺, but a K_S (498 MeV) cannot decay to ρ⁺ π⁻ (775 + 140 MeV)
    const fb = evaluate(p, {}, { PiP: 'rho+' });
    expect(fb.correct).toBe(false);
    expect(fb.groupMarks.PiP).toBe('Y');
    expect(fb.groupMessages.map((m) => m.text).join(' ')).toMatch(/not enough energy/i);
  });

  it('a hadron with the wrong number of quarks can never fit', () => {
    const fb = evaluate(p, {}, { PiP: 'p' });
    expect(fb.correct).toBe(false);
    expect(fb.groupMarks.PiP).toBe('R');
  });

  it('submitting records the hadron choice and one mark per hidden item; attempts run out after 3', () => {
    let s = setGroupAnswer(newGame(p), 'PiP', 'pi0');
    s = submit(p, s);
    expect(s.guesses).toHaveLength(1);
    expect(s.guesses[0].groups).toEqual({ PiP: 'pi0' });
    expect(s.guesses[0].marks).toEqual(['R']);
    expect(matchesLastGuess(p, s)).toBe(true);
    s = setGroupAnswer(s, 'PiP', 'rho+');
    expect(matchesLastGuess(p, s)).toBe(false);
    s = submit(p, s);
    s = setGroupAnswer(s, 'PiP', 'p');
    s = submit(p, s);
    expect(s.status).toBe('lost');
    expect(s.guesses).toHaveLength(MAX_ATTEMPTS);
    const share = shareText(p, s);
    expect(share).toContain('🟥');
    expect(share).not.toMatch(/π|K_S|pi/);
  });

  it('winning on the reference hadron', () => {
    const s = submit(p, setGroupAnswer(newGame(p), 'PiP', 'pi+'));
    expect(s.status).toBe('won');
    expect(s.guesses[0].marks).toEqual(['G']);
  });
});

describe('hidden hadron puzzles: parents, mixed states and several answers', () => {
  it('hidden parent hadron: B⁰ wins, B_s does not', () => {
    const p = puzzleOf('dec-b0-dpi', ['P']);
    expect(evaluate(p, {}, { P: 'B0' }).correct).toBe(true);
    expect(evaluate(p, {}, { P: 'Bs' }).correct).toBe(false);
  });

  it('a mixed-state hadron is accepted through any of its components: hidden π⁰ in K⁺ → π⁰ e⁺ ν', () => {
    const p = puzzleOf('dec-k-pi0enu', ['Pi']);
    expect(evaluate(p, {}, { Pi: 'pi0' }).correct).toBe(true);
    // η has the u ū component too, but K⁺ → η e⁺ ν_e needs more energy than the K⁺ has
    const eta = evaluate(p, {}, { Pi: 'eta' });
    expect(eta.correct).toBe(false);
    expect(eta.groupMessages.map((m) => m.text).join(' ')).toMatch(/not enough energy/i);
  });

  it('hidden hadron together with a hidden edge', () => {
    const p = puzzleOf('dec-ks-pipi', ['W', 'PiP']);
    expect(evaluate(p, { W: 'W+' }, { PiP: 'pi+' }).correct).toBe(true);
    expect(evaluate(p, { W: 'Z' }, { PiP: 'pi+' }).correct).toBe(false);
    expect(isComplete(p, setGroupAnswer(newGame(p), 'PiP', 'pi+'))).toBe(false); // the W is still empty
  });

  it('Σ⁰ → Λγ with a hidden Λ: only Λ has enough energy', () => {
    const p = puzzleOf('dec-sigma0', ['L']);
    expect(evaluate(p, {}, { L: 'Lambda' }).correct).toBe(true);
    const sigma = evaluate(p, {}, { L: 'Sigma0' });
    expect(sigma.correct).toBe(false);
    expect(sigma.groupMessages.map((m) => m.text).join(' ')).toMatch(/not enough energy/i);
  });
});

describe('hidden hadron puzzles: saved progress', () => {
  const p = puzzleOf('dec-ks-pipi', ['PiP']);

  it('round-trips through the storage sanitizer', () => {
    const s = submit(p, setGroupAnswer(newGame(p), 'PiP', 'rho+'));
    const back = sanitizeGameState(JSON.parse(JSON.stringify(s)), p);
    expect(back).toEqual(s);
  });

  it('drops unknown hadrons and mismatched mark lists', () => {
    const s = setGroupAnswer(newGame(p), 'PiP', 'pi+');
    const bad = JSON.parse(JSON.stringify({ ...s, groupAnswers: { PiP: 'nonsense' } }));
    expect(sanitizeGameState(bad, p)?.groupAnswers).toEqual({ PiP: null });
    const guess = { ...submit(p, setGroupAnswer(newGame(p), 'PiP', 'K+')) };
    const broken = JSON.parse(JSON.stringify({ ...guess, guesses: [{ ...guess.guesses[0], marks: [] }] }));
    expect(sanitizeGameState(broken, p)).toBeNull();
  });

  it('old saved games without hadron data still load for ordinary puzzles', () => {
    const ordinary = makePuzzle(findProcess('compton')!, 'x');
    const s = newGame(ordinary);
    const { groupAnswers: _ignored, ...legacy } = s;
    void _ignored;
    expect(sanitizeGameState(JSON.parse(JSON.stringify(legacy)), ordinary)?.groupAnswers).toEqual({});
  });
});
