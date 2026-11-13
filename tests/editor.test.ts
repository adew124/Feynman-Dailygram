import LZString from 'lz-string';
import { describe, expect, it } from 'vitest';
import { checkModel } from '../src/editor/checks';
import {
  addEdge,
  addExternalLeg,
  addVertex,
  deleteEdge,
  deleteNode,
  emptyModel,
  hiddenIds,
  LIMITS,
  modelFromDiagram,
  moveNode,
  sanitizeModel,
  setParticle,
  setText,
  snap,
  toDiagram,
  toggleHidden,
  type EditorModel,
  type Result,
} from '../src/editor/model';
import {
  decodeShared,
  describeDiagram,
  encodeShared,
  estimateDifficulty,
  HASH_PREFIX,
  puzzleFromShared,
  shareUrl,
} from '../src/editor/share';
import { physicalParticle } from '../src/engine/orientation';
import { validateDiagram } from '../src/engine/validator';
import { evaluate, newGame, solutionOf, submit } from '../src/game/state';
import { findProcess, LIBRARY } from '../src/puzzle/library';

/** Apply a Result and return the new model (throws if it failed). */
function ok<T>(r: Result<T>): { m: EditorModel; v: T } {
  if (!r.ok) throw new Error(r.error);
  return { m: r.model, v: r.value };
}

/** e- e+ -> gamma -> mu- mu+ built through the editor API. */
function buildEEMuMu(): EditorModel {
  let m = emptyModel();
  const v1 = ok(addVertex(m, 3, 2.5));
  m = v1.m;
  const v2 = ok(addVertex(m, 5, 2.5));
  m = v2.m;
  const legs: [string, number, number, string, string][] = [
    [v1.v, 1, 1, 'e-', 'in1'],
    [v1.v, 1, 4, 'e+', 'in2'],
    [v2.v, 7, 1, 'mu-', 'out1'],
    [v2.v, 7, 4, 'mu+', 'out2'],
  ];
  for (const [v, x, y, p] of legs) {
    const r = ok(addExternalLeg(m, v, x, y));
    m = setParticle(r.m, r.v, p);
  }
  const prop = ok(addEdge(m, v1.v, v2.v));
  m = setParticle(prop.m, prop.v, 'gamma');
  return m;
}

describe('editor model', () => {
  it('snaps to the grid and clamps to the canvas', () => {
    expect(snap(1.26)).toBe(1.5);
    expect(snap(1.2)).toBe(1);
    const r = ok(addVertex(emptyModel(), 99, -5));
    expect(r.m.nodes[0]).toMatchObject({ x: 8, y: 0 });
  });

  it('refuses to stack things and respects limits', () => {
    const a = ok(addVertex(emptyModel(), 2, 2));
    expect(addVertex(a.m, 2.1, 2.1).ok).toBe(false);
    let m = emptyModel();
    for (let i = 0; i < LIMITS.vertices; i++) m = ok(addVertex(m, (i % 8) + 0, Math.floor(i / 8) * 2)).m;
    expect(addVertex(m, 4.5, 4.5).ok).toBe(false);
  });

  it('edges connect two distinct vertices only', () => {
    const a = ok(addVertex(emptyModel(), 1, 1));
    const b = ok(addVertex(a.m, 3, 1));
    expect(addEdge(b.m, a.v, a.v).ok).toBe(false);
    expect(addEdge(b.m, a.v, 'nope').ok).toBe(false);
    expect(addEdge(b.m, a.v, b.v).ok).toBe(true);
    const leg = ok(addExternalLeg(b.m, a.v, 0, 1));
    expect(leg.m.nodes.filter((n) => n.kind === 'external')).toHaveLength(1);
    expect(addEdge(leg.m, a.v, b.m.nodes.find((n) => n.kind === 'external')?.id ?? 'x').ok).toBe(false);
  });

  it('moving snaps, clamps and cannot land on another node', () => {
    const a = ok(addVertex(emptyModel(), 1, 1));
    const b = ok(addVertex(a.m, 3, 1));
    expect(moveNode(b.m, b.v, 1.1, 1.1).ok).toBe(false);
    const mv = ok(moveNode(b.m, b.v, 4.74, 2.2));
    expect(mv.m.nodes.find((n) => n.id === b.v)).toMatchObject({ x: 4.5, y: 2 });
  });

  it('deleting a vertex removes its lines and orphaned external points', () => {
    const m = buildEEMuMu();
    const v1 = m.nodes.find((n) => n.kind === 'vertex')!;
    const after = deleteNode(m, v1.id);
    expect(after.nodes.filter((n) => n.kind === 'vertex')).toHaveLength(1);
    // the 2 legs of v1 and their external points are gone
    expect(after.nodes.filter((n) => n.kind === 'external')).toHaveLength(2);
    expect(after.edges).toHaveLength(2);
    // deleting a leg removes its external point
    const leg = m.edges.find((e) => m.nodes.find((n) => n.id === e.b)?.kind === 'external')!;
    const d2 = deleteEdge(m, leg.id);
    expect(d2.nodes.filter((n) => n.kind === 'external')).toHaveLength(3);
  });

  it('does not mutate the previous model (undo relies on this)', () => {
    const a = ok(addVertex(emptyModel(), 1, 1));
    const snapshot = JSON.stringify(a.m);
    const b = ok(addVertex(a.m, 3, 1));
    toggleHidden(b.m, 'nothing');
    expect(JSON.stringify(a.m)).toBe(snapshot);
  });

  it('truncates title and message', () => {
    const m = setText(emptyModel(), 'x'.repeat(500), 'y'.repeat(900));
    expect(m.title.length).toBe(LIMITS.title);
    expect(m.message.length).toBe(LIMITS.message);
  });
});

