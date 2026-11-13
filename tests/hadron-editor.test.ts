import LZString from 'lz-string';
import { describe, expect, it } from 'vitest';
import { checkModel } from '../src/editor/checks';
import {
  addEdge,
  addExternalLeg,
  addGroup,
  addVertex,
  deleteNode,
  emptyModel,
  groupOfNode,
  hiddenGroupIds,
  LIMITS,
  moveNode,
  quarkOf,
  sanitizeModel,
  setGroupComponent,
  setParticle,
  toDiagram,
  toggleGroupHidden,
  toggleHidden,
  type EditorModel,
  type Result,
} from '../src/editor/model';
import { decodeShared, encodeShared, puzzleFromShared } from '../src/editor/share';
import { validateFull } from '../src/engine/decays';
import { evaluate, solutionGroups } from '../src/game/state';

function ok<T>(r: Result<T>): { m: EditorModel; v: T } {
  if (!r.ok) throw new Error(r.error);
  return { m: r.model, v: r.value };
}

/** K⁺ → μ⁺ ν_μ built by hand: K⁺ at the left, W⁺ between two vertices, two leptons. */
function buildKaon(): { m: EditorModel; k: string; w: string } {
  let m = emptyModel();
  const v1 = ok(addVertex(m, 3, 2.5));
  m = v1.m;
  const v2 = ok(addVertex(m, 5, 2.5));
  m = v2.m;
  const g = ok(addGroup(m, 'K+', 0, 1, 2.5));
  m = g.m;
  const grp = m.groups.find((q) => q.id === g.v)!;
  m = ok(addEdge(m, v1.v, grp.nodes[0])).m; // u
  m = ok(addEdge(m, v1.v, grp.nodes[1])).m; // s̄
  const w = ok(addEdge(m, v1.v, v2.v));
  m = setParticle(w.m, w.v, 'W+');
  const l = ok(addExternalLeg(m, v2.v, 7, 1.5));
  m = setParticle(l.m, l.v, 'mu+');
  const n = ok(addExternalLeg(m, v2.v, 7, 3.5));
  m = setParticle(n.m, n.v, 'nu_mu');
  return { m, k: g.v, w: w.v };
}

describe('editor: placing hadrons', () => {
  it('a hadron is a stack of external points, one per quark', () => {
    const { m, v } = ok(addGroup(emptyModel(), 'p', 0, 1, 2));
    const g = m.groups.find((q) => q.id === v)!;
    expect(g.nodes).toHaveLength(3);
    const pts = g.nodes.map((id) => m.nodes.find((n) => n.id === id)!);
    expect(new Set(pts.map((p) => p.x)).size).toBe(1);
    expect(pts.map((p) => p.y)).toEqual([1.5, 2, 2.5]);
    expect(pts.every((p) => p.kind === 'external')).toBe(true);
    expect(ok(addGroup(emptyModel(), 'pi+', 0, 1, 2)).m.nodes).toHaveLength(2);
  });

  it('stays inside the canvas and refuses to overlap', () => {
    const top = ok(addGroup(emptyModel(), 'p', 0, 1, 0)).m;
    expect(Math.min(...top.nodes.map((n) => n.y))).toBe(0);
    const bottom = ok(addGroup(emptyModel(), 'p', 0, 1, 5)).m;
    expect(Math.max(...bottom.nodes.map((n) => n.y))).toBe(5);
    expect(addGroup(top, 'pi+', 0, 1, 0).ok).toBe(false);
  });

  it('enforces the size limits and unknown hadrons', () => {
    expect(addGroup(emptyModel(), 'nope', 0, 1, 1).ok).toBe(false);
    let m = emptyModel();
    for (let i = 0; i < LIMITS.groups; i++) m = ok(addGroup(m, 'pi+', 0, i % 8, i < 4 ? 0 : 3)).m;
    expect(addGroup(m, 'pi+', 0, 7, 5).ok).toBe(false);
  });

  it('a line to a quark point already carries that quark; a hadron counts as incoming or outgoing by position', () => {
    const { m, k } = buildKaon();
    const g = m.groups.find((q) => q.id === k)!;
    const d = toDiagram(m);
    expect(d.hadrons).toEqual([{ id: k, hadron: 'K+', side: 'in', nodes: g.nodes }]);
    const legs = g.nodes.map((nid) => m.edges.find((e) => e.a === nid || e.b === nid)!);
    expect(legs.map((e) => e.p)).toEqual(['u', 'sbar']);
    expect(quarkOf(g, g.nodes[1])).toBe('sbar');
  });

  it('rejects bad connections with a helpful message', () => {
    const { m, k } = buildKaon();
    const g = m.groups.find((q) => q.id === k)!;
    const v1 = m.nodes.find((n) => n.kind === 'vertex')!.id;
    const again = addEdge(m, v1, g.nodes[0]);
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toMatch(/already connected/);
    const second = ok(addGroup(m, 'pi+', 0, 1, 0.5));
    const inGroup = second.m.groups.find((q) => q.id === second.v)!;
    expect(addEdge(second.m, inGroup.nodes[0], inGroup.nodes[1]).ok).toBe(false); // same hadron
    expect(addEdge(second.m, inGroup.nodes[0], g.nodes[0]).ok).toBe(false); // both incoming, and a point is taken
  });

  it('a spectator quark joins an incoming and an outgoing hadron', () => {
    let m = ok(addGroup(emptyModel(), 'K+', 0, 1, 2)).m;
    m = ok(addGroup(m, 'pi0', 0, 7, 2)).m;
    const [a, b] = m.groups;
    const e = ok(addEdge(m, a.nodes[1], b.nodes[0]));
    expect(e.m.edges.find((q) => q.id === e.v)!.p).toBe('sbar'); // the incoming hadron's quark
    expect(addEdge(m, b.nodes[0], a.nodes[1]).ok).toBe(true); // order of the drag does not matter
    const same = ok(addGroup(emptyModel(), 'pi+', 0, 1, 1));
    const same2 = ok(addGroup(same.m, 'pi-', 0, 1, 3));
    const [c, d] = same2.m.groups;
    expect(addEdge(same2.m, c.nodes[0], d.nodes[0]).ok).toBe(false); // two incoming hadrons
  });
});

