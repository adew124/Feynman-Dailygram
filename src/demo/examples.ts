import type { Diagram } from '../engine/types';

/** Hand-built diagrams used by the renderer demo and tests. y grows downward. */
export interface Example {
  id: string;
  title: string;
  diagram: Diagram;
  /** Edge ids hidden in the demo. */
  hidden: string[];
}

/** e- e+ -> gamma* -> mu- mu+  (s-channel). */
export function eeToMuMu(): Diagram {
  return {
    nodes: [
      { id: 'a', kind: 'external', x: 0, y: -1 },
      { id: 'b', kind: 'external', x: 0, y: 1 },
      { id: 'c', kind: 'external', x: 3, y: -1 },
      { id: 'd', kind: 'external', x: 3, y: 1 },
      { id: 'v1', kind: 'vertex', x: 1, y: 0 },
      { id: 'v2', kind: 'vertex', x: 2, y: 0 },
    ],
    edges: [
      { id: 'e_in', from: 'a', to: 'v1', particle: 'e-' }, // incoming electron, arrow forward
      { id: 'p_in', from: 'v1', to: 'b', particle: 'e-' }, // incoming positron = e- arrow backward
      { id: 'prop', from: 'v1', to: 'v2', particle: 'gamma' },
      { id: 'mu_out', from: 'v2', to: 'c', particle: 'mu-' }, // outgoing mu-
      { id: 'amu_out', from: 'd', to: 'v2', particle: 'mu-' }, // outgoing mu+ = mu- arrow backward
    ],
  };
}

/** Quark-level beta decay: d -> u + e- + anti-nu_e via W-. */
export function betaDecay(): Diagram {
  return {
    nodes: [
      { id: 'din', kind: 'external', x: 0, y: -1 },
      { id: 'uout', kind: 'external', x: 3, y: -1 },
      { id: 'eout', kind: 'external', x: 3, y: 1 },
      { id: 'nuout', kind: 'external', x: 3, y: 2 },
      { id: 'v1', kind: 'vertex', x: 1, y: 0 },
      { id: 'v2', kind: 'vertex', x: 2, y: 1 },
    ],
    edges: [
      { id: 'd', from: 'din', to: 'v1', particle: 'd' },
      { id: 'u', from: 'v1', to: 'uout', particle: 'u' },
      { id: 'W', from: 'v1', to: 'v2', particle: 'W-' },
      { id: 'e', from: 'v2', to: 'eout', particle: 'e-' },
      { id: 'nubar', from: 'nuout', to: 'v2', particle: 'nu_e' }, // arrow backward => anti-nu_e
    ],
  };
}

/** e+ e- -> gamma* -> u ubar g (gluon bremsstrahlung). */
export function eeToQQg(): Diagram {
  return {
    nodes: [
      { id: 'a', kind: 'external', x: 0, y: -1 },
      { id: 'b', kind: 'external', x: 0, y: 1 },
      { id: 'v1', kind: 'vertex', x: 1, y: 0 },
      { id: 'v2', kind: 'vertex', x: 2.2, y: 0 },
      { id: 'v3', kind: 'vertex', x: 3.2, y: -0.8 },
      { id: 'q', kind: 'external', x: 4.5, y: -1.6 },
      { id: 'gl', kind: 'external', x: 4.5, y: -0.1 },
      { id: 'qb', kind: 'external', x: 4.5, y: 1.6 },
    ],
    edges: [
      { id: 'e_in', from: 'a', to: 'v1', particle: 'e-' },
      { id: 'p_in', from: 'v1', to: 'b', particle: 'e-' },
      { id: 'gam', from: 'v1', to: 'v2', particle: 'gamma' },
      { id: 'q1', from: 'v2', to: 'v3', particle: 'u' },
      { id: 'q_out', from: 'v3', to: 'q', particle: 'u' },
      { id: 'glu', from: 'v3', to: 'gl', particle: 'g' },
      { id: 'qbar_out', from: 'qb', to: 'v2', particle: 'u' },
    ],
  };
}

/** Penguin diagram b -> s gamma: top-W loop with a photon off the top quark. */
export function penguinBtoSGamma(): Diagram {
  return {
    nodes: [
      { id: 'bx', kind: 'external', x: 0, y: 0 },
      { id: 'sx', kind: 'external', x: 4, y: 0 },
      { id: 'px', kind: 'external', x: 2, y: -2.2 },
      { id: 'v1', kind: 'vertex', x: 1, y: 0 },
      { id: 'v2', kind: 'vertex', x: 2, y: -0.9 },
      { id: 'v3', kind: 'vertex', x: 3, y: 0 },
    ],
    edges: [
      { id: 'b_in', from: 'bx', to: 'v1', particle: 'b' },
      { id: 't1', from: 'v1', to: 'v2', particle: 't' },
      { id: 't2', from: 'v2', to: 'v3', particle: 't' },
      { id: 'W', from: 'v1', to: 'v3', particle: 'W-', bend: 0.55 },
      { id: 's_out', from: 'v3', to: 'sx', particle: 's' },
      { id: 'ph', from: 'v2', to: 'px', particle: 'gamma' },
    ],
  };
}

/** Box diagram for K0 -> K0bar mixing (d sbar -> s dbar) with two W and two up-type quarks. */
export function kaonBox(): Diagram {
  return {
    nodes: [
      { id: 'dx', kind: 'external', x: 0, y: 0 },
      { id: 'sx', kind: 'external', x: 4, y: 0 },
      { id: 'sbx', kind: 'external', x: 0, y: 2 },
      { id: 'dbx', kind: 'external', x: 4, y: 2 },
      { id: 'v1', kind: 'vertex', x: 1, y: 0 },
      { id: 'v2', kind: 'vertex', x: 3, y: 0 },
      { id: 'v3', kind: 'vertex', x: 1, y: 2 },
      { id: 'v4', kind: 'vertex', x: 3, y: 2 },
    ],
    edges: [
      { id: 'd_in', from: 'dx', to: 'v1', particle: 'd' },
      { id: 'up1', from: 'v1', to: 'v2', particle: 't' },
      { id: 's_out', from: 'v2', to: 'sx', particle: 's' },
      { id: 'W_l', from: 'v1', to: 'v3', particle: 'W-' },
      { id: 'W_r', from: 'v4', to: 'v2', particle: 'W-' },
      { id: 'up2', from: 'v4', to: 'v3', particle: 't' },
      { id: 'dbar_out', from: 'dbx', to: 'v4', particle: 'd' }, // arrow backward => outgoing dbar
      { id: 'sbar_in', from: 'v3', to: 'sbx', particle: 's' }, // arrow backward => incoming sbar
    ],
  };
}

export const EXAMPLES: Example[] = [
  { id: 'eemm', title: 'e⁺e⁻ → μ⁺μ⁻', diagram: eeToMuMu(), hidden: ['prop', 'amu_out'] },
  { id: 'beta', title: 'Beta decay (quark level)', diagram: betaDecay(), hidden: ['W', 'nubar'] },
  { id: 'qqg', title: 'e⁺e⁻ → q q̄ g', diagram: eeToQQg(), hidden: ['glu', 'q1'] },
  { id: 'peng', title: 'Penguin b → s γ', diagram: penguinBtoSGamma(), hidden: ['t2', 'W'] },
  { id: 'box', title: 'K⁰–K̄⁰ box diagram', diagram: kaonBox(), hidden: ['up1', 'W_r', 'dbar_out'] },
];
