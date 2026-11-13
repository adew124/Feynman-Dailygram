import { describe, expect, it } from 'vitest';
import { groupContent, validateFull, checkKinematics } from '../src/engine/decays';
import {
  ALL_HADRON_IDS,
  antiHadron,
  describeContent,
  getHadron,
  hadronAcceptsContent,
  hadronsWithContent,
  lifetimeSeconds,
} from '../src/engine/hadrons';
import { fundamentalMassMeV } from '../src/engine/masses';
import { physicalParticle } from '../src/engine/orientation';
import { getParticle } from '../src/engine/particles';
import { PDG_EDITION } from '../src/engine/pdgData';
import { validateVertex } from '../src/engine/validator';
import { parseProcess, type RawProcess } from '../src/puzzle/loader';
import { eeToMuMu } from './fixtures';

/** Net quantum numbers of one component, counted from its quarks. */
function derive(quarks: string[]) {
  let charge3 = 0, baryon3 = 0, S = 0, C = 0, Bb = 0;
  for (const q of quarks) {
    const p = getParticle(q);
    charge3 += p.charge3;
    baryon3 += p.baryon3;
    const base = p.isAnti ? p.antiId : p.id;
    const sign = p.isAnti ? -1 : 1;
    if (base === 's') S -= sign;
    if (base === 'c') C += sign;
    if (base === 'b') Bb -= sign;
  }
  return { charge3, baryon3, S, C, Bb };
}

describe('hadron table', () => {
  it('uses the 2025 PDG edition', () => expect(PDG_EDITION).toBe('2025'));

  it('stated quantum numbers match the quark content of EVERY component', () => {
    for (const id of ALL_HADRON_IDS) {
      const h = getHadron(id);
      const size = h.kind === 'meson' ? 2 : 3;
      for (const c of h.components) {
        expect(c.quarks, id).toHaveLength(size);
        const d = derive(c.quarks);
        expect(d.charge3, `${id} charge`).toBe(h.charge * 3);
        expect(d.baryon3, `${id} baryon`).toBe(h.baryon * 3);
        expect(d.C, `${id} charm`).toBe(h.charm);
        expect(d.Bb, `${id} beauty`).toBe(h.beauty);
        if (h.strangeness !== null) expect(d.S, `${id} strangeness`).toBe(h.strangeness);
      }
      // only K_S / K_L have undefined strangeness
      expect(h.strangeness === null).toBe(id === 'K_S' || id === 'K_L');
    }
  });

  it('mesons are q q̄ and baryons are qqq (or q̄q̄q̄)', () => {
    for (const id of ALL_HADRON_IDS) {
      const h = getHadron(id);
      for (const c of h.components) {
        const anti = c.quarks.filter((q) => getParticle(q).isAnti).length;
        if (h.kind === 'meson') expect(anti, id).toBe(1);
        else expect([0, 3], id).toContain(anti);
      }
    }
  });

  it('component amplitudes are normalised', () => {
    for (const id of ALL_HADRON_IDS) {
      const sum = getHadron(id).components.reduce((a, c) => a + c.amp * c.amp, 0);
      expect(sum, id).toBeCloseTo(1, 6);
    }
  });

  it('antiparticles are consistent: conjugate content, negated numbers, equal mass', () => {
    for (const id of ALL_HADRON_IDS) {
      const h = getHadron(id);
      const a = getHadron(antiHadron(id));
      expect(antiHadron(a.id)).toBe(id);
      expect(a.massMeV).toBe(h.massMeV);
      expect(a.charge + h.charge).toBe(0);
      expect(a.baryon + h.baryon).toBe(0);
      if (a.id !== h.id) {
        expect(a.components.map((c) => c.quarks.map((q) => getParticle(q).antiId))).toEqual(
          h.components.map((c) => c.quarks),
        );
      }
    }
    expect(getHadron('B0bar').components[0].quarks.sort()).toEqual(['b', 'dbar']);
  });

  it('mixed states list every component; flavour states list one', () => {
    expect(getHadron('pi0').components.map((c) => describeContent(c.quarks).normalize('NFC'))).toEqual(['u ū', 'd d̄']);
    expect(getHadron('K_S').components).toHaveLength(2);
    expect(getHadron('eta').components).toHaveLength(3);
    expect(getHadron('phi').components).toHaveLength(1);
    expect(getHadron('K0').components).toHaveLength(1);
  });

  it('PDG 2025 values (spot checks)', () => {
    expect(getHadron('pi+').massMeV).toBeCloseTo(139.57039, 4);
    expect(getHadron('K+').massMeV).toBeCloseTo(493.677, 3);
    expect(getHadron('p').massMeV).toBeCloseTo(938.272088, 5);
    expect(getHadron('D0').massMeV).toBeCloseTo(1864.84, 2);
    expect(getHadron('B0').massMeV).toBeCloseTo(5279.72, 2);
    expect(getHadron('jpsi').massMeV).toBeCloseTo(3096.9, 1);
    expect(getHadron('Delta++').widthMeV).toBeCloseTo(117, 0);
    expect(lifetimeSeconds(getHadron('pi+'))!).toBeCloseTo(2.603e-8, 11);
    expect(lifetimeSeconds(getHadron('p'))).toBeNull();
    expect(fundamentalMassMeV('t')).toBeCloseTo(172560, 0);
    expect(fundamentalMassMeV('W-')).toBeCloseTo(80369, 0);
    expect(fundamentalMassMeV('mu+')).toBeCloseTo(105.658, 2);
  });

  it('content matching is order-independent and finds look-alike hadrons', () => {
    expect(hadronAcceptsContent(getHadron('pi0'), ['dbar', 'd'])).toBe(true);
    expect(hadronAcceptsContent(getHadron('pi0'), ['s', 'sbar'])).toBe(false);
    expect(hadronsWithContent(['u', 'dbar']).map((h) => h.id).sort()).toEqual(['pi+', 'rho+']);
  });
});