describe('editor: editing hadrons', () => {
  it('moves as one block, deletes as one block, and keeps its points when a line is removed', () => {
    const { m, k } = buildKaon();
    const g = m.groups.find((q) => q.id === k)!;
    const before = g.nodes.map((id) => m.nodes.find((n) => n.id === id)!);
    const moved = ok(moveNode(m, g.nodes[0], before[0].x + 1, before[0].y - 1)).m;
    const after = g.nodes.map((id) => moved.nodes.find((n) => n.id === id)!);
    expect(after.map((n) => n.x)).toEqual(before.map((n) => n.x + 1));
    expect(after.map((n) => n.y)).toEqual(before.map((n) => n.y - 1));
    const gone = deleteNode(m, g.nodes[1]);
    expect(gone.groups).toHaveLength(0);
    expect(gone.nodes.some((n) => g.nodes.includes(n.id))).toBe(false);
    expect(gone.edges.every((e) => !g.nodes.includes(e.a) && !g.nodes.includes(e.b))).toBe(true);
  });

  it('the quark lines of a hadron cannot be hidden one by one, but the hadron can', () => {
    const { m, k } = buildKaon();
    const g = m.groups.find((q) => q.id === k)!;
    const leg = m.edges.find((e) => e.a === g.nodes[0] || e.b === g.nodes[0])!;
    expect(toggleHidden(m, leg.id)).toBe(m);
    expect(hiddenGroupIds(toggleGroupHidden(m, k))).toEqual([k]);
  });

  it('choosing another component of a mixed state relabels the attached quark lines', () => {
    let m = emptyModel();
    const v = ok(addVertex(m, 3, 2.5));
    m = v.m;
    const g = ok(addGroup(m, 'pi0', 0, 1, 2.5));
    m = g.m;
    const grp = m.groups[0];
    m = ok(addEdge(m, v.v, grp.nodes[0])).m;
    expect(m.edges[0].p).toBe('u');
    m = setGroupComponent(m, g.v, 1);
    expect(m.edges[0].p).toBe('d');
    expect(groupOfNode(m, grp.nodes[1])?.comp).toBe(1);
  });
});

describe('editor: checks, sharing and play', () => {
  it('guides the user until the diagram is valid', () => {
    let { m } = buildKaon();
    const r0 = checkModel(m);
    expect(r0.ok).toBe(false);
    expect(r0.errors[0]).toMatch(/Hide at least one/); // everything else is fine
    // a hadron left unconnected gets a friendly message instead of "external point x3"
    const extra = ok(addGroup(m, 'pi-', 0, 7, 0.5));
    const r1 = checkModel(extra.m);
    expect(r1.errors.join(' ')).toMatch(/quark lines? not connected yet/);
    expect(r1.errors.join(' ')).not.toMatch(/External point/);
    // wrong particle on a quark line: the hadron no longer matches
    const g = m.groups[0];
    const leg = m.edges.find((e) => e.a === g.nodes[0] || e.b === g.nodes[0])!;
    m = setParticle(m, leg.id, 'c');
    expect(checkModel(m).errors.join(' ')).toMatch(/vertex|do not make a K/i);
  });

  it('a hidden hadron must be forced to one particle: hiding the K⁺ here is ambiguous (K*⁺ fits too)', () => {
    const { m, k } = buildKaon();
    const r = checkModel(toggleGroupHidden(m, k));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/could be more than one particle/);
  });

  it('hiding the W (and nothing else) is fine, and the puzzle round-trips through a share link', () => {
    const { m, w } = buildKaon();
    const r = checkModel(toggleHidden(m, w));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    const data = { title: 'Kaon', message: '', diagram: r.diagram, hidden: [w] };
    const dec = decodeShared(encodeShared(data));
    if (!dec.ok) throw new Error(dec.error);
    expect(dec.data.diagram.hadrons).toEqual(r.diagram.hadrons);
    expect(dec.data.hidden).toEqual([w]);
    expect(dec.data.hiddenGroups).toEqual([]);
  });
});

