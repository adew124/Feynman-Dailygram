/**
 * Standard Model particle table.
 *
 * Quantum numbers are stored as integers to avoid floating-point error:
 *   charge3  = electric charge in units of e/3   (u quark = +2, d quark = -1)
 *   baryon3  = baryon number in units of 1/3     (quark = +1, antiquark = -1)
 *   le, lmu, ltau = lepton family numbers
 */

export type ParticleKind = 'lepton' | 'quark' | 'gauge' | 'higgs';

export interface Particle {
  id: string;
  /** Plain-text name, e.g. "electron", "anti-up quark". */
  name: string;
  /** Display symbol; "_x" marks a subscript (renderer turns it into <tspan>). */
  symbol: string;
  kind: ParticleKind;
  fermion: boolean;
  charge3: number;
  baryon3: number;
  le: number;
  lmu: number;
  ltau: number;
  /** Carries color charge (quarks, antiquarks, gluon). */
  colored: boolean;
  /** Id of the antiparticle (itself for self-conjugate particles). */
  antiId: string;
  isAnti: boolean;
  /** 1..3 for fermions. */
  generation?: 1 | 2 | 3;
  /** Weak-isospin partner type for fermions (up-type: u,c,t,nu; down-type: d,s,b,l). */
  isoType?: 'up' | 'down';
}

export type ParticleId = string;

const BAR = '̄';
/** Put a combining overline on the first character of a symbol: "u" -> "ū". */
export function barSymbol(s: string): string {
  const [first, ...rest] = Array.from(s);
  return first + BAR + rest.join('');
}

const table = new Map<ParticleId, Particle>();

function add(p: Particle) {
  table.set(p.id, p);
}

/** Register a particle together with its antiparticle. */
function addPair(
  base: Omit<Particle, 'antiId' | 'isAnti' | 'id' | 'name' | 'symbol'> & {
    id: string;
    antiId: string;
    name: string;
    antiName: string;
    symbol: string;
    antiSymbol: string;
  },
) {
  const { antiId, antiName, antiSymbol, ...rest } = base;
  add({ ...rest, antiId, isAnti: false });
  add({
    ...rest,
    id: antiId,
    name: antiName,
    symbol: antiSymbol,
    charge3: -rest.charge3,
    baryon3: -rest.baryon3,
    le: -rest.le,
    lmu: -rest.lmu,
    ltau: -rest.ltau,
    antiId: rest.id,
    isAnti: true,
    isoType: rest.isoType,
  });
}

function addSelf(
  id: string,
  name: string,
  symbol: string,
  kind: ParticleKind,
  colored = false,
) {
  add({
    id, name, symbol, kind, fermion: false,
    charge3: 0, baryon3: 0, le: 0, lmu: 0, ltau: 0,
    colored, antiId: id, isAnti: false,
  });
}

// ---- leptons -------------------------------------------------------------
const FAMILIES = [
  { gen: 1 as const, l: 'e', lSym: 'e', nuSym: 'ν_e', lName: 'electron', nuName: 'electron neutrino' },
  { gen: 2 as const, l: 'mu', lSym: 'μ', nuSym: 'ν_μ', lName: 'muon', nuName: 'muon neutrino' },
  { gen: 3 as const, l: 'tau', lSym: 'τ', nuSym: 'ν_τ', lName: 'tau', nuName: 'tau neutrino' },
];
for (const f of FAMILIES) {
  const fam = { le: 0, lmu: 0, ltau: 0 };
  const key = f.gen === 1 ? 'le' : f.gen === 2 ? 'lmu' : 'ltau';
  fam[key] = 1;
  addPair({
    id: `${f.l}-`, antiId: `${f.l}+`,
    name: f.lName, antiName: `anti-${f.lName}`,
    symbol: `${f.lSym}⁻`, antiSymbol: `${f.lSym}⁺`,
    kind: 'lepton', fermion: true, charge3: -3, baryon3: 0, ...fam,
    colored: false, generation: f.gen, isoType: 'down',
  });
  addPair({
    id: `nu_${f.l}`, antiId: `anti_nu_${f.l}`,
    name: f.nuName, antiName: `anti-${f.nuName}`,
    symbol: f.nuSym, antiSymbol: barSymbol(f.nuSym),
    kind: 'lepton', fermion: true, charge3: 0, baryon3: 0, ...fam,
    colored: false, generation: f.gen, isoType: 'up',
  });
}