describe('physical labels vs arrows (toDiagram)', () => {
  const m = buildEEMuMu();
  const d = toDiagram(m);
  const physical = (edgeId: string) => {
    const e = d.edges.find((q) => q.id === edgeId)!;
    return physicalParticle(d, e);
  };

  it('shows exactly the physical particles the user picked', () => {
    for (const e of m.edges) expect(physical(e.id), e.id).toBe(e.p);
  });

  it('draws antifermion arrows backward in time and stores the antiparticle', () => {
    const positron = m.edges.find((e) => e.p === 'e+')!;
    const de = d.edges.find((e) => e.id === positron.id)!;
    expect(de.particle).toBe('e-'); // stored along the (backward) arrow
    const from = d.nodes.find((n) => n.id === de.from)!;
    const to = d.nodes.find((n) => n.id === de.to)!;
    expect(to.x).toBeLessThan(from.x); // arrow points toward earlier time
    const electron = m.edges.find((e) => e.p === 'e-')!;
    const dn = d.edges.find((e) => e.id === electron.id)!;
    expect(d.nodes.find((n) => n.id === dn.to)!.x).toBeGreaterThan(d.nodes.find((n) => n.id === dn.from)!.x);
  });

  it('builds a valid Standard Model diagram', () => {
    expect(validateDiagram(d).valid).toBe(true);
  });

  it('keeps meaning when a vertex is dragged past another in time', () => {
    // swapping which end is earlier must not change the physical label of any line
    const v = m.nodes.filter((n) => n.kind === 'vertex');
    let moved = ok(moveNode(m, v[0].id, 8, 2.5)).m; // vertex 1 now to the right of vertex 2
    moved = ok(moveNode(moved, v[1].id, 2, 2.5)).m;
    const d2 = toDiagram(moved);
    for (const e of moved.edges) {
      const de = d2.edges.find((q) => q.id === e.id)!;
      expect(physicalParticle(d2, de), e.id).toBe(e.p);
    }
  });

  it('vertical lines keep the drawn direction and the picked label', () => {
    let mm = ok(addVertex(emptyModel(), 3, 1)).m;
    const a = mm.nodes[0].id;
    mm = ok(addVertex(mm, 3, 3.5)).m;
    const b = mm.nodes[1].id;
    const e = ok(addEdge(mm, a, b));
    const withP = setParticle(e.m, e.v, 'e+');
    const dd = toDiagram(withP);
    expect(physicalParticle(dd, dd.edges[0])).toBe('e+');
  });

  it('unassigned lines stay null', () => {
    const a = ok(addVertex(emptyModel(), 1, 1));
    const b = ok(addVertex(a.m, 3, 1));
    const e = ok(addEdge(b.m, a.v, b.v));
    expect(toDiagram(e.m).edges[0].particle).toBeNull();
  });
});

