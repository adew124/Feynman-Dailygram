import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../src/engine/answer';
import {
  incomingAt,
  physicalParticle,
  storedFromPhysical,
} from '../src/engine/orientation';
import {
  ALL_PARTICLE_IDS,
  antiparticle,
  getParticle,
  sumQuantumNumbers,
} from '../src/engine/particles';
import { solve } from '../src/engine/solver';
import type { Diagram } from '../src/engine/types';
import { validateDiagram, validateVertex } from '../src/engine/validator';
import { findRule, VERTEX_RULES } from '../src/engine/vertices';
import { betaDecay, eeToMuMu } from './fixtures';

const edge = (d: Diagram, id: string) => d.edges.find((e) => e.id === id)!;
const withParticle = (d: Diagram, id: string, p: string | null): Diagram => ({
  ...d,
  edges: d.edges.map((e) => (e.id === id ? { ...e, particle: p } : e)),
});

describe('particle table', () => {
  it('antiparticle is an involution and negates every quantum number', () => {
    for (const id of ALL_PARTICLE_IDS) {
      const p = getParticle(id);
      const a = getParticle(antiparticle(id));
      expect(antiparticle(a.id)).toBe(id);
      if (p.antiId === id) {
        expect(sumQuantumNumbers([id])).toEqual({ charge3: 0, baryon3: 0, le: 0, lmu: 0, ltau: 0 });
      } else {
        const s = sumQuantumNumbers([id, a.id]);
        expect(s).toEqual({ charge3: 0, baryon3: 0, le: 0, lmu: 0, ltau: 0 });
      }
    }
  });

  it('has the expected charges and numbers', () => {
    expect(getParticle('e-').charge3).toBe(-3);
    expect(getParticle('u').charge3).toBe(2);
    expect(getParticle('dbar').charge3).toBe(1);
    expect(getParticle('mu+').lmu).toBe(-1);
    expect(getParticle('anti_nu_tau').ltau).toBe(-1);
    expect(getParticle('t').baryon3).toBe(1);
    expect(getParticle('W+').charge3).toBe(3);
    expect(getParticle('g').colored).toBe(true);
    expect(getParticle('gamma').antiId).toBe('gamma');
  });
});

describe('arrow direction vs antiparticles (the classic bug)', () => {
  const d = eeToMuMu();

  it('arrow forward in time: stored particle is the physical particle', () => {
    expect(physicalParticle(d, edge(d, 'e_in'))).toBe('e-');
    expect(physicalParticle(d, edge(d, 'mu_out'))).toBe('mu-');
  });

  it('arrow backward in time: physical particle is the antiparticle', () => {
    expect(physicalParticle(d, edge(d, 'p_in'))).toBe('e+'); // incoming positron
    expect(physicalParticle(d, edge(d, 'amu_out'))).toBe('mu+'); // outgoing antimuon
  });

  it('storedFromPhysical inverts physicalParticle', () => {
    for (const e of d.edges) {
      if (e.particle === null) continue;
      const phys = physicalParticle(d, e)!;
      expect(storedFromPhysical(d, e, phys)).toBe(e.particle);
    }
    expect(storedFromPhysical(d, edge(d, 'p_in'), 'e+')).toBe('e-');
    expect(storedFromPhysical(d, edge(d, 'e_in'), 'e+')).toBe('e+');
  });

  it('incoming convention flips particles on edges leaving the vertex', () => {
    // e_in ends at v1 -> electron; p_in starts at v1 -> positron incoming
    expect(incomingAt(edge(d, 'e_in'), 'v1')).toBe('e-');
    expect(incomingAt(edge(d, 'p_in'), 'v1')).toBe('e+');
    expect(incomingAt(edge(d, 'prop'), 'v1')).toBe('gamma');
    // mu_out leaves v2 -> counts as an incoming antimuon
    expect(incomingAt(edge(d, 'mu_out'), 'v2')).toBe('mu+');
    expect(incomingAt(edge(d, 'amu_out'), 'v2')).toBe('mu-');
  });

  it('a fermion line is orientation-consistent when drawn either way', () => {
    // Same physical process, but the positron leg is stored with the arrow
    // pointing INTO the vertex carrying e+ (wrong: that would mean an outgoing e+... time reversed).
    const bad = withParticle(d, 'p_in', 'e+');
    // Now both e_in and p_in bring e- / e+ INTO ... p_in leaves v1 carrying e+ => incoming e-: charge -2.
    expect(validateVertex(bad, 'v1').status).toBe('invalid');
    expect(validateVertex(bad, 'v1').issues.map((i) => i.code)).toContain('charge');
  });

  it('beta decay antineutrino: arrow backward carrying nu_e is an anti-nu_e', () => {
    const b = betaDecay();
    expect(physicalParticle(b, edge(b, 'nubar'))).toBe('anti_nu_e');
    expect(physicalParticle(b, edge(b, 'e'))).toBe('e-');
  });
});

