import { describe, expect, it } from 'vitest';
import { parseProcess, type RawProcess } from '../src/puzzle/loader';
import { buildScene } from '../src/render/scene';
import { renderDiagram } from '../src/render/svg';
import { buildEdgeViews, buildGroupViews } from '../src/render/view';

/** φ → K⁻ K⁺ at the quark level (s emits a gluon that makes u ū). */
const phi: RawProcess = {
  id: 'phi', name: 'phi', difficulty: 3, explanation: 'x',
  vertices: { v1: [1, -0.25], v2: [2, 0] },
  externals: { a: [0, -0.25], b: [0, 0.25], o1a: [3, -1.2], o1b: [3, -0.7], o2a: [3, 0.7], o2b: [3, 1.2] },
  legs: [
    ['q1', 'in', 'a', 'v1', 's'],
    ['q1o', 'out', 'o1a', 'v1', 's'],
    ['sb', 'out', 'o1b', 'v2', 'ubar'],
    ['sq', 'out', 'o2a', 'v2', 'u'],
  ],
  spectators: [['q2', 'b', 'o2b', 'sbar']],
  edges: [['glu', 'v1', 'v2', 'g']],
  hadrons: [
    ['P', 'phi', 'in', ['a', 'b']],
    ['M1', 'K-', 'out', ['o1a', 'o1b']],
    ['M2', 'K+', 'out', ['o2a', 'o2b']],
  ],
};
const d = parseProcess(phi).diagram;
// quark-bar symbols are a letter plus a combining overline
const ubar = 'ū';
const sbar = 's̄';

describe('hadron rendering', () => {
  it('draws one outline per hadron with the hadron symbol and one label per quark line', () => {
    const scene = buildScene(d, buildEdgeViews(d), { groupViews: buildGroupViews(d) });
    expect(scene.groups.map((g) => g.id)).toEqual(['P', 'M1', 'M2']);
    const by = Object.fromEntries(scene.groups.map((g) => [g.id, g]));
    expect(by.P.label.text).toBe('φ');
    expect(by.M1.label.text).toBe('K⁻');
    expect(by.M2.label.text).toBe('K⁺');
    // PHYSICAL quark labels: the spectator antiquark is s̄ on both ends, the out-going ū shows as ū
    expect(by.P.quarks.map((q) => q.text)).toEqual(['s', sbar]);
    expect(by.M1.quarks.map((q) => q.text)).toEqual(['s', ubar]);
    expect(by.M2.quarks.map((q) => q.text)).toEqual(['u', sbar]);
  });

  it('puts incoming hadrons on the left (text anchored end) and outgoing on the right', () => {
    const scene = buildScene(d, buildEdgeViews(d), { groupViews: buildGroupViews(d) });
    const by = Object.fromEntries(scene.groups.map((g) => [g.id, g]));
    expect(by.P.label.anchor).toBe('end');
    expect(by.P.label.x).toBeLessThan(by.P.x);
    expect(by.M1.label.anchor).toBe('start');
    expect(by.M1.label.x).toBeGreaterThan(by.M1.x + by.M1.w);
    // every label stays inside the viewBox, also with the extra horizontal padding
    for (const g of scene.groups) {
      expect(g.label.x).toBeGreaterThan(0);
      expect(g.label.x).toBeLessThan(scene.width);
    }
  });

  it('quark legs are labelled by their group, not by a stray edge label', () => {
    const svg = renderDiagram(d, { revealKinds: true });
    expect(svg).toContain('class="hpill');
    expect(svg).toContain('class="hlabel');
    expect(svg).toContain('class="qlabel');
    // the only per-edge labels left are for the gluon
    const edgeLabels = svg.match(/<text class="label /g) ?? [];
    expect(edgeLabels).toHaveLength(1);
  });

  it('a spectator quark runs straight from the incoming to the outgoing hadron', () => {
    const scene = buildScene(d, buildEdgeViews(d), { groupViews: buildGroupViews(d) });
    expect(scene.edges.find((e) => e.id === 'q2')).toBeDefined();
    expect(scene.edges).toHaveLength(d.edges.length);
  });

  it('hidden hadrons show ? and leak neither the hadron nor its quarks', () => {
    const svg = renderDiagram(d, { hiddenGroups: ['M1', 'M2'] });
    expect(svg).not.toContain('K⁻');
    expect(svg).not.toContain('K⁺');
    expect(svg).not.toContain(ubar); // outgoing quarks of the hidden hadrons
    expect(svg).toContain('φ'); // the parent is still visible
    expect(svg).toContain('data-group-hit="M1"');
    expect(svg).toContain('data-group-hit="M2"');
    // hidden outlines are keyboard focusable, shown ones are not
    const hit = (id: string) => svg.match(new RegExp(`<rect class="ghit"[^>]*data-group-hit="${id}"[^>]*/>`))![0];
    expect(hit('M1')).toContain('tabindex="0"');
    expect(hit('P')).not.toContain('tabindex');
  });

  it('shows the player\'s hadron choice on the outline while the quark legs stay "?"', () => {
    const svg = renderDiagram(d, {
      hiddenGroups: ['M1', 'M2'],
      groupAnswers: { M2: 'K+' },
      groupStates: { M1: 'selected' },
    });
    expect(svg).toContain('K⁺');
    expect(svg).not.toContain('K⁻');
    expect(svg).toContain('hpill s-selected');
    expect(svg).toContain('hpill s-filled');
    const views = buildEdgeViews(d, { hiddenGroups: ['M1', 'M2'] });
    expect(views.q1o.label).toBe('?');
    expect(views.q1o.kind).toBe('unknown');
    expect(views.q1.label).toBe('s'); // legs of the visible parent keep their labels
  });

  it('diagrams without hadrons are unchanged (no outlines, normal padding)', () => {
    const plain = parseProcess({
      id: 'p', name: 'p', difficulty: 1, explanation: 'x',
      vertices: { v: [1, 0] }, externals: { a: [0, 0], c: [2, -1], e: [2, 1] },
      legs: [['z', 'in', 'a', 'v', 'Z'], ['m', 'out', 'c', 'v', 'mu-'], ['am', 'out', 'e', 'v', 'mu+']],
    }).diagram;
    const scene = buildScene(plain, buildEdgeViews(plain));
    expect(scene.groups).toEqual([]);
    expect(renderDiagram(plain)).not.toContain('hpill s-');
  });
});