/** K⁺ → μ⁺ ν_μ at the quark level: u s̄ annihilate into a W⁺. */
function kaonDecay(parent = 'K+'): RawProcess {
  return {
    id: 'kmunu', name: 'K+ -> mu+ nu', difficulty: 2, explanation: 'x',
    vertices: { v1: [1, 0], v2: [2, 0] },
    externals: { u: [0, -0.25], s: [0, 0.25], mu: [3, -0.5], nu: [3, 0.5] },
    legs: [
      ['u', 'in', 'u', 'v1', 'u'],
      ['sbar', 'in', 's', 'v1', 'sbar'],
      ['mu', 'out', 'mu', 'v2', 'mu+'],
      ['nu', 'out', 'nu', 'v2', 'nu_mu'],
    ],
    edges: [['W', 'v1', 'v2', 'W+']],
    hadrons: [['K', parent, 'in', ['u', 's']]],
  };
}

/** π⁰ → γγ at the quark level (tree q q̄ → γγ), using quark flavour `q`. */
function pionDecay(q: string, parent = 'pi0'): RawProcess {
  return {
    id: 'pi0gg', name: 'pi0 -> gamma gamma', difficulty: 7, explanation: 'x',
    vertices: { v1: [1, -0.25], v2: [2, 0.25] },
    externals: { a: [0, -0.25], b: [0, 0.25], g1: [3, -0.5], g2: [3, 0.5] },
    legs: [
      ['qin', 'in', 'a', 'v1', q],
      ['qbar', 'in', 'b', 'v2', `${q}bar`],
      ['g1', 'out', 'g1', 'v1', 'gamma'],
      ['g2', 'out', 'g2', 'v2', 'gamma'],
    ],
    edges: [['prop', 'v1', 'v2', q]],
    hadrons: [['P', parent, 'in', ['a', 'b']]],
  };
}

/**
 * Strong decay of q1 q̄2 into M1 = (q1 p̄) and M2 = (p q̄2): q1 radiates a gluon that makes a p p̄ pair
 * (pf = p). Example: ρ⁰ (u ū) → π⁺ π⁻ with pf = d.
 */
function strongDecay(parent: string, m1: string, m2: string, mid: [string, string], pf: string): RawProcess {
  return {
    id: 'strong', name: 'strong', difficulty: 3, explanation: 'x',
    vertices: { v1: [1, -0.25], v2: [2, 0] },
    externals: { a: [0, -0.25], b: [0, 0.25], o1a: [3, -1.2], o1b: [3, -0.7], o2a: [3, 0.7], o2b: [3, 1.2] },
    legs: [
      ['q1', 'in', 'a', 'v1', mid[0]],
      ['q1o', 'out', 'o1a', 'v1', mid[0]],
      ['sb', 'out', 'o1b', 'v2', `${pf}bar`],
      ['sq', 'out', 'o2a', 'v2', pf],
    ],
    spectators: [['q2', 'b', 'o2b', mid[1]]],
    edges: [['glu', 'v1', 'v2', 'g']],
    hadrons: [
      ['P', parent, 'in', ['a', 'b']],
      ['M1', m1, 'out', ['o1a', 'o1b']],
      ['M2', m2, 'out', ['o2a', 'o2b']],
    ],
  };
}