describe('share format v2', () => {
  const kaon = () => {
    const { m, w } = buildKaon();
    const r = checkModel(toggleHidden(m, w));
    return { diagram: r.diagram, w };
  };
  const pack = (obj: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(obj));
  const raw = () => {
    const { diagram, w } = kaon();
    return JSON.parse(LZString.decompressFromEncodedURIComponent(encodeShared({ title: '', message: '', diagram, hidden: [w] }))!);
  };

  it('uses v2 only when there are hadrons', () => {
    expect(raw().v).toBe(2);
    expect(raw().g).toHaveLength(1);
    const plain = JSON.parse(
      LZString.decompressFromEncodedURIComponent(
        encodeShared({ title: '', message: '', diagram: { nodes: [], edges: [] }, hidden: [] }),
      )!,
    );
    expect(plain.v).toBe(1);
  });

  it('rejects broken or hostile hadron data', () => {
    const mutate = (f: (x: any) => void) => {
      const x = raw();
      f(x);
      return decodeShared(pack(x));
    };
    expect(mutate(() => {})).toMatchObject({ ok: true });
    expect(mutate((x) => (x.g[0][1] = 'not-a-hadron'))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.g[0][3] = ['ghost', 'ghost2']))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.g[0][3] = [x.g[0][3][0], x.g[0][3][0]]))).toMatchObject({ ok: false });
    expect(mutate((x) => (x.g[0][1] = 'p'))).toMatchObject({ ok: false }); // 3 quarks needed, 2 given
    expect(mutate((x) => (x.g[0][1] = 'pi+'))).toMatchObject({ ok: false }); // wrong quark content
    expect(mutate((x) => (x.g[0][2] = 'o'))).toMatchObject({ ok: false }); // quark lines point the wrong way
    expect(mutate((x) => (x.hg = ['nope']))).toMatchObject({ ok: false });
    expect(mutate((x) => delete x.g)).toMatchObject({ ok: false });
    expect(mutate((x) => (x.g = new Array(20).fill(x.g[0])))).toMatchObject({ ok: false });
  });

  it('a library decay with a hidden hadron round-trips and plays', async () => {
    const { findProcess } = await import('../src/puzzle/library');
    const e = findProcess('dec-ks-pipi')!;
    const data = { title: '', message: '', diagram: e.diagram, hidden: [] as string[], hiddenGroups: ['PiP'] };
    const dec = decodeShared(encodeShared(data));
    if (!dec.ok) throw new Error(dec.error);
    expect(dec.data.hiddenGroups).toEqual(['PiP']);
    const p = puzzleFromShared(dec.data, dec.key);
    expect(p.hiddenGroups).toEqual(['PiP']);
    expect(evaluate(p, {}, solutionGroups(p)).correct).toBe(true);
    expect(evaluate(p, {}, { PiP: 'rho+' }).correct).toBe(false);
    expect(validateFull(dec.data.diagram).valid).toBe(true);
  });
});

describe('draft sanitizing with hadrons', () => {
  it('round-trips a model with a hadron and rejects a corrupted one', () => {
    const { m } = buildKaon();
    expect(sanitizeModel(JSON.parse(JSON.stringify(m)))).toEqual(m);
    const bad = JSON.parse(JSON.stringify(m));
    bad.groups[0].hadron = 'bogus';
    expect(sanitizeModel(bad)).toEqual(emptyModel());
    const dup = JSON.parse(JSON.stringify(m));
    dup.groups.push({ ...dup.groups[0], id: 'g99' });
    expect(sanitizeModel(dup)).toEqual(emptyModel());
    const old = JSON.parse(JSON.stringify(m));
    delete old.groups; // drafts saved before hadrons existed
    expect(sanitizeModel(old).groups).toEqual([]);
  });
});