describe('vertex rules', () => {
  it('contains the textbook vertices', () => {
    expect(findRule(['e-', 'e+', 'gamma'])).toBeDefined();
    expect(findRule(['u', 'ubar', 'g'])).toBeDefined();
    expect(findRule(['g', 'g', 'g'])).toBeDefined();
    expect(findRule(['g', 'g', 'g', 'g'])).toBeDefined();
    expect(findRule(['nu_mu', 'anti_nu_mu', 'Z'])).toBeDefined();
    expect(findRule(['W+', 'W-', 'gamma'])).toBeDefined();
    expect(findRule(['b', 'bbar', 'H'])).toBeDefined();
  });

  it('is order independent', () => {
    expect(findRule(['gamma', 'e+', 'e-'])).toBe(findRule(['e-', 'gamma', 'e+']));
  });

  it('includes full CKM including off-diagonal', () => {
    const ts = findRule(['s', 'tbar', 'W+']); // s -> t W- (virtual)
    expect(ts?.ckmOffDiagonal).toBe(true);
    expect(findRule(['d', 'ubar', 'W+'])?.ckmOffDiagonal).toBe(false);
  });

  it('every rule conserves everything (self-consistency of the table)', () => {
    for (const r of VERTEX_RULES) {
      expect(sumQuantumNumbers(r.particles), r.name).toEqual({
        charge3: 0, baryon3: 0, le: 0, lmu: 0, ltau: 0,
      });
    }
  });

  it('rejects flavor-changing neutral currents, neutrino-photon, lepton-flavor violation', () => {
    expect(findRule(['s', 'dbar', 'Z'])).toBeUndefined(); // no tree-level FCNC
    expect(findRule(['s', 'dbar', 'gamma'])).toBeUndefined();
    expect(findRule(['nu_e', 'anti_nu_e', 'gamma'])).toBeUndefined();
    expect(findRule(['e-', 'mu+', 'gamma'])).toBeUndefined();
    expect(findRule(['nu_e', 'anti_nu_e', 'H'])).toBeUndefined();
    expect(findRule(['e-', 'anti_nu_mu', 'W+'])).toBeUndefined(); // no flavor-violating W
  });
});