// ---- quarks --------------------------------------------------------------
const QUARKS: [string, string, 1 | 2 | 3, 'up' | 'down'][] = [
  ['u', 'up', 1, 'up'], ['d', 'down', 1, 'down'],
  ['c', 'charm', 2, 'up'], ['s', 'strange', 2, 'down'],
  ['t', 'top', 3, 'up'], ['b', 'bottom', 3, 'down'],
];
for (const [sym, name, gen, iso] of QUARKS) {
  addPair({
    id: sym, antiId: `${sym}bar`,
    name: `${name} quark`, antiName: `anti-${name} quark`,
    symbol: sym, antiSymbol: barSymbol(sym),
    kind: 'quark', fermion: true,
    charge3: iso === 'up' ? 2 : -1, baryon3: 1, le: 0, lmu: 0, ltau: 0,
    colored: true, generation: gen, isoType: iso,
  });
}

// ---- bosons --------------------------------------------------------------
addSelf('gamma', 'photon', 'γ', 'gauge');
addSelf('Z', 'Z boson', 'Z⁰', 'gauge');
addSelf('g', 'gluon', 'g', 'gauge', true);
addSelf('H', 'Higgs boson', 'H', 'higgs');
addPair({
  id: 'W+', antiId: 'W-', name: 'W⁺ boson', antiName: 'W⁻ boson',
  symbol: 'W⁺', antiSymbol: 'W⁻',
  kind: 'gauge', fermion: false, charge3: 3, baryon3: 0, le: 0, lmu: 0, ltau: 0,
  colored: false,
});

// ---- public API ----------------------------------------------------------
export const PARTICLES: ReadonlyMap<ParticleId, Particle> = table;
export const ALL_PARTICLE_IDS: readonly ParticleId[] = Array.from(table.keys());

export function getParticle(id: ParticleId): Particle {
  const p = table.get(id);
  if (!p) throw new Error(`Unknown particle id: ${id}`);
  return p;
}

export function isParticleId(id: string): boolean {
  return table.has(id);
}

export function antiparticle(id: ParticleId): ParticleId {
  return getParticle(id).antiId;
}

export const CHARGED_LEPTONS = ['e-', 'mu-', 'tau-'] as const;
export const NEUTRINOS = ['nu_e', 'nu_mu', 'nu_tau'] as const;
export const UP_QUARKS = ['u', 'c', 't'] as const;
export const DOWN_QUARKS = ['d', 's', 'b'] as const;
export const QUARK_IDS = [...UP_QUARKS, ...DOWN_QUARKS] as const;
/** Fermions (particle, not antiparticle, representatives). */
export const FERMION_IDS = [...CHARGED_LEPTONS, ...NEUTRINOS, ...QUARK_IDS] as const;

/** Net quantum numbers of a set of particles (all counted as given). */
export interface QuantumSums {
  charge3: number;
  baryon3: number;
  le: number;
  lmu: number;
  ltau: number;
}

export function sumQuantumNumbers(ids: readonly ParticleId[]): QuantumSums {
  const s: QuantumSums = { charge3: 0, baryon3: 0, le: 0, lmu: 0, ltau: 0 };
  for (const id of ids) {
    const p = getParticle(id);
    s.charge3 += p.charge3;
    s.baryon3 += p.baryon3;
    s.le += p.le;
    s.lmu += p.lmu;
    s.ltau += p.ltau;
  }
  return s;
}