describe('hadron groups: validation', () => {
  it('K⁺ → μ⁺ν is fully valid; the group content is the PHYSICAL quarks u, s̄', () => {
    const e = parseProcess(kaonDecay());
    const r = validateFull(e.diagram);
    expect(r.hadrons.issues).toEqual([]);
    expect(r.vertices.issues).toEqual([]);
    expect(r.valid).toBe(true);
    expect(groupContent(e.diagram, e.diagram.hadrons![0])!.sort()).toEqual(['sbar', 'u']);
    expect(e.isDecay).toBe(true);
  });

  it('antiquark inside a meson: s̄ is stored as s on a backward arrow, but displayed as s̄', () => {
    const d = parseProcess(kaonDecay()).diagram;
    const e = d.edges.find((x) => x.id === 'sbar')!;
    expect(e.particle).toBe('s'); // along the arrow
    expect(e.from).toBe('v1'); // arrow points from the vertex back toward the incoming leg
    expect(e.to).toBe('s');
    expect(physicalParticle(d, e)).toBe('sbar');
    // the u quark next to it is an ordinary forward arrow
    const u = d.edges.find((x) => x.id === 'u')!;
    expect([u.from, u.to, u.particle]).toEqual(['u', 'v1', 'u']);
    // the vertex sees u + s̄ + W⁻ (all incoming) and accepts it
    expect(validateVertex(d, 'v1').status).toBe('ok');
  });

  it('antiquark inside an OUTGOING meson: spectator ū is stored as u, arrow runs backward in time', () => {
    const d = parseProcess(strongDecay('rho0', 'K+', 'K-', ['u', 'ubar'], 's')).diagram;
    const spect = d.edges.find((x) => x.id === 'q2')!;
    expect([spect.from, spect.to, spect.particle]).toEqual(['o2b', 'b', 'u']);
    expect(physicalParticle(d, spect)).toBe('ubar');
    const g1 = d.hadrons!.find((g) => g.id === 'M1')!;
    const g2 = d.hadrons!.find((g) => g.id === 'M2')!;
    expect(groupContent(d, g1)!.sort()).toEqual(['sbar', 'u']); // K⁺
    expect(groupContent(d, g2)!.sort()).toEqual(['s', 'ubar']); // K⁻
    expect(validateFull(d, { kinematics: false }).valid).toBe(true);
  });

  it('rejects quark lines that do not make the named hadron', () => {
    const r = validateFull(parseProcess(kaonDecay('pi+')).diagram);
    expect(r.hadrons.issues).toHaveLength(1);
    expect(r.hadrons.issues[0].code).toBe('hadron-content');
    expect(r.hadrons.issues[0].message).toContain('π⁺');
    expect(r.valid).toBe(false);
  });

  it('accepts ANY component of a mixed state: π⁰ as u ū or d d̄, but not s s̄', () => {
    for (const q of ['u', 'd']) {
      const r = validateFull(parseProcess(pionDecay(q)).diagram);
      expect(r.valid, q).toBe(true);
    }
    const s = validateFull(parseProcess(pionDecay('s')).diagram);
    expect(s.vertices.valid).toBe(true); // the quark diagram itself is fine
    expect(s.hadrons.issues[0].code).toBe('hadron-content'); // but it is not a π⁰
    // η has an s s̄ component, so the very same legs are a valid η
    expect(validateFull(parseProcess(pionDecay('s', 'eta')).diagram).valid).toBe(true);
    // a K_S can be drawn as d s̄ or as s d̄ (illustrated by group content, both allowed)
    expect(hadronAcceptsContent(getHadron('K_S'), ['dbar', 's'])).toBe(true);
    expect(hadronAcceptsContent(getHadron('K_S'), ['d', 'sbar'])).toBe(true);
  });

  it('strong decays pass through a gluon: ρ⁰ → π⁺π⁻ and φ → K⁻K⁺ are fully valid', () => {
    const rho = parseProcess(strongDecay('rho0', 'pi+', 'pi-', ['u', 'ubar'], 'd')).diagram;
    expect(rho.edges.some((e) => e.particle === 'g')).toBe(true);
    expect(validateFull(rho).valid).toBe(true);
    const phi = parseProcess(strongDecay('phi', 'K-', 'K+', ['s', 'sbar'], 'u')).diagram;
    expect(validateFull(phi).valid).toBe(true);
    // ρ⁰ is a mixture, so it may also be drawn as d d̄
    const rhoDd = parseProcess(strongDecay('rho0', 'pi-', 'pi+', ['d', 'dbar'], 'u')).diagram;
    expect(validateFull(rhoDd).valid).toBe(true);
  });

  it('flavour changes only at W vertices (any gluon/photon/Z/Higgs vertex that changes flavour is rejected)', () => {
    const d = parseProcess(kaonDecay()).diagram;
    const bad = {
      ...d,
      edges: d.edges.map((e) => (e.id === 'W' ? { ...e, particle: 'g' } : e)),
    };
    expect(validateVertex(bad, 'v1').status).toBe('invalid');
  });
});

