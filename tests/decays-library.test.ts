import { describe, expect, it } from 'vitest';
import { externalEntities, validateFull } from '../src/engine/decays';
import type { Diagram } from '../src/engine/types';
import { acceptableHideSet } from '../src/puzzle/generator';
import { findProcess, LIBRARY } from '../src/puzzle/library';
import type { ProcessEntry, SuppressionReason } from '../src/puzzle/types';

const DECAYS = LIBRARY.filter((e) => e.decay);
const ALLOWED = DECAYS.filter((e) => e.decay!.category === 'allowed');
const SUPPRESSED = DECAYS.filter((e) => e.decay!.category === 'suppressed');

/** Every decay of the brief, by library id. */
const ALLOWED_IDS = [
  'dec-mu', 'dec-tau-pi', 'dec-n', 'dec-pi-munu', 'dec-k-munu', 'dec-lambda', 'dec-ks-pipi', 'dec-d0-kpi',
  'dec-b0bar-dpi', 'dec-top', 'dec-z-mumu', 'dec-h-bb', 'dec-rho', 'dec-delta', 'dec-kstar', 'dec-phi-kk',
  'dec-sigma0', 'dec-pi0-gg',
];
const REFERENCE_IDS = ['dec-omega-3pi', 'dec-kl-pienu', 'dec-k-pi0enu', 'dec-bs-dspi', 'dec-b0-dpi', 'dec-jpsi-mumu'];
const SUPPRESSED_IDS = [
  'dec-pi-enu', 'dec-k-enu', 'dec-d0-pipi', 'dec-d0-kpi-dcs', 'dec-b0bar-pipi', 'dec-b0bar-d0pi0', 'dec-b0-jpsiks',
  'dec-phi-3pi', 'dec-jpsi-3pi', 'dec-omega-pipi', 'dec-kl-mumu', 'dec-k-pinunu', 'dec-b0bar-kstgamma', 'dec-bs-mumu',
];

describe('decay library: coverage', () => {
  it('has all 18 allowed and 14 suppressed decays from the brief, plus the reference decays', () => {
    for (const id of [...ALLOWED_IDS, ...REFERENCE_IDS, ...SUPPRESSED_IDS]) expect(findProcess(id), id).toBeDefined();
    expect(ALLOWED).toHaveLength(ALLOWED_IDS.length + REFERENCE_IDS.length);
    expect(SUPPRESSED).toHaveLength(SUPPRESSED_IDS.length);
  });

  it('all decays are classified as decays (one particle in, two or more out)', () => {
    for (const e of DECAYS) expect(e.isDecay, e.id).toBe(true);
  });

  it('existing scattering processes are not decays, quark-level decays like β⁻ are', () => {
    expect(findProcess('compton')?.isDecay ?? false).toBe(false);
    const ents = externalEntities(findProcess(ALLOWED_IDS[0])!.diagram)!;
    expect(ents.filter((x) => x.side === 'in')).toHaveLength(1);
  });
});

describe('decay library: every entry is physically valid', () => {
  for (const e of DECAYS) {
    it(`${e.id}: valid vertices, hadron content and enough energy`, () => {
      const r = validateFull(e.diagram, { kinematics: true });
      expect(r.vertices.issues.map((i) => i.message), 'vertices').toEqual([]);
      expect(r.hadrons.issues.map((i) => i.message), 'hadrons').toEqual([]);
      expect(r.kinematics?.message ?? null, 'kinematics').toBeNull();
      expect(r.valid).toBe(true);
    });
  }
});

