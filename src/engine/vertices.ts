import {
  antiparticle,
  CHARGED_LEPTONS,
  DOWN_QUARKS,
  FERMION_IDS,
  getParticle,
  QUARK_IDS,
  UP_QUARKS,
  type ParticleId,
} from './particles';

/**
 * Explicit list of allowed Standard Model vertices.
 *
 * Every rule lists its particles with ALL LINES INCOMING (an outgoing particle
 * is written as its antiparticle). Order is irrelevant: rules are matched as
 * multisets. Neutrino oscillation is ignored, so every vertex conserves each
 * lepton family number separately.
 */
export type VertexKind =
  | 'QED'
  | 'QCD'
  | 'weak-CC'
  | 'weak-NC'
  | 'Higgs'
  | 'gauge-self';

export interface VertexRule {
  name: string;
  kind: VertexKind;
  /** All-incoming particle ids. */
  particles: readonly ParticleId[];
  /** True for charged-current quark vertices that change generation (CKM-suppressed). */
  ckmOffDiagonal?: boolean;
}

export function multisetKey(ids: readonly ParticleId[]): string {
  return [...ids].sort().join(',');
}

const RULES: VertexRule[] = [];
function rule(r: VertexRule) {
  RULES.push(r);
}

const charged = [...CHARGED_LEPTONS, ...QUARK_IDS];
const sym = (id: ParticleId) => getParticle(id).symbol;

// --- QED: photon couples to every electrically charged fermion --------------
for (const f of charged) {
  rule({
    name: `γ ${sym(f)}${sym(antiparticle(f))}`,
    kind: 'QED',
    particles: [f, antiparticle(f), 'gamma'],
  });
}

// --- QCD ---------------------------------------------------------------------
for (const q of QUARK_IDS) {
  rule({ name: `g ${sym(q)}${sym(antiparticle(q))}`, kind: 'QCD', particles: [q, antiparticle(q), 'g'] });
}
rule({ name: 'ggg', kind: 'QCD', particles: ['g', 'g', 'g'] });
rule({ name: 'gggg', kind: 'QCD', particles: ['g', 'g', 'g', 'g'] });

// --- Weak neutral current: Z couples to every fermion, flavor-diagonal ---------
for (const f of FERMION_IDS) {
  rule({ name: `Z ${sym(f)}${sym(antiparticle(f))}`, kind: 'weak-NC', particles: [f, antiparticle(f), 'Z'] });
}

// --- Weak charged current: leptons (same family only) --------------------------
const NU_OF: Record<string, ParticleId> = { 'e-': 'nu_e', 'mu-': 'nu_mu', 'tau-': 'nu_tau' };
for (const l of CHARGED_LEPTONS) {
  const nu = NU_OF[l];
  // l- -> nu + W-   (incoming: l-, anti-nu, W+)
  rule({ name: `W ${sym(l)}${sym(nu)}`, kind: 'weak-CC', particles: [l, antiparticle(nu), 'W+'] });
  // l+ + nu -> W-   (incoming: l+, nu, W-)
  rule({ name: `W ${sym(antiparticle(l))}${sym(antiparticle(nu))}`, kind: 'weak-CC', particles: [antiparticle(l), nu, 'W-'] });
}

// --- Weak charged current: quarks, full CKM matrix (all 9 up/down pairs) --------
for (const u of UP_QUARKS) {
  for (const d of DOWN_QUARKS) {
    const offDiag = getParticle(u).generation !== getParticle(d).generation;
    rule({
      name: `W ${sym(u)}${sym(d)}`,
      kind: 'weak-CC',
      particles: [d, antiparticle(u), 'W+'], // d -> u + W-
      ckmOffDiagonal: offDiag,
    });
    rule({
      name: `W ${sym(antiparticle(u))}${sym(antiparticle(d))}`,
      kind: 'weak-CC',
      particles: [antiparticle(d), u, 'W-'], // u -> d + W+
      ckmOffDiagonal: offDiag,
    });
  }
}

// --- Higgs: massive fermions (SM neutrinos are massless -> no Yukawa) -----------
for (const f of charged) {
  rule({ name: `H ${sym(f)}${sym(antiparticle(f))}`, kind: 'Higgs', particles: [f, antiparticle(f), 'H'] });
}
rule({ name: 'HWW', kind: 'Higgs', particles: ['H', 'W+', 'W-'] });
rule({ name: 'HZZ', kind: 'Higgs', particles: ['H', 'Z', 'Z'] });
rule({ name: 'HHH', kind: 'Higgs', particles: ['H', 'H', 'H'] });
rule({ name: 'HHHH', kind: 'Higgs', particles: ['H', 'H', 'H', 'H'] });
rule({ name: 'HHWW', kind: 'Higgs', particles: ['H', 'H', 'W+', 'W-'] });
rule({ name: 'HHZZ', kind: 'Higgs', particles: ['H', 'H', 'Z', 'Z'] });

// --- Gauge boson self-interactions -----------------------------------------------
rule({ name: 'γWW', kind: 'gauge-self', particles: ['gamma', 'W+', 'W-'] });
rule({ name: 'ZWW', kind: 'gauge-self', particles: ['Z', 'W+', 'W-'] });
rule({ name: 'WWγγ', kind: 'gauge-self', particles: ['gamma', 'gamma', 'W+', 'W-'] });
rule({ name: 'WWZγ', kind: 'gauge-self', particles: ['Z', 'gamma', 'W+', 'W-'] });
rule({ name: 'WWZZ', kind: 'gauge-self', particles: ['Z', 'Z', 'W+', 'W-'] });
rule({ name: 'WWWW', kind: 'gauge-self', particles: ['W+', 'W+', 'W-', 'W-'] });

export const VERTEX_RULES: readonly VertexRule[] = RULES;
export const MAX_VERTEX_DEGREE = Math.max(...RULES.map((r) => r.particles.length));
export const MIN_VERTEX_DEGREE = Math.min(...RULES.map((r) => r.particles.length));

const BY_KEY = new Map<string, VertexRule>();
for (const r of RULES) BY_KEY.set(multisetKey(r.particles), r);

/** Find the rule matching a complete all-incoming multiset, if any. */
export function findRule(incoming: readonly ParticleId[]): VertexRule | undefined {
  return BY_KEY.get(multisetKey(incoming));
}

function counts(ids: readonly ParticleId[]): Map<ParticleId, number> {
  const m = new Map<ParticleId, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/**
 * Could the partially known all-incoming multiset still be completed to an
 * allowed vertex with `degree` lines? Used for solver pruning and hints.
 */
export function partialMatchExists(known: readonly ParticleId[], degree: number): boolean {
  const have = counts(known);
  outer: for (const r of RULES) {
    if (r.particles.length !== degree) continue;
    const need = counts(r.particles);
    for (const [id, n] of have) {
      if ((need.get(id) ?? 0) < n) continue outer;
    }
    return true;
  }
  return false;
}

/** All particles that could fill the single missing slot of a vertex. */
export function completions(known: readonly ParticleId[]): ParticleId[] {
  const out = new Set<ParticleId>();
  const have = counts(known);
  for (const r of RULES) {
    if (r.particles.length !== known.length + 1) continue;
    const need = counts(r.particles);
    let ok = true;
    for (const [id, n] of have) if ((need.get(id) ?? 0) < n) ok = false;
    if (!ok) continue;
    for (const [id, n] of need) if (n > (have.get(id) ?? 0)) out.add(id);
  }
  return [...out];
}
