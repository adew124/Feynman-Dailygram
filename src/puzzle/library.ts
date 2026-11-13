import { betaDecay, eeToMuMu, eeToQQg, kaonBox, penguinBtoSGamma } from '../demo/examples';
import type { ProcessEntry } from './types';

/**
 * Curated process library. Phase 3 ships a starter set; phase 4 grows it to 40+.
 * Layout convention: x = time (left to right), y grows downward.
 */
export const LIBRARY: ProcessEntry[] = [
  {
    id: 'ee-mumu',
    name: 'e⁺e⁻ → μ⁺μ⁻',
    difficulty: 1,
    explanation:
      'An electron and positron annihilate into a virtual photon, which converts into a muon–antimuon pair. At higher energies the Z boson also contributes through the same diagram topology.',
    diagram: eeToMuMu(),
    hideSets: [['prop'], ['prop', 'amu_out'], ['mu_out', 'amu_out']],
  },
  {
    id: 'beta-minus',
    name: 'β⁻ decay (quark level)',
    difficulty: 2,
    explanation:
      'A down quark turns into an up quark by emitting a virtual W⁻, which becomes an electron and an electron antineutrino. Charge and electron lepton number are conserved at each vertex.',
    diagram: betaDecay(),
    hideSets: [['W'], ['nubar'], ['W', 'nubar']],
  },
  {
    id: 'ee-qqg',
    name: 'e⁺e⁻ → q q̄ g',
    difficulty: 3,
    explanation:
      'Annihilation produces a quark–antiquark pair, and one of the quarks radiates a gluon. Three-jet events like this were the first direct evidence for the gluon.',
    diagram: eeToQQg(),
    hideSets: [['glu'], ['glu', 'q1'], ['gam', 'glu']],
  },
  {
    id: 'penguin-bsg',
    name: 'Penguin decay b → s γ',
    difficulty: 6,
    explanation:
      'A bottom quark changes to a strange quark through a loop containing a W boson and a top quark, with a photon radiated from the loop. Neutral-current flavor changes are forbidden at tree level, so they proceed only through such loops.',
    diagram: penguinBtoSGamma(),
    hideSets: [['t2', 'W'], ['W'], ['t1', 'ph']],
  },
  {
    id: 'kaon-box',
    name: 'K⁰–K̄⁰ box diagram',
    difficulty: 7,
    explanation:
      'Two W bosons and two up-type quarks in a box let a K⁰ (d s̄) turn into its antiparticle K̄⁰ (s d̄), changing strangeness by two units. This mixing predicted the charm quark mass before charm was discovered.',
    diagram: kaonBox(),
    hideSets: [['up1', 'W_r'], ['up1', 'W_r', 'dbar_out'], ['W_l', 'up2']],
  },
];
