import { describe, expect, it } from 'vitest';
import { storedFromPhysical } from '../src/engine/orientation';
import { solve } from '../src/engine/solver';
import { addDays, dayNumber, daysBetween, isValidKey, todayKey, weekday } from '../src/game/dates';
import {
  evaluate,
  giveUp,
  isComplete,
  MAX_ATTEMPTS,
  matchesLastGuess,
  newGame,
  setAnswer,
  shareText,
  solutionOf,
  submit,
  vertexNumbers,
} from '../src/game/state';
import { currentStreak, emptyStats, recordResult, sanitizeStats } from '../src/game/stats';
import {
  acceptableHideSet,
  chooseHidden,
  dailyPuzzle,
  entriesNear,
  isExternalEdge,
  makePuzzle,
} from '../src/puzzle/generator';
import { findProcess, LIBRARY } from '../src/puzzle/library';
import { hashString, mulberry32 } from '../src/puzzle/rng';
import { sanitizeGameState } from '../src/storage';

describe('dates', () => {
  it('todayKey uses local calendar date', () => {
    expect(todayKey(new Date(2026, 10, 12, 23, 59))).toBe('2026-11-12');
    expect(todayKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
  it('validates keys', () => {
    expect(isValidKey('2026-02-28')).toBe(true);
    expect(isValidKey('2026-02-30')).toBe(false);
    expect(isValidKey('26-1-1')).toBe(false);
  });
  it('adds days across month/year boundaries and DST-safe', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST change
    expect(daysBetween('2026-11-12', '2026-11-15')).toBe(3);
  });
  it('weekday is Monday=1..Sunday=7', () => {
    expect(weekday('2026-11-09')).toBe(1); // Monday
    expect(weekday('2026-11-15')).toBe(7); // Sunday
  });
  it('day number starts at 1 on launch day', () => {
    expect(dayNumber('2026-11-12')).toBe(1);
    expect(dayNumber('2026-11-13')).toBe(2);
  });
});

describe('rng', () => {
  it('is deterministic and in range', () => {
    const a = mulberry32(hashString('x'));
    const b = mulberry32(hashString('x'));
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('puzzle generation', () => {
  it('every library process has a valid diagram and at least one good hide set', () => {
    for (const e of LIBRARY) {
      const p = makePuzzle(e, 'test');
      expect(p.hidden.length + (p.hiddenGroups?.length ?? 0)).toBeGreaterThan(0);
      expect(acceptableHideSet(e.diagram, [...p.hidden, ...(p.hiddenGroups ?? [])]), e.id).toBe(true);
    }
  });

  it('same date => same puzzle; hidden set deterministic', () => {
    for (const d of ['2026-11-12', '2026-11-13', '2027-03-01']) {
      expect(dailyPuzzle(d)).toEqual(dailyPuzzle(d));
    }
  });

  it('difficulty follows the weekday (Mon easy ... Sun hard) as closely as the library allows', () => {
    const mon = dailyPuzzle('2026-11-09');
    const sun = dailyPuzzle('2026-11-15');
    expect(mon.difficulty).toBe(1);
    expect(sun.difficulty).toBe(7);
    expect(entriesNear(LIBRARY, 1).every((e) => e.difficulty === 1)).toBe(true);
  });

  it('hidden sets are solvable by the engine and the reference answer is among the solutions', () => {
    for (const e of LIBRARY) {
      for (let i = 0; i < 6; i++) {
        const p = makePuzzle(e, `seed-${i}`);
        const sols = solve(p.diagram, p.hidden, 100);
        const ref = solutionOf(p);
        expect(sols.some((s) => p.hidden.every((id) => s[id] === ref[id]))).toBe(true);
      }
    }
  });

  it('hidden external legs are forced to a single answer (process cannot change)', () => {
    for (const e of LIBRARY) {
      for (let i = 0; i < 6; i++) {
        const p = makePuzzle(e, `seed-${i}`);
        const sols = solve(p.diagram, p.hidden, 100);
        for (const id of p.hidden.filter((id) => isExternalEdge(p.diagram, id))) {
          expect(new Set(sols.map((s) => s[id])).size).toBe(1);
        }
      }
    }
  });

  it('rejects hide sets that leave external legs ambiguous', () => {
    // hiding both muon legs in ee->mumu allows quarks, taus, W pairs, ... : not a fair puzzle
    const e = findProcess('ee-mumu')!;
    expect(acceptableHideSet(e.diagram, ['mu_out', 'amu_out'])).toBe(false);
    expect(acceptableHideSet(e.diagram, [])).toBe(false);
    expect(chooseHidden(e, 'whatever').length).toBeGreaterThan(0);
  });
});

describe('game state', () => {
  const entry = findProcess('beta-minus')!;
  const puzzle = { ...makePuzzle(entry, 's'), hidden: ['W', 'nubar'] };

  it('starts empty and cannot be submitted incomplete', () => {
    const g = newGame(puzzle);
    expect(isComplete(puzzle, g)).toBe(false);
    expect(submit(puzzle, g)).toBe(g);
  });

  it('wins with a correct answer entered via PHYSICAL labels', () => {
    let g = newGame(puzzle);
    const edge = (id: string) => puzzle.diagram.edges.find((e) => e.id === id)!;
    g = setAnswer(g, 'W', storedFromPhysical(puzzle.diagram, edge('W'), 'W-'));
    // the player picks the antineutrino from the palette
    g = setAnswer(g, 'nubar', storedFromPhysical(puzzle.diagram, edge('nubar'), 'anti_nu_e'));
    g = submit(puzzle, g);
    expect(g.status).toBe('won');
    expect(g.guesses).toHaveLength(1);
    expect(g.guesses[0].marks).toEqual(['G', 'G']);
  });

  it('picking a plain neutrino instead of the antineutrino is wrong with a lepton-number hint', () => {
    const edge = puzzle.diagram.edges.find((e) => e.id === 'nubar')!;
    let g = newGame(puzzle);
    g = setAnswer(g, 'W', 'W-');
    g = setAnswer(g, 'nubar', storedFromPhysical(puzzle.diagram, edge, 'nu_e'));
    const fb = evaluate(puzzle, g.answers);
    expect(fb.correct).toBe(false);
    expect(fb.messages.some((m) => /lepton number/i.test(m.text))).toBe(true);
    expect(fb.vertexStates).toMatchObject({ v1: 'ok', v2: 'error' });
    g = submit(puzzle, g);
    expect(g.status).toBe('playing');
    expect(matchesLastGuess(puzzle, g)).toBe(true);
    // editing invalidates the shown feedback
    g = setAnswer(g, 'nubar', null);
    expect(matchesLastGuess(puzzle, g)).toBe(false);
  });

  it('loses after the maximum number of wrong attempts', () => {
    let g = newGame(puzzle);
    g = setAnswer(g, 'W', 'W+');
    g = setAnswer(g, 'nubar', 'nu_mu');
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(g.status).toBe('playing');
      g = submit(puzzle, g);
    }
    expect(g.status).toBe('lost');
    expect(g.guesses).toHaveLength(MAX_ATTEMPTS);
    // finished games are frozen
    expect(setAnswer(g, 'W', 'W-')).toBe(g);
    expect(submit(puzzle, g)).toBe(g);
  });

  it('accepts any valid answer: gamma, Z or H for the e+e- propagator', () => {
    const p = { ...makePuzzle(findProcess('ee-mumu')!, 's'), hidden: ['prop'] };
    for (const prop of ['gamma', 'Z', 'H']) {
      const g = submit(p, setAnswer(newGame(p), 'prop', prop));
      expect(g.status, prop).toBe('won');
    }
    expect(submit(p, setAnswer(newGame(p), 'prop', 'g')).status).toBe('playing');
  });

  it('give up ends the game as a loss', () => {
    const g = giveUp(newGame(puzzle));
    expect(g.status).toBe('lost');
    expect(g.gaveUp).toBe(true);
  });

  it('numbers vertices left to right', () => {
    const n = vertexNumbers(puzzle.diagram);
    expect(n.v1).toBe(1);
    expect(n.v2).toBe(2);
  });

  it('marks edges Y when only one end vertex is valid', () => {
    let g = newGame(puzzle);
    g = setAnswer(g, 'W', 'W-'); // v1 fine
    g = setAnswer(g, 'nubar', 'nu_mu'); // v2 broken
    const fb = evaluate(puzzle, g.answers);
    expect(fb.marks.W).toBe('Y');
    expect(fb.marks.nubar).toBe('R'); // external: its only vertex is broken
  });

  it('share text has no spoilers', () => {
    let g = newGame(puzzle);
    g = setAnswer(g, 'W', 'W+');
    g = setAnswer(g, 'nubar', 'nu_mu');
    g = submit(puzzle, g);
    g = setAnswer(g, 'W', 'W-');
    g = setAnswer(g, 'nubar', 'nu_e');
    g = submit(puzzle, g);
    expect(g.status).toBe('won');
    const text = shareText(puzzle, g, { dayNumber: 7, url: 'https://example.test/' });
    expect(text.split('\n')[0]).toBe('Feynman Puzzle #7 2/3');
    expect(text).toMatch(/🟩/u);
    expect(text).toContain('https://example.test/');
    expect(text).not.toMatch(/beta|W|nu|quark|decay/i);
    const lost = giveUp(newGame(puzzle));
    expect(shareText(puzzle, lost).split('\n')[0]).toBe('Feynman Puzzle X/3');
  });
});

describe('stats and streaks', () => {
  it('counts wins, distribution and consecutive-day streaks', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-11-12', true, 2);
    s = recordResult(s, '2026-11-13', true, 1);
    s = recordResult(s, '2026-11-14', true, 3);
    expect(s).toMatchObject({ played: 3, wins: 3, streak: 3, maxStreak: 3, dist: [1, 1, 1] });
  });

  it('a loss resets the streak but keeps the max', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-11-12', true, 1);
    s = recordResult(s, '2026-11-13', true, 1);
    s = recordResult(s, '2026-11-14', false, 3);
    expect(s.streak).toBe(0);
    expect(s.maxStreak).toBe(2);
    expect(s.played).toBe(3);
  });

  it('a skipped day restarts the streak at 1', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-11-12', true, 1);
    s = recordResult(s, '2026-11-14', true, 1);
    expect(s.streak).toBe(1);
  });

  it('is idempotent per date', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-11-12', true, 1);
    expect(recordResult(s, '2026-11-12', false, 3)).toBe(s);
  });

  it('displayed streak is broken when the last win is older than yesterday', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-11-12', true, 1);
    expect(currentStreak(s, '2026-11-12')).toBe(1);
    expect(currentStreak(s, '2026-11-13')).toBe(1);
    expect(currentStreak(s, '2026-11-14')).toBe(0);
  });

  it('survives month boundaries', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-11-30', true, 1);
    s = recordResult(s, '2026-12-01', true, 1);
    expect(s.streak).toBe(2);
  });

  it('sanitizes corrupted stats', () => {
    expect(sanitizeStats(null)).toEqual(emptyStats());
    expect(sanitizeStats({ played: -5, wins: 'x', dist: 'bad', lastDate: 3 })).toEqual(emptyStats());
    expect(sanitizeStats({ played: 4, wins: 2, dist: [1, 1, 0] }).played).toBe(4);
  });
});

describe('saved progress sanitizing', () => {
  const p = makePuzzle(findProcess('beta-minus')!, 'x');
  it('accepts a valid saved game and rejects wrong puzzle or junk', () => {
    const g = submit(p, setAnswer(setAnswer(newGame(p), p.hidden[0], 'W+'), p.hidden[p.hidden.length - 1], 'mu-'));
    expect(sanitizeGameState(JSON.parse(JSON.stringify(g)), p)).toEqual(g);
    expect(sanitizeGameState({ ...g, puzzleId: 'other' }, p)).toBeNull();
    expect(sanitizeGameState('junk', p)).toBeNull();
    expect(sanitizeGameState({ ...g, status: 'hacked' }, p)).toBeNull();
    const badAnswer = sanitizeGameState({ ...g, answers: { [p.hidden[0]]: 'not-a-particle' } }, p);
    expect(badAnswer?.answers[p.hidden[0]]).toBeNull();
    expect(sanitizeGameState({ ...g, guesses: [{ answers: {}, marks: [] }] }, p)).toBeNull();
  });
});