describe('decay kinematics', () => {
  it('allows φ → K⁺K⁻ (1019 > 987 MeV)', () => {
    const e = parseProcess(strongDecay('phi', 'K-', 'K+', ['s', 'sbar'], 'u'));
    expect(e.isDecay).toBe(true);
    expect(validateFull(e.diagram).kinematics).toBeNull();
  });

  it('rejects ρ⁰ → K⁺K⁻ (775 < 987 MeV) with the "not enough energy" hint, and accepts ρ⁰ → π⁺π⁻', () => {
    const k = parseProcess(strongDecay('rho0', 'K+', 'K-', ['u', 'ubar'], 's')).diagram;
    const issue = checkKinematics(k);
    expect(issue?.code).toBe('kinematics');
    expect(issue?.message).toMatch(/not enough energy/i);
    const r = validateFull(k);
    expect(r.valid).toBe(false);
    expect(r.vertices.valid).toBe(true); // the vertices are fine; only the energy is missing
    expect(validateFull(parseProcess(strongDecay('rho0', 'pi+', 'pi-', ['u', 'ubar'], 'd')).diagram).valid).toBe(true);
  });

  it('works for bare fundamental decays: t → b W⁺ is allowed, a made-up b → t W⁻ is not', () => {
    const decay = (parent: string, daughter: string, w: string): RawProcess => ({
      id: 'x', name: 'x', difficulty: 3, explanation: 'x',
      vertices: { v: [1, 0] },
      externals: { a: [0, 0], b: [2, -0.5], c: [2, 0.5] },
      legs: [['p', 'in', 'a', 'v', parent], ['d', 'out', 'b', 'v', daughter], ['w', 'out', 'c', 'v', w]],
    });
    const top = parseProcess(decay('t', 'b', 'W+')).diagram;
    expect(validateFull(top, { kinematics: true }).valid).toBe(true);
    const wrong = parseProcess(decay('b', 't', 'W-')).diagram;
    const r = validateFull(wrong, { kinematics: true });
    expect(r.vertices.valid).toBe(true);
    expect(r.kinematics?.code).toBe('kinematics');
  });

  it('does not apply to scattering (two particles in)', () => {
    expect(checkKinematics(eeToMuMu())).toBeNull();
    expect(validateFull(eeToMuMu(), { kinematics: true }).kinematics).toBeNull();
  });
});

describe('group structure checks', () => {
  it('flags a group whose quark lines point the wrong way for its side', () => {
    const d = parseProcess(kaonDecay()).diagram;
    const flipped = { ...d, hadrons: [{ id: 'K', hadron: 'K+', side: 'out' as const, nodes: ['u', 's'] }] };
    expect(validateFull(flipped).hadrons.issues[0].code).toBe('hadron-side');
  });

  it('flags the wrong number of quark lines and a hidden group is merely incomplete', () => {
    const d = parseProcess(kaonDecay()).diagram;
    const baryon = { ...d, hadrons: [{ id: 'K', hadron: 'p', side: 'in' as const, nodes: ['u', 's'] }] };
    expect(validateFull(baryon).hadrons.issues[0].code).toBe('hadron-size');
    const hidden = { ...d, hadrons: [{ id: 'K', hadron: null, side: 'in' as const, nodes: ['u', 's'] }] };
    expect(validateFull(hidden).hadrons.groups.K).toBe('incomplete');
    expect(validateFull(hidden).hadrons.issues).toEqual([]);
  });

  it('the loader rejects unknown hadrons and nodes shared between groups', () => {
    const raw = kaonDecay();
    expect(() => parseProcess({ ...raw, hadrons: [['K', 'nope', 'in', ['u', 's']]] })).toThrow(/unknown hadron/);
    expect(() =>
      parseProcess({ ...raw, hadrons: [['K', 'K+', 'in', ['u', 's']], ['L', 'K+', 'in', ['u', 's']]] }),
    ).toThrow(/already in another group/);
  });
});