describe('library round trip through the editor model', () => {
  // decays with hadron groups need the editor's hadron support (see the hadron editor tests)
  for (const entry of LIBRARY.filter((e) => !e.diagram.hadrons?.length)) {
    it(entry.id, () => {
      const hidden = entry.hideSets?.[0] ?? [];
      const m = modelFromDiagram(entry.diagram, hidden);
      const d = toDiagram(m);
      expect(validateDiagram(d).issues).toEqual([]);
      expect(validateDiagram(d).valid).toBe(true);
      // every line keeps its physical particle
      entry.diagram.edges.forEach((e, i) => {
        expect(m.edges[i].p).toBe(physicalParticle(entry.diagram, e));
        const de = d.edges.find((q) => q.id === m.edges[i].id)!;
        expect(physicalParticle(d, de)).toBe(m.edges[i].p);
      });
      expect(hiddenIds(m)).toHaveLength(hidden.length);
      // layout fits the canvas
      for (const n of m.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x).toBeLessThanOrEqual(8);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeLessThanOrEqual(5);
      }
      // and it is shareable as is
      const rep = checkModel(m);
      expect(rep.errors).toEqual([]);
      expect(rep.ok).toBe(true);
    });
  }
});

describe('checks', () => {
  it('guides an empty canvas', () => {
    const r = checkModel(emptyModel());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/vertex/i);
  });

  it('asks for particles, then explains violations per vertex', () => {
    let m = buildEEMuMu();
    m = setParticle(m, m.edges[0].id, null);
    expect(checkModel(m).errors.join(' ')).toMatch(/still needs a particle/);
    m = setParticle(m, m.edges[0].id, 'mu-'); // an electron leg replaced by a muon: lepton flavor violation
    const r = checkModel(m);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Vertex 1: .*lepton number/i.test(e))).toBe(true);
  });

  it('requires at least one hidden line, then accepts', () => {
    const m = buildEEMuMu();
    const r = checkModel(m);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Hide at least one/);
    const prop = m.edges.find((e) => e.p === 'gamma')!;
    const ready = checkModel(toggleHidden(m, prop.id));
    expect(ready.errors).toEqual([]);
    expect(ready.ok).toBe(true);
    expect(ready.solutions).toBe(3); // gamma, Z or H
  });

  it('rejects hidden external legs whose particle is not forced (the process could change)', () => {
    const m = buildEEMuMu();
    const mu = m.edges.filter((e) => e.p === 'mu-' || e.p === 'mu+');
    const r = checkModel(toggleHidden(toggleHidden(m, mu[0].id), mu[1].id));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/more than one particle/);
  });

  it('accepts a hidden external that IS forced', () => {
    const m = buildEEMuMu();
    const amu = m.edges.find((e) => e.p === 'mu+')!;
    expect(checkModel(toggleHidden(m, amu.id)).ok).toBe(true);
  });

  it('flags disconnected diagrams and wrong vertex degree', () => {
    let m = buildEEMuMu();
    m = ok(addVertex(m, 4, 4.5)).m; // floating vertex
    const r = checkModel(m);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/connected/);
    expect(r.errors.join(' ')).toMatch(/3 or 4 lines/);
  });
});

