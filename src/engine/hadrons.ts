/**
 * Hadron table: mesons (q q̄) and baryons (qqq) with their quark content.
 *
 * Masses and widths come from the PDG Review of Particle Physics (edition in
 * `PDG_EDITION`, see pdgData.ts). Quark content is by physical particle: a meson's
 * antiquark is written with the `bar` id ("dbar").
 *
 * Quantum-number conventions (PDG): strangeness S = -(n_s - n_sbar), charm C = n_c - n_cbar,
 * beauty B' = -(n_b - n_bbar) (so a b quark has B' = -1). They are written explicitly in the
 * table and the tests check them against the quark content of every component.
 *
 * Mixed states (π⁰, η, η′, ρ⁰, ω, φ, K_S, K_L) list every quark component with its amplitude;
 * a diagram may use ANY component. K_S and K_L mix K⁰ (d s̄) and K̄⁰ (s d̄), so their
 * strangeness is `null` (not defined). η/η′ use the quark-flavour mixing basis with
 * φ_mix = 39.3°; φ is taken as pure s s̄ (ideal mixing). Σ⁰ and Λ both have content uds: they
 * differ only in spin/isospin structure, which a quark diagram cannot show.
 */
import { antiparticle, barSymbol, type ParticleId } from './particles';
import { PDG } from './pdgData';

export type HadronId = string;

export interface HadronComponent {
  /** Physical quark/antiquark ids, e.g. ['u', 'dbar'] for π⁺. */
  quarks: ParticleId[];
  /** Amplitude (probability = amp²). */
  amp: number;
}

export interface Hadron {
  id: HadronId;
  name: string;
  /** Display symbol; "_x" marks a subscript (renderer converts it). */
  symbol: string;
  kind: 'meson' | 'baryon';
  components: HadronComponent[];
  /** Electric charge in units of e. */
  charge: number;
  baryon: number;
  /** null = not defined (K_S, K_L mix S = +1 and S = -1). */
  strangeness: number | null;
  charm: number;
  beauty: number;
  massMeV: number;
  /** Full width in MeV; null when the PDG lists none (K⁰, K̄⁰). */
  widthMeV: number | null;
  pdgId: number;
  antiId: HadronId;
  isAnti: boolean;
}

const HBAR_MEV_S = 6.582119569e-22;

/** Mean lifetime in seconds (ħ/Γ), or null if stable / no width. */
export function lifetimeSeconds(h: Hadron): number | null {
  return h.widthMeV && h.widthMeV > 0 ? HBAR_MEV_S / h.widthMeV : null;
}

const R2 = Math.SQRT1_2;
const MIX = (39.3 * Math.PI) / 180;
const cosM = Math.cos(MIX);
const sinM = Math.sin(MIX);

type Q = ParticleId[];
interface Spec {
  id: string;
  name: string;
  symbol: string;
  kind: 'meson' | 'baryon';
  comps: [Q, number][];
  /** charge, baryon, S, C, beauty */
  qn: [number, number, number | null, number, number];
  pdg: number;
  /** Antiparticle (omit for self-conjugate states). */
  anti?: { id: string; name: string; symbol?: string };
}

