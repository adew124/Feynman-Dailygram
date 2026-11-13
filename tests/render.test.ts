import { describe, expect, it } from 'vitest';
import { EXAMPLES, kaonBox, penguinBtoSGamma, eeToQQg } from '../src/demo/examples';
import { validateDiagram } from '../src/engine/validator';
import { makeCurve } from '../src/render/geometry';
import { curlyPath, wavyPath } from '../src/render/lines';
import { buildScene, edgeBends } from '../src/render/scene';
import { renderDiagram, symbolToTspans } from '../src/render/svg';
import { buildEdgeViews, lineKindForParticle } from '../src/render/view';
import { betaDecay, eeToMuMu } from './fixtures';

describe('demo examples are physically valid', () => {
  for (const ex of EXAMPLES) {
    it(ex.title, () => {
      const r = validateDiagram(ex.diagram);
      expect(r.issues).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});

describe('line kinds', () => {
  it('maps particles to conventional line styles', () => {
    expect(lineKindForParticle('e-')).toBe('fermion');
    expect(lineKindForParticle('tbar')).toBe('fermion');
    expect(lineKindForParticle('anti_nu_mu')).toBe('fermion');
    expect(lineKindForParticle('gamma')).toBe('photon');
    expect(lineKindForParticle('Z')).toBe('photon');
    expect(lineKindForParticle('W-')).toBe('photon');
    expect(lineKindForParticle('g')).toBe('gluon');
    expect(lineKindForParticle('H')).toBe('higgs');
  });
});

describe('edge views use PHYSICAL labels', () => {
  it('shows e+ for the incoming positron leg and mu+ for the outgoing antimuon', () => {
    const v = buildEdgeViews(eeToMuMu());
    expect(v.e_in.label).toBe('e⁻');
    expect(v.p_in.label).toBe('e⁺');
    expect(v.mu_out.label).toBe('μ⁻');
    expect(v.amu_out.label).toBe('μ⁺');
  });

  it('shows an antineutrino on the backward-arrow neutrino leg', () => {
    const v = buildEdgeViews(betaDecay());
    expect(v.nubar.label).toBe('ν̄_e');
  });

  it('hidden edges show ? until answered; answers use the same orientation rule', () => {
    const d = betaDecay();
    let v = buildEdgeViews(d, { hidden: ['nubar'] });
    expect(v.nubar.label).toBe('?');
    expect(v.nubar.state).toBe('empty');
    expect(v.nubar.kind).toBe('unknown');
    // stored nu_e on a backward arrow displays as anti-nu_e
    v = buildEdgeViews(d, { hidden: ['nubar'], answers: { nubar: 'nu_e' } });
    expect(v.nubar.label).toBe('ν̄_e');
    expect(v.nubar.state).toBe('filled');
  });

  it('revealKinds keeps the true line style on hidden edges', () => {
    const v = buildEdgeViews(betaDecay(), { hidden: ['W'], revealKinds: true });
    expect(v.W.kind).toBe('photon');
    expect(v.W.label).toBe('?');
  });

  it('selection and result states apply to hidden edges only', () => {
    const d = betaDecay();
    const v = buildEdgeViews(d, { hidden: ['W', 'nubar'], selected: 'W', wrong: ['nubar'] });
    expect(v.W.state).toBe('selected');
    expect(v.nubar.state).toBe('wrong');
    expect(v.d.state).toBe('normal');
  });
});

describe('geometry', () => {
  it('wavy and curly paths start and end exactly on the endpoints', () => {
    for (const bend of [0, 18]) {
      const c = makeCurve({ x: 10, y: 20 }, { x: 150, y: 90 }, bend);
      for (const d of [wavyPath(c), curlyPath(c)]) {
        const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        expect(nums[0]).toBeCloseTo(10, 0);
        expect(nums[1]).toBeCloseTo(20, 0);
        expect(nums[nums.length - 2]).toBeCloseTo(150, 0);
        expect(nums[nums.length - 1]).toBeCloseTo(90, 0);
      }
    }
  });

  it('bent curves are longer than the chord', () => {
    const a = makeCurve({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    const b = makeCurve({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);
    expect(b.length).toBeGreaterThan(a.length);
    expect(a.length).toBeCloseTo(100);
  });

  it('parallel edges are fanned apart automatically', () => {
    const d = kaonBox();
    d.edges.push({ id: 'extra', from: 'v1', to: 'v2', particle: 'u' }); // second v1-v2 edge
    const bends = edgeBends(d);
    expect(bends.up1).not.toBe(bends.extra);
    // reversed parallel edge gets the mirrored sign so the two do not overlap
    const loop = penguinBtoSGamma();
    expect(edgeBends(loop).W).toBe(0.55); // explicit bend wins
  });
});

describe('scene and SVG', () => {
  it('fits the viewBox and produces one stroke and hit target per edge', () => {
    for (const ex of EXAMPLES) {
      const scene = buildScene(ex.diagram, buildEdgeViews(ex.diagram));
      expect(scene.edges).toHaveLength(ex.diagram.edges.length);
      expect(scene.width).toBe(520);
      expect(scene.height).toBeLessThanOrEqual(420);
      for (const v of scene.vertices) {
        expect(v.x).toBeGreaterThan(0);
        expect(v.x).toBeLessThan(scene.width);
        expect(v.y).toBeGreaterThan(0);
        expect(v.y).toBeLessThan(scene.height);
      }
      for (const e of scene.edges) {
        if (e.label) {
          expect(e.label.x).toBeGreaterThan(-10);
          expect(e.label.x).toBeLessThan(scene.width + 10);
          expect(e.label.y).toBeGreaterThan(0);
          expect(e.label.y).toBeLessThan(scene.height);
        }
      }
    }
  });

  it('only fermion (and unknown) edges get arrowheads', () => {
    const d = eeToQQg();
    const scene = buildScene(d, buildEdgeViews(d));
    const by = Object.fromEntries(scene.edges.map((e) => [e.id, e]));
    expect(by.e_in.arrow).not.toBeNull();
    expect(by.gam.arrow).toBeNull(); // photon
    expect(by.glu.arrow).toBeNull(); // gluon
  });

  it('SVG markup is well-formed enough: tags balanced, tap targets tagged with edge ids', () => {
    const d = betaDecay();
    const svg = renderDiagram(d, { hidden: ['W'] });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    for (const e of d.edges) expect(svg).toContain(`data-edge-hit="${e.id}"`);
    expect(svg).toContain('k-unknown'); // hidden W drawn as unknown
    expect(svg).toContain('k-fermion');
    const open = (svg.match(/<g[ >]/g) ?? []).length;
    const close = (svg.match(/<\/g>/g) ?? []).length;
    expect(open).toBe(close);
  });

  it('subscripts become tspans and text is escaped', () => {
    expect(symbolToTspans('ν_μ')).toContain('<tspan class="subscript"');
    expect(symbolToTspans('ν_μ')).toContain('μ</tspan>');
    expect(symbolToTspans('a<b')).toBe('a&lt;b');
    expect(symbolToTspans('e⁻')).toBe('e⁻');
  });

  it('does not leak the answer: hidden edges carry no particle info in markup', () => {
    const d = betaDecay();
    const svg = renderDiagram(d, { hidden: ['W', 'nubar'] });
    expect(svg).not.toContain('W⁻');
    expect(svg).not.toContain('ν̄');
    expect(svg).not.toContain('k-photon'); // line style hidden unless revealKinds
  });
});