describe('share codec', () => {
  const entry = findProcess('beta-minus')!;
  const data = {
    title: 'Beta test',
    message: 'Which line is the W?',
    diagram: entry.diagram,
    hidden: ['W'],
  };

  it('round-trips', () => {
    const enc = encodeShared(data);
    const dec = decodeShared(enc);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    expect(dec.data.title).toBe('Beta test');
    expect(dec.data.message).toBe('Which line is the W?');
    expect(dec.data.hidden).toEqual(['W']);
    expect(dec.data.diagram.edges.map((e) => [e.id, e.from, e.to, e.particle])).toEqual(
      entry.diagram.edges.map((e) => [e.id, e.from, e.to, e.particle]),
    );
    expect(dec.data.diagram.nodes).toEqual(entry.diagram.nodes);
  });

  it('is URL-safe, compact, and stable (same puzzle => same key)', () => {
    const enc = encodeShared(data);
    expect(enc).toMatch(/^[A-Za-z0-9+\-$]+$/);
    const url = shareUrl(data, 'https://example.test/app/');
    expect(url.startsWith(`https://example.test/app/${HASH_PREFIX}`)).toBe(true);
    for (const e of LIBRARY) {
      const u = shareUrl({ title: '', message: '', diagram: e.diagram, hidden: e.hideSets![0] }, 'https://x.test/');
      expect(u.length, e.id).toBeLessThan(2000);
    }
    const a = decodeShared(enc);
    const b = decodeShared(encodeShared({ ...data }));
    expect(a.ok && b.ok && a.key === b.key).toBe(true);
  });

  it('produces a playable puzzle whose reference answer wins', () => {
    const dec = decodeShared(encodeShared(data));
    if (!dec.ok) throw new Error(dec.error);
    const p = puzzleFromShared(dec.data, dec.key);
    expect(p.hidden).toEqual(['W']);
    expect(p.title).toBe('Beta test');
    expect(p.kind).toBe('fill');
    expect(p.explanation).toMatch(/weak charged-current/);
    expect(evaluate(p, solutionOf(p)).correct).toBe(true);
    const g = submit(p, { ...newGame(p), answers: { W: 'W-' } });
    expect(g.status).toBe('won');
    expect(submit(p, { ...newGame(p), answers: { W: 'W+' } }).status).toBe('playing');
  });

  it('classifies all-external hides as the "external" kind', () => {
    const dec = decodeShared(encodeShared({ ...data, hidden: ['nubar'] }));
    if (!dec.ok) throw new Error(dec.error);
    expect(puzzleFromShared(dec.data, dec.key).kind).toBe('external');
  });

  const pack = (obj: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(obj));
  const good = () => JSON.parse(LZString.decompressFromEncodedURIComponent(encodeShared(data))!);

  it('rejects garbage, truncation and wrong versions without throwing', () => {
    const enc = encodeShared(data);
    for (const bad of ['', 'x', '!!!!', enc.slice(0, 20), 'A'.repeat(20000)]) {
      const r = decodeShared(bad);
      expect(r.ok, bad.slice(0, 10)).toBe(false);
    }
    expect(decodeShared(pack({ ...good(), v: 2 })).ok).toBe(false);
    expect(decodeShared(pack(null)).ok).toBe(false);
    expect(decodeShared(pack([1, 2, 3])).ok).toBe(false);
  });

  it('rejects structurally broken or hostile content', () => {
    const g = good();
    const mutate = (f: (x: any) => void) => {
      const x = JSON.parse(JSON.stringify(g));
      f(x);
      return decodeShared(pack(x));
    };
    expect(mutate((x) => (x.e[0][3] = 'not-a-particle'))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.e[0][1] = 'ghost'))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.e[0][2] = x.e[0][1]))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.h = ['nope']))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.h = []))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.h = ['W', 'W']))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.n[0][2] = 1e9))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.n[0][2] = 'a'))).toMatchObject({ ok: false });
    expect(mutate((x) => x.n.push(x.n[0]))).toMatchObject({ ok: false }); // duplicate node id
    expect(mutate((x) => (x.e = new Array(200).fill(x.e[0])))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.e[0][3] = 'mu-'))).toMatchObject({ ok: false }); // breaks conservation
    expect(mutate((x) => (x.__proto__ = { polluted: true }))).toMatchObject({ ok: true }); // harmless extra key
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps hostile title text as plain data (it is escaped when rendered) and truncates it', () => {
    const evil = '<img src=x onerror=alert(1)>'.repeat(10);
    const dec = decodeShared(encodeShared({ ...data, title: evil, message: evil }));
    if (!dec.ok) throw new Error(dec.error);
    expect(dec.data.title.length).toBeLessThanOrEqual(LIMITS.title);
    expect(dec.data.message.length).toBeLessThanOrEqual(LIMITS.message);
  });

  it('never throws on random input', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 300; i++) {
      const len = Math.floor(rnd() * 200);
      let s = '';
      for (let j = 0; j < len; j++) s += 'ABCDEFabcdef0123456789+-$'[Math.floor(rnd() * 25)];
      expect(() => decodeShared(s)).not.toThrow();
    }
  });

  it('estimates difficulty in range and describes the interactions used', () => {
    for (const e of LIBRARY) {
      const d = estimateDifficulty(e.diagram);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(7);
      expect(describeDiagram(e.diagram)).toMatch(/interactions/);
    }
    expect(estimateDifficulty(findProcess('dec-z-mumu')!.diagram)).toBeLessThan(estimateDifficulty(findProcess('kaon-box')!.diagram));
  });
});

describe('draft sanitizing', () => {
  it('accepts a real model and rejects junk', () => {
    const m = buildEEMuMu();
    expect(sanitizeModel(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(sanitizeModel(null)).toEqual(emptyModel());
    expect(sanitizeModel({ nodes: 'x', edges: [] })).toEqual(emptyModel());
    const bad = JSON.parse(JSON.stringify(m));
    bad.edges[0].p = 'bogus';
    expect(sanitizeModel(bad)).toEqual(emptyModel());
    const dangling = JSON.parse(JSON.stringify(m));
    dangling.edges[0].a = 'ghost';
    expect(sanitizeModel(dangling)).toEqual(emptyModel());
  });
});