const m = (a: string, b: string): Q => [a, b];
const SPECS: Spec[] = [
  { id: 'pi+', name: 'pion (+)', symbol: 'π⁺', kind: 'meson', comps: [[m('u', 'dbar'), 1]], qn: [1, 0, 0, 0, 0], pdg: 211, anti: { id: 'pi-', name: 'pion (−)', symbol: 'π⁻' } },
  { id: 'pi0', name: 'neutral pion', symbol: 'π⁰', kind: 'meson', comps: [[m('u', 'ubar'), R2], [m('d', 'dbar'), -R2]], qn: [0, 0, 0, 0, 0], pdg: 111 },
  { id: 'eta', name: 'eta', symbol: 'η', kind: 'meson', comps: [[m('u', 'ubar'), cosM * R2], [m('d', 'dbar'), cosM * R2], [m('s', 'sbar'), -sinM]], qn: [0, 0, 0, 0, 0], pdg: 221 },
  { id: 'etap', name: 'eta prime', symbol: 'η′', kind: 'meson', comps: [[m('u', 'ubar'), sinM * R2], [m('d', 'dbar'), sinM * R2], [m('s', 'sbar'), cosM]], qn: [0, 0, 0, 0, 0], pdg: 331 },
  { id: 'rho+', name: 'rho (+)', symbol: 'ρ⁺', kind: 'meson', comps: [[m('u', 'dbar'), 1]], qn: [1, 0, 0, 0, 0], pdg: 213, anti: { id: 'rho-', name: 'rho (−)', symbol: 'ρ⁻' } },
  { id: 'rho0', name: 'neutral rho', symbol: 'ρ⁰', kind: 'meson', comps: [[m('u', 'ubar'), R2], [m('d', 'dbar'), -R2]], qn: [0, 0, 0, 0, 0], pdg: 113 },
  { id: 'omega', name: 'omega', symbol: 'ω', kind: 'meson', comps: [[m('u', 'ubar'), R2], [m('d', 'dbar'), R2]], qn: [0, 0, 0, 0, 0], pdg: 223 },
  { id: 'phi', name: 'phi', symbol: 'φ', kind: 'meson', comps: [[m('s', 'sbar'), 1]], qn: [0, 0, 0, 0, 0], pdg: 333 },
  { id: 'K+', name: 'kaon (+)', symbol: 'K⁺', kind: 'meson', comps: [[m('u', 'sbar'), 1]], qn: [1, 0, 1, 0, 0], pdg: 321, anti: { id: 'K-', name: 'kaon (−)', symbol: 'K⁻' } },
  { id: 'K0', name: 'neutral kaon', symbol: 'K⁰', kind: 'meson', comps: [[m('d', 'sbar'), 1]], qn: [0, 0, 1, 0, 0], pdg: 311, anti: { id: 'K0bar', name: 'anti-K⁰' } },
  { id: 'K_S', name: 'K-short', symbol: 'K_S', kind: 'meson', comps: [[m('d', 'sbar'), R2], [m('s', 'dbar'), R2]], qn: [0, 0, null, 0, 0], pdg: 310 },
  { id: 'K_L', name: 'K-long', symbol: 'K_L', kind: 'meson', comps: [[m('d', 'sbar'), R2], [m('s', 'dbar'), -R2]], qn: [0, 0, null, 0, 0], pdg: 130 },
  { id: 'Kst+', name: 'K* (892) (+)', symbol: 'K*⁺', kind: 'meson', comps: [[m('u', 'sbar'), 1]], qn: [1, 0, 1, 0, 0], pdg: 323, anti: { id: 'Kst-', name: 'K* (892) (−)', symbol: 'K*⁻' } },
  { id: 'Kst0', name: 'K* (892) neutral', symbol: 'K*⁰', kind: 'meson', comps: [[m('d', 'sbar'), 1]], qn: [0, 0, 1, 0, 0], pdg: 313, anti: { id: 'Kst0bar', name: 'anti-K* (892)' } },
  { id: 'D+', name: 'D meson (+)', symbol: 'D⁺', kind: 'meson', comps: [[m('c', 'dbar'), 1]], qn: [1, 0, 0, 1, 0], pdg: 411, anti: { id: 'D-', name: 'D meson (−)', symbol: 'D⁻' } },
  { id: 'D0', name: 'neutral D meson', symbol: 'D⁰', kind: 'meson', comps: [[m('c', 'ubar'), 1]], qn: [0, 0, 0, 1, 0], pdg: 421, anti: { id: 'D0bar', name: 'anti-D⁰' } },
  { id: 'Ds+', name: 'D_s meson (+)', symbol: 'D_s⁺', kind: 'meson', comps: [[m('c', 'sbar'), 1]], qn: [1, 0, 1, 1, 0], pdg: 431, anti: { id: 'Ds-', name: 'D_s meson (−)', symbol: 'D_s⁻' } },
  { id: 'B0', name: 'neutral B meson', symbol: 'B⁰', kind: 'meson', comps: [[m('d', 'bbar'), 1]], qn: [0, 0, 0, 0, 1], pdg: 511, anti: { id: 'B0bar', name: 'anti-B⁰' } },
  { id: 'Bs', name: 'B_s meson', symbol: 'B_s', kind: 'meson', comps: [[m('s', 'bbar'), 1]], qn: [0, 0, -1, 0, 1], pdg: 531, anti: { id: 'Bsbar', name: 'anti-B_s' } },
  { id: 'jpsi', name: 'J/psi', symbol: 'J/ψ', kind: 'meson', comps: [[m('c', 'cbar'), 1]], qn: [0, 0, 0, 0, 0], pdg: 443 },
  { id: 'p', name: 'proton', symbol: 'p', kind: 'baryon', comps: [[['u', 'u', 'd'], 1]], qn: [1, 1, 0, 0, 0], pdg: 2212, anti: { id: 'pbar', name: 'antiproton' } },
  { id: 'n', name: 'neutron', symbol: 'n', kind: 'baryon', comps: [[['u', 'd', 'd'], 1]], qn: [0, 1, 0, 0, 0], pdg: 2112, anti: { id: 'nbar', name: 'antineutron' } },
  { id: 'Lambda', name: 'Lambda', symbol: 'Λ', kind: 'baryon', comps: [[['u', 'd', 's'], 1]], qn: [0, 1, -1, 0, 0], pdg: 3122, anti: { id: 'Lambdabar', name: 'anti-Lambda' } },
  { id: 'Sigma0', name: 'Sigma zero', symbol: 'Σ⁰', kind: 'baryon', comps: [[['u', 'd', 's'], 1]], qn: [0, 1, -1, 0, 0], pdg: 3212, anti: { id: 'Sigma0bar', name: 'anti-Sigma zero' } },
  { id: 'Delta++', name: 'Delta (1232) ++', symbol: 'Δ⁺⁺', kind: 'baryon', comps: [[['u', 'u', 'u'], 1]], qn: [2, 1, 0, 0, 0], pdg: 2224, anti: { id: 'Delta--', name: 'anti-Delta (1232) −−', symbol: 'Δ̄⁻⁻' } },
];

