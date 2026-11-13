import { getParticle, type ParticleId } from './particles';
import { PDG } from './pdgData';

/**
 * Masses (MeV) of the fundamental particles, PDG values (see pdgData.ts).
 * Quark masses are the PDG running masses (u, d, s: MS-bar at 2 GeV; c, b: MS-bar m(m); t: direct
 * measurement). They only matter for decays whose products include a bare quark (t → b W, H → b b̄).
 * Neutrinos are massless here and gluons/photons have zero mass.
 */
const BY_ID: Record<ParticleId, number> = {
  'e-': PDG[11].massMeV, 'mu-': PDG[13].massMeV, 'tau-': PDG[15].massMeV,
  nu_e: 0, nu_mu: 0, nu_tau: 0,
  d: PDG[1].massMeV, u: PDG[2].massMeV, s: PDG[3].massMeV,
  c: PDG[4].massMeV, b: PDG[5].massMeV, t: PDG[6].massMeV,
  gamma: PDG[22].massMeV, g: 0, Z: PDG[23].massMeV, 'W+': PDG[24].massMeV, H: PDG[25].massMeV,
};

/** Mass of a fundamental particle or its antiparticle, in MeV. */
export function fundamentalMassMeV(id: ParticleId): number {
  const p = getParticle(id);
  const v = BY_ID[p.isAnti ? p.antiId : p.id];
  if (v === undefined) throw new Error(`No mass for ${id}`);
  return v;
}