describe('validator', () => {
  it('accepts e+e- -> mu+mu- via photon', () => {
    const r = validateDiagram(eeToMuMu());
    expect(r.valid).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('accepts beta decay', () => {
    expect(validateDiagram(betaDecay()).valid).toBe(true);
  });

  it('flags charge violation with a charge hint at the right vertex', () => {
    const bad = withParticle(betaDecay(), 'W', 'W+');
    const r = validateDiagram(bad);
    expect(r.valid).toBe(false);
    expect(r.vertices.v1.status).toBe('invalid');
    expect(r.vertices.v1.issues.map((i) => i.code)).toContain('charge');
    expect(r.vertices.v1.issues[0].message).toMatch(/charge/i);
  });

  it('flags lepton number violation (neutrino instead of antineutrino)', () => {
    // arrow backward carrying anti_nu_e => physically a neutrino outgoing: Le = +2
    const bad = withParticle(betaDecay(), 'nubar', 'anti_nu_e');
    const r = validateDiagram(bad);
    expect(r.vertices.v2.issues.map((i) => i.code)).toContain('lepton-e');
    expect(r.vertices.v1.status).toBe('ok');
  });

  it('flags lepton FAMILY violation separately from charge', () => {
    const bad = withParticle(betaDecay(), 'e', 'mu-');
    const r = validateDiagram(bad);
    const codes = r.vertices.v2.issues.map((i) => i.code);
    expect(codes).toContain('lepton-e');
    expect(codes).toContain('lepton-mu');
    expect(codes).not.toContain('charge');
  });

  it('flags baryon-number violation', () => {
    const bad = withParticle(betaDecay(), 'u', 'e-');
    const codes = validateDiagram(bad).vertices.v1.issues.map((i) => i.code);
    expect(codes).toContain('baryon');
  });

  it('flags conserving-but-forbidden vertices as no-coupling', () => {
    // photon on a neutrino line: all numbers conserved, but no such coupling
    const d = withParticle(
      withParticle(
        withParticle(eeToMuMu(), 'e_in', 'nu_e'),
        'p_in',
        'nu_e',
      ),
      'prop',
      'gamma',
    );
    const v1 = validateVertex(d, 'v1');
    expect(v1.status).toBe('invalid');
    expect(v1.issues.map((i) => i.code)).toEqual(['no-coupling']);
    expect(v1.issues[0].message).toMatch(/photon/i);
  });

  it('reports incomplete (not invalid) when edges are unassigned', () => {
    const d = withParticle(eeToMuMu(), 'prop', null);
    const r = validateDiagram(d);
    expect(r.valid).toBe(false);
    expect(r.complete).toBe(false);
    expect(r.vertices.v1.status).toBe('incomplete');
    expect(r.issues).toEqual([]);
  });

  it('rejects vertices with the wrong number of lines', () => {
    const d = eeToMuMu();
    const bad: Diagram = { ...d, edges: d.edges.filter((e) => e.id !== 'amu_out') };
    expect(validateVertex(bad, 'v2').issues[0].code).toBe('bad-degree');
  });
});

describe('solver and answer checking', () => {
  it('beta decay: hidden antineutrino has exactly one solution', () => {
    const sols = solve(betaDecay(), ['nubar']);
    expect(sols).toEqual([{ nubar: 'nu_e' }]); // stored: arrow-backward nu_e == anti-nu_e
  });

  it('accepts ANY valid assignment: s-channel propagator can be gamma, Z or H', () => {
    // H is legitimate: e+e- -> H* -> mu+mu- exists in the SM (tiny, but allowed).
    const sols = solve(eeToMuMu(), ['prop']).map((s) => s.prop).sort();
    expect(sols).toEqual(['H', 'Z', 'gamma']);
    const d = eeToMuMu();
    expect(checkAnswer(d, ['prop'], { prop: 'gamma' }).correct).toBe(true);
    expect(checkAnswer(d, ['prop'], { prop: 'Z' }).correct).toBe(true);
    expect(checkAnswer(d, ['prop'], { prop: 'g' }).correct).toBe(false);
  });

  it('accepts alternative multi-edge solutions (e+e- -> ff with fermion hidden)', () => {
    // hide both outgoing legs' flavor, keep propagator hidden too
    const sols = solve(eeToMuMu(), ['prop', 'mu_out', 'amu_out']);
    // gamma/Z x {e,mu,tau,u,c,t,d,s,b,nu(Z only)} ... must include mu and tau and quarks
    const outs = new Set(sols.map((s) => s.mu_out));
    expect(outs.has('mu-')).toBe(true);
    expect(outs.has('tau-')).toBe(true);
    expect(outs.has('u')).toBe(true);
    // fermion-pair solutions pair a fermion with its own antiparticle line
    for (const s of sols.filter((s) => getParticle(s.mu_out).fermion)) {
      expect(s.amu_out).toBe(s.mu_out);
    }
    // bosonic final states are also valid: e+e- -> gamma* -> W+W-, e+e- -> H* -> ZZ
    expect(sols.some((s) => s.prop === 'gamma' && s.mu_out === 'W-')).toBe(true);
    expect(sols.some((s) => s.prop === 'H' && s.mu_out === 'Z')).toBe(true);
  });

  it('does not let revealed edges be changed', () => {
    const d = eeToMuMu();
    const r = checkAnswer(d, ['prop'], { prop: 'gamma', e_in: 'mu-' });
    expect(r.correct).toBe(false);
    expect(r.illegal).toEqual(['e_in']);
  });

  it('reports missing hidden edges', () => {
    const r = checkAnswer(betaDecay(), ['W', 'nubar'], { W: 'W-' });
    expect(r.correct).toBe(false);
    expect(r.missing).toEqual(['nubar']);
  });

  it('answer checking matches the physical antiparticle choice made by a player', () => {
    // Player picks the PHYSICAL label "anti-nu_e" for the backward-arrow leg;
    // UI converts via storedFromPhysical.
    const b = betaDecay();
    const stored = storedFromPhysical(b, edge(b, 'nubar'), 'anti_nu_e');
    expect(checkAnswer(b, ['nubar'], { nubar: stored }).correct).toBe(true);
    const wrong = storedFromPhysical(b, edge(b, 'nubar'), 'nu_e'); // a plain neutrino
    expect(checkAnswer(b, ['nubar'], { nubar: wrong }).correct).toBe(false);
  });

  it('returns no solutions when revealed parts are inconsistent', () => {
    const bad = withParticle(betaDecay(), 'u', 'e-');
    expect(solve(bad, ['W'])).toEqual([]);
  });
});