const neg = (n: number) => (n === 0 ? 0 : -n);
const table = new Map<HadronId, Hadron>();

function build(s: Spec) {
  const pdg = PDG[s.pdg];
  if (!pdg) throw new Error(`No PDG data for ${s.id} (${s.pdg})`);
  const [charge, baryon, S, C, Bb] = s.qn;
  const base: Omit<Hadron, 'id' | 'name' | 'symbol' | 'components' | 'charge' | 'baryon' | 'strangeness' | 'charm' | 'beauty' | 'antiId' | 'isAnti'> = {
    kind: s.kind,
    massMeV: pdg.massMeV,
    widthMeV: pdg.widthMeV,
    pdgId: s.pdg,
  };
  const comps: HadronComponent[] = s.comps.map(([quarks, amp]) => ({ quarks, amp }));
  table.set(s.id, {
    ...base, id: s.id, name: s.name, symbol: s.symbol, components: comps,
    charge, baryon, strangeness: S, charm: C, beauty: Bb,
    antiId: s.anti?.id ?? s.id, isAnti: false,
  });
  if (s.anti) {
    table.set(s.anti.id, {
      ...base, id: s.anti.id, name: s.anti.name, symbol: s.anti.symbol ?? barSymbol(s.symbol),
      components: comps.map((c) => ({ quarks: c.quarks.map(antiparticle), amp: c.amp })),
      charge: neg(charge), baryon: neg(baryon), strangeness: S === null ? null : neg(S), charm: neg(C), beauty: neg(Bb),
      antiId: s.id, isAnti: true,
    });
  }
}
for (const s of SPECS) build(s);

export const HADRONS: ReadonlyMap<HadronId, Hadron> = table;
export const ALL_HADRON_IDS: readonly HadronId[] = Array.from(table.keys());

export function isHadronId(id: string): boolean {
  return table.has(id);
}

export function getHadron(id: HadronId): Hadron {
  const h = table.get(id);
  if (!h) throw new Error(`Unknown hadron id: ${id}`);
  return h;
}

export function antiHadron(id: HadronId): HadronId {
  return getHadron(id).antiId;
}

const key = (quarks: readonly ParticleId[]) => [...quarks].sort().join(',');

/** Does this multiset of physical quarks equal one of the hadron's components? */
export function hadronAcceptsContent(h: Hadron, quarks: readonly ParticleId[]): boolean {
  const k = key(quarks);
  return h.components.some((c) => key(c.quarks) === k);
}

/** Every table hadron that can be made from exactly these physical quarks. */
export function hadronsWithContent(quarks: readonly ParticleId[]): Hadron[] {
  return ALL_HADRON_IDS.map(getHadron).filter((h) => hadronAcceptsContent(h, quarks));
}

/** Quark content of one component as text, e.g. "u d̄". */
export function describeContent(quarks: readonly ParticleId[]): string {
  return quarks.map((q) => (q.endsWith('bar') ? barSymbol(q.slice(0, -3)) : q)).join(' ');
}
