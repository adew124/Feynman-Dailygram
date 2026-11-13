import { describe, expect, it } from 'vitest';
import {
  classifyShareText,
  giveUpClassify,
  guessReasons,
  makeClassifyPuzzle,
  MAX_REASON_TRIES,
  newClassify,
  pickCategory,
  reasonFeedback,
  reasonGroupsOf,
} from '../src/game/classify';
import { findProcess, LIBRARY } from '../src/puzzle/library';
import { practicePool } from '../src/puzzle/practiceFilter';

const entry = (id: string) => findProcess(id)!;

describe('allowed or suppressed: logic', () => {
  it('builds a puzzle only for decays that carry a classification', () => {
    expect(makeClassifyPuzzle(entry('dec-pi-enu'))?.kind).toBe('classify');
    expect(makeClassifyPuzzle(entry('kaon-box'))).toBeNull();
    const p = makeClassifyPuzzle(entry('dec-pi-enu'))!;
    expect(p.hidden).toEqual([]);
    expect(p.processId).toBe('dec-pi-enu');
  });

  it('groups the three CKM cases into one reason choice', () => {
    expect(reasonGroupsOf(['cabibbo-single'])).toEqual(['ckm']);
    expect(reasonGroupsOf(['cabibbo-double', 'ckm-b-u'])).toEqual(['ckm']);
    expect(reasonGroupsOf(['loop-gim', 'helicity'])).toEqual(['helicity', 'loop-gim']);
    expect(reasonGroupsOf([])).toEqual([]);
  });

  it('an allowed decay is won by picking "allowed", lost by picking "suppressed"', () => {
    const e = entry('dec-d0-kpi');
    const p = makeClassifyPuzzle(e)!;
    expect(pickCategory(e, newClassify(p), 'allowed').status).toBe('won');
    expect(pickCategory(e, newClassify(p), 'suppressed').status).toBe('lost');
  });

  it('a suppressed decay needs the verdict and then the right reasons', () => {
    const e = entry('dec-d0-pipi');
    const p = makeClassifyPuzzle(e)!;
    let s = pickCategory(e, newClassify(p), 'allowed');
    expect(s.status).toBe('lost');
    s = pickCategory(e, newClassify(p), 'suppressed');
    expect(s.status).toBe('playing');
    expect(guessReasons(e, s, ['ckm']).status).toBe('won');
  });

  it('exact set required: extra or missing reasons do not win; two tries; feedback counts', () => {
    const e = entry('dec-kl-mumu'); // loop-gim + helicity
    const p = makeClassifyPuzzle(e)!;
    let s = pickCategory(e, newClassify(p), 'suppressed');
    expect(reasonFeedback(e, ['helicity'])).toEqual({ right: 1, extra: 0, missing: 1 });
    expect(reasonFeedback(e, ['helicity', 'ozi'])).toEqual({ right: 1, extra: 1, missing: 1 });
    s = guessReasons(e, s, ['helicity']);
    expect(s.status).toBe('playing');
    expect(s.tries).toHaveLength(1);
    s = guessReasons(e, s, ['helicity', 'loop-gim']);
    expect(s.status).toBe('won');
    // two wrong tries lose
    let t = pickCategory(e, newClassify(p), 'suppressed');
    for (let i = 0; i < MAX_REASON_TRIES; i++) t = guessReasons(e, t, ['ozi']);
    expect(t.status).toBe('lost');
    // nothing more is accepted after the game ends
    expect(guessReasons(e, t, ['helicity', 'loop-gim'])).toBe(t);
  });

  it('empty picks, picks before the verdict and give-up behave', () => {
    const e = entry('dec-phi-3pi');
    const p = makeClassifyPuzzle(e)!;
    const fresh = newClassify(p);
    expect(guessReasons(e, fresh, ['ozi'])).toBe(fresh);
    const s = pickCategory(e, fresh, 'suppressed');
    expect(guessReasons(e, s, [])).toBe(s);
    expect(giveUpClassify(s).status).toBe('lost');
    expect(pickCategory(e, s, 'allowed')).toBe(s); // verdict is final
  });

  it('every suppressed decay in the library can be won with its own reasons', () => {
    for (const e of LIBRARY.filter((x) => x.decay?.category === 'suppressed')) {
      const p = makeClassifyPuzzle(e)!;
      const s = guessReasons(e, pickCategory(e, newClassify(p), 'suppressed'), reasonGroupsOf(e.decay!.reasons));
      expect(s.status, e.id).toBe('won');
    }
  });

  it('share text has no spoilers: no names, particles or reasons', () => {
    const e = entry('dec-b0bar-d0pi0');
    const p = makeClassifyPuzzle(e)!;
    let s = pickCategory(e, newClassify(p), 'suppressed');
    s = guessReasons(e, s, ['ckm']);
    s = guessReasons(e, s, ['color']);
    const t = classifyShareText(e, s);
    expect(t).toContain('🟩 🟥 🟩');
    expect(t).not.toMatch(/B̄|D⁰|color|ckm|π/i);
  });
});

describe('practice filters', () => {
  const base = { level: 0, scope: 'both', cls: 'any', type: 'mixed' } as const;

  it('scattering / decay / both', () => {
    const scat = practicePool(LIBRARY, { ...base, scope: 'scattering' });
    const dec = practicePool(LIBRARY, { ...base, scope: 'decay' });
    const all = practicePool(LIBRARY, base);
    expect(scat.every((e) => !e.isDecay)).toBe(true);
    expect(dec.every((e) => e.isDecay)).toBe(true);
    expect(scat.length + dec.length).toBe(all.length);
    expect(dec.length).toBeGreaterThan(38);
  });

  it('allowed / suppressed only gives classified decays', () => {
    const allowed = practicePool(LIBRARY, { ...base, cls: 'allowed' });
    const supp = practicePool(LIBRARY, { ...base, cls: 'suppressed' });
    expect(allowed.length).toBe(24);
    expect(supp.length).toBe(14);
    expect(supp.every((e) => e.decay?.category === 'suppressed')).toBe(true);
  });

  it('difficulty narrows it, the classify type needs classification, forbidden needs no hadrons', () => {
    expect(practicePool(LIBRARY, { ...base, level: 7, scope: 'decay', cls: 'suppressed' }).every((e) => e.difficulty === 7)).toBe(true);
    expect(practicePool(LIBRARY, { ...base, type: 'classify' }).every((e) => e.decay)).toBe(true);
    expect(practicePool(LIBRARY, { ...base, type: 'forbidden' }).every((e) => !e.diagram.hadrons?.length)).toBe(true);
    expect(practicePool(LIBRARY, { ...base, scope: 'scattering', cls: 'allowed' })).toHaveLength(24); // class wins over scope
  });
});