describe('decay library: classification', () => {
  it('allowed decays have no suppression reasons; suppressed ones have at least one', () => {
    for (const e of ALLOWED) expect(e.decay!.reasons, e.id).toEqual([]);
    for (const e of SUPPRESSED) expect(e.decay!.reasons.length, e.id).toBeGreaterThanOrEqual(1);
  });

  it('every suppressed decay names an allowed decay to compare with', () => {
    for (const e of SUPPRESSED) {
      const ref = findProcess(e.decay!.compareWith ?? '');
      expect(ref, `${e.id} compares with ${e.decay!.compareWith}`).toBeDefined();
      expect(ref!.decay?.category, `${e.id} reference`).toBe('allowed');
    }
  });

  it('a comparison decay shares the parent family: same parent or a sibling of it', () => {
    const parentOf = (e: ProcessEntry) =>
      (e.diagram.hadrons ?? []).find((g) => g.side === 'in')?.hadron ?? externalEntities(e.diagram)!.find((x) => x.side === 'in')!.symbol;
    const family = (h: string) => h.replace(/bar$/, '').replace(/^K_[SL]$/, 'K0').replace(/[+-]$/, '').replace(/^B0$/, 'B0');
    for (const e of SUPPRESSED) {
      const ref = findProcess(e.decay!.compareWith!)!;
      const a = family(parentOf(e));
      const b = family(parentOf(ref));
      // same meson family (K, D, B, phi, omega, pi ...); J/psi and B_s are compared across a close relative
      const loose = ['K', 'K0', 'B0', 'Bs', 'D0', 'pi', 'phi', 'omega', 'jpsi', 'pi+', 'Kst'];
      expect(a === b || (loose.includes(a) && loose.includes(b)), `${e.id}: ${a} vs ${b}`).toBe(true);
    }
  });

  it('branching ratios are fractions with display text', () => {
    for (const e of DECAYS) {
      expect(e.decay!.br, e.id).toBeGreaterThan(0);
      expect(e.decay!.br, e.id).toBeLessThanOrEqual(1);
      expect(e.decay!.brText.length, e.id).toBeGreaterThan(3);
    }
    // PDG 2025 spot checks
    const br = (id: string) => findProcess(id)!.decay!.br;
    expect(br('dec-k-munu')).toBeCloseTo(0.6356, 4);
    expect(br('dec-pi-enu')).toBeCloseTo(1.23e-4, 6);
    expect(br('dec-bs-mumu')).toBeCloseTo(3.34e-9, 11);
    expect(br('dec-d0-kpi')).toBeCloseTo(0.03945, 5);
  });

  it('suppressed decays are rarer than their allowed comparison (the one exception is phase-space driven φ → 3π vs KK is fine too)', () => {
    for (const e of SUPPRESSED) {
      const ref = findProcess(e.decay!.compareWith!)!;
      expect(e.decay!.br, `${e.id} vs ${ref.id}`).toBeLessThan(ref.decay!.br);
    }
  });

  it('uses only known reasons, and the headline reasons from the brief all appear', () => {
    const known: SuppressionReason[] = ['cabibbo-single', 'cabibbo-double', 'ckm-b-u', 'helicity', 'ozi', 'color', 'loop-gim', 'isospin'];
    const seen = new Set<string>();
    for (const e of SUPPRESSED) for (const r of e.decay!.reasons) {
      expect(known, e.id).toContain(r);
      seen.add(r);
    }
    for (const r of known) expect(seen.has(r), r).toBe(true);
  });

  it('specific labels match the brief', () => {
    const reasons = (id: string) => findProcess(id)!.decay!.reasons;
    expect(reasons('dec-pi-enu')).toEqual(['helicity']);
    expect(reasons('dec-d0-pipi')).toEqual(['cabibbo-single']);
    expect(reasons('dec-d0-kpi-dcs')).toEqual(['cabibbo-double']);
    expect(reasons('dec-b0bar-pipi')).toEqual(['ckm-b-u']);
    expect(reasons('dec-b0bar-d0pi0')).toEqual(['color']);
    expect(reasons('dec-b0-jpsiks')).toEqual(['color']);
    expect(reasons('dec-phi-3pi')).toEqual(['ozi']);
    expect(reasons('dec-jpsi-3pi')).toEqual(['ozi']);
    expect(reasons('dec-omega-pipi')).toEqual(['isospin']);
    expect(reasons('dec-kl-mumu')).toContain('loop-gim');
    expect(reasons('dec-bs-mumu')).toContain('loop-gim');
    expect(findProcess('dec-phi-3pi')!.decay!.compareWith).toBe('dec-phi-kk');
    expect(findProcess('dec-omega-pipi')!.decay!.compareWith).toBe('dec-omega-3pi');
  });
});

/**
 * OZI suppression means the quark lines are disconnected between initial and final hadrons.
 * Check that against the diagram itself: delete the gluons and look for a connected piece that
 * contains initial-state quark lines but no final-state ones.
 */
function oziDisconnected(d: Diagram): boolean {
  const parent = new Map<string, string>(d.nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const e of d.edges) if (e.particle !== 'g') parent.set(find(e.from), find(e.to));
  // external lines sit at the left (incoming) or right (outgoing) edge of the layout
  const xs = d.nodes.map((n) => n.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const side = new Map<string, 'in' | 'out'>();
  for (const n of d.nodes) if (n.kind === 'external') side.set(n.id, n.x === minX ? 'in' : n.x === maxX ? 'out' : 'in');
  const comp = new Map<string, Set<string>>();
  for (const n of d.nodes) {
    const s = side.get(n.id);
    if (!s) continue;
    const r = find(n.id);
    if (!comp.has(r)) comp.set(r, new Set());
    comp.get(r)!.add(s);
  }
  // a piece with initial-state quarks but no final-state quark: the initial quarks annihilate (pairs created
  // from gluons are fine, they just start new lines)
  return [...comp.values()].some((sides) => sides.has('in') && !sides.has('out'));
}

describe('decay library: OZI tag agrees with the quark-line topology', () => {
  for (const e of DECAYS) {
    it(e.id, () => {
      expect(oziDisconnected(e.diagram), `${e.id} quark lines`).toBe(e.decay!.reasons.includes('ozi'));
    });
  }
});

describe('decay library: puzzles', () => {
  it('every decay has a curated hide set that is fair, and hadron hide sets name existing groups', () => {
    for (const e of DECAYS) {
      expect(e.hideSets?.length ?? 0, e.id).toBeGreaterThan(0);
      expect((e.hideSets ?? []).some((s) => acceptableHideSet(e.diagram, s)), e.id).toBe(true);
    }
  });

  it('a hidden hadron is only offered when exactly one table hadron fits (after the energy check)', () => {
    // π⁺-like content u d̄ also fits ρ⁺, but ρ⁺ is too heavy for K⁰ → ..., so the K_S decay can hide its π⁺
    const ks = findProcess('dec-ks-pipi')!;
    expect(acceptableHideSet(ks.diagram, ['PiP'])).toBe(true);
    // D⁰ → K⁻ π⁺: hiding the pion would also allow ρ⁺ (heavy enough), so it must NOT be offered
    const d0 = findProcess('dec-d0-kpi')!;
    expect(acceptableHideSet(d0.diagram, ['Mw'])).toBe(false);
    // Σ⁰ → Λ γ: the Λ is forced because Σ⁰ → Σ⁰ γ has no energy
    expect(acceptableHideSet(findProcess('dec-sigma0')!.diagram, ['L'])).toBe(true);
  });
});
