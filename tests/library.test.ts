import { describe, expect, it } from 'vitest';
import { solve } from '../src/engine/solver';
import { structuralErrors, validateDiagram } from '../src/engine/validator';
import { addDays, weekday } from '../src/game/dates';
import { evaluate, solutionOf } from '../src/game/state';
import { acceptableHideSet, dailyPuzzle, makePuzzle } from '../src/puzzle/generator';
import { LIBRARY } from '../src/puzzle/library';
import { parseProcess, type RawProcess } from '../src/puzzle/loader';

describe('library data', () => {
  it('has at least 40 processes with unique ids', () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(40);
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(LIBRARY.length);
  });

  it('covers every difficulty 1..7 with at least 4 processes each', () => {
    for (let d = 1; d <= 7; d++) {
      expect(LIBRARY.filter((e) => e.difficulty === d).length, `difficulty ${d}`).toBeGreaterThanOrEqual(4);
    }
  });

  for (const e of LIBRARY) {
    describe(e.id, () => {
      it('is a fully assigned, valid Standard Model diagram', () => {
        const r = validateDiagram(e.diagram);
        expect(r.issues.map((i) => `${i.vertexId}: ${i.message}`)).toEqual([]);
        expect(r.valid).toBe(true);
        expect(structuralErrors(e.diagram)).toEqual([]);
      });

      it('has sensible layout: time flows right, legs on the correct side', () => {
        const node = new Map(e.diagram.nodes.map((n) => [n.id, n]));
        for (const ed of e.diagram.edges) {
          const a = node.get(ed.from)!;
          const b = node.get(ed.to)!;
          if (a.kind === 'external' || b.kind === 'external') {
            // incoming legs sit at the left edge, outgoing at the right edge
            const ext = a.kind === 'external' ? a : b;
            const v = a.kind === 'external' ? b : a;
            if (ext.x === v.x) continue; // vertical leg (e.g. a photon off a loop): direction-neutral
            const allX = e.diagram.nodes.map((n) => n.x);
            if (ext.x < v.x) expect(ext.x, ed.id).toBe(Math.min(...allX));
            else expect(ext.x, ed.id).toBe(Math.max(...allX));
          }
        }
        const pts = e.diagram.nodes.map((n) => `${n.x},${n.y}`);
        expect(new Set(pts).size, 'no two nodes at the same spot').toBe(pts.length);
      });

      it('has a 2-3 sentence explanation and a name', () => {
        const sentences = e.explanation.match(/[.!?](?=\s|$)/g) ?? [];
        expect(sentences.length).toBeGreaterThanOrEqual(2);
        expect(sentences.length).toBeLessThanOrEqual(3);
        expect(e.name.length).toBeGreaterThan(2);
      });

      it('has at least one curated hide set that is solvable and fair', () => {
        expect(e.hideSets?.length ?? 0).toBeGreaterThan(0);
        const good = (e.hideSets ?? []).filter((s) => acceptableHideSet(e.diagram, s));
        expect(good.length).toBeGreaterThanOrEqual(1);
      });

      it('makes valid puzzles for many seeds; the reference answer wins', () => {
        for (let i = 0; i < 5; i++) {
          const p = makePuzzle(e, `s${i}`);
          const sols = solve(p.diagram, p.hidden, 100);
          expect(sols.length).toBeGreaterThan(0);
          expect(evaluate(p, solutionOf(p)).correct).toBe(true);
        }
      });
    });
  }
});

describe('daily selection across the library', () => {
  it('difficulty follows the weekday exactly for a whole year', () => {
    let day = '2026-11-12';
    const seen = new Set<string>();
    for (let i = 0; i < 365; i++) {
      const p = dailyPuzzle(day);
      expect(p.difficulty, day).toBe(weekday(day));
      seen.add(p.processId);
      day = addDays(day, 1);
    }
    expect(seen.size).toBeGreaterThanOrEqual(35); // plenty of variety
  });
});

describe('loader', () => {
  const base: RawProcess = {
    id: 't',
    name: 'T',
    difficulty: 1,
    explanation: 'One. Two.',
    vertices: { v: [1, 0] },
    externals: { a: [0, 0], c: [2, -1], d: [2, 1] },
    legs: [
      ['z', 'in', 'a', 'v', 'Z'],
      ['m', 'out', 'c', 'v', 'mu-'],
      ['am', 'out', 'd', 'v', 'mu+'],
    ],
  };
  it('derives arrow direction and stored particle from physical legs', () => {
    const d = parseProcess(base).diagram;
    const by = Object.fromEntries(d.edges.map((e) => [e.id, e]));
    expect(by.m).toMatchObject({ from: 'v', to: 'c', particle: 'mu-' }); // outgoing particle: arrow out
    expect(by.am).toMatchObject({ from: 'd', to: 'v', particle: 'mu-' }); // outgoing antiparticle: arrow in
    expect(by.z).toMatchObject({ from: 'a', to: 'v', particle: 'Z' });
    expect(validateDiagram(d).valid).toBe(true);
  });
  it('incoming antiparticle points away from the vertex', () => {
    const d = parseProcess({
      ...base,
      legs: [['p', 'in', 'a', 'v', 'e+'], ...base.legs.slice(1)],
    }).diagram;
    expect(d.edges.find((e) => e.id === 'p')).toMatchObject({ from: 'v', to: 'a', particle: 'e-' });
  });
  it('rejects bad data with a helpful message', () => {
    expect(() => parseProcess({ ...base, legs: [['z', 'in', 'a', 'v', 'nope']] })).toThrow(/unknown particle/);
    expect(() => parseProcess({ ...base, legs: [['z', 'in', 'zz', 'v', 'Z']] })).toThrow(/unknown external/);
    expect(() => parseProcess({ ...base, hideSets: [['missing']] })).toThrow(/unknown edge/);
    expect(() => parseProcess({ ...base, difficulty: 9 })).toThrow(/difficulty/);
  });
});
