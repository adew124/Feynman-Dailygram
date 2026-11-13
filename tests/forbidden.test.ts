import { describe, expect, it } from 'vitest';
import { validateDiagram } from '../src/engine/validator';
import {
  forbiddenHint,
  forbiddenReason,
  forbiddenShareText,
  giveUpForbidden,
  guessVertex,
  newForbidden,
} from '../src/game/forbidden';
import { makeForbiddenPuzzle } from '../src/puzzle/forbidden';
import { LIBRARY } from '../src/puzzle/library';

describe('forbidden-vertex generator', () => {
  it('every library process yields a puzzle with exactly one invalid vertex', () => {
    for (const entry of LIBRARY.filter((e) => !e.diagram.hadrons?.length)) {
      const p = makeForbiddenPuzzle(entry, 'test-seed');
      expect(p, entry.id).not.toBeNull();
      const r = validateDiagram(p!.diagram);
      const bad = Object.values(r.vertices).filter((v) => v.status !== 'ok');
      expect(bad.map((v) => v.vertexId), entry.id).toEqual([p!.forbidden!.vertexId]);
      expect(bad[0].status).toBe('invalid');
      expect(p!.kind).toBe('forbidden');
      expect(p!.hidden).toEqual([]);
    }
  });

  it('is deterministic per seed, and restoring the original leg gives a valid diagram', () => {
    const entry = LIBRARY[0];
    const a = makeForbiddenPuzzle(entry, 's1')!;
    const b = makeForbiddenPuzzle(entry, 's1')!;
    expect(a).toEqual(b);
    const fixed = {
      ...a.diagram,
      edges: a.diagram.edges.map((e) => (e.id === a.forbidden!.edgeId ? { ...e, particle: a.forbidden!.original } : e)),
    };
    expect(validateDiagram(fixed as typeof a.diagram).valid).toBe(true);
  });

  it('only swaps external legs, and the swapped leg touches the bad vertex', () => {
    for (const entry of LIBRARY.filter((e) => !e.diagram.hadrons?.length)) {
      const p = makeForbiddenPuzzle(entry, 'x')!;
      const e = p.diagram.edges.find((x) => x.id === p.forbidden!.edgeId)!;
      expect([e.from, e.to]).toContain(p.forbidden!.vertexId);
      const kinds = new Map(p.diagram.nodes.map((n) => [n.id, n.kind]));
      expect([kinds.get(e.from), kinds.get(e.to)]).toContain('external');
    }
  });
});

describe('forbidden-vertex generator and hadrons', () => {
  it('returns null for decays drawn with hadrons (a swapped quark leg would also break its hadron)', () => {
    const decay = LIBRARY.find((e) => e.diagram.hadrons?.length)!;
    expect(makeForbiddenPuzzle(decay, 's')).toBeNull();
  });
});

describe('forbidden-vertex game', () => {
  const puzzle = makeForbiddenPuzzle(LIBRARY[0], 'g')!;
  const bad = puzzle.forbidden!.vertexId;
  const others = puzzle.diagram.nodes.filter((n) => n.kind === 'vertex' && n.id !== bad).map((n) => n.id);

  it('wins when the bad vertex is tapped', () => {
    const s = guessVertex(puzzle, newForbidden(puzzle), bad);
    expect(s.status).toBe('won');
    expect(s.guesses).toEqual([bad]);
  });

  it('ignores repeat taps, loses after 3 misses or on give up, and ignores taps afterwards', () => {
    let s = newForbidden(puzzle);
    s = guessVertex(puzzle, s, others[0]);
    expect(guessVertex(puzzle, s, others[0])).toBe(s);
    expect(s.status).toBe('playing');
    expect(giveUpForbidden(s).status).toBe('lost');
    const fake = ['a', 'b'];
    for (const f of fake) s = guessVertex(puzzle, s, f);
    expect(s.status).toBe('lost');
    expect(guessVertex(puzzle, s, bad)).toBe(s);
  });

  it('share text has no spoilers and one square per guess', () => {
    let s = guessVertex(puzzle, newForbidden(puzzle), others[0]);
    s = guessVertex(puzzle, s, bad);
    const t = forbiddenShareText(puzzle, s);
    expect(t).toContain('2/3');
    expect(t).toContain('🟥🟩');
    expect(t).not.toContain(puzzle.name);
  });

  it('explains the violation and gives a coarse hint', () => {
    expect(forbiddenReason(puzzle).length).toBeGreaterThan(5);
    expect(forbiddenHint(puzzle)).toMatch(/^Hint:/);
  });
});
