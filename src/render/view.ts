import { physicalParticle } from '../engine/orientation';
import { getParticle, type ParticleId } from '../engine/particles';
import type { Diagram } from '../engine/types';
import type { LineKind } from './lines';

export type EdgeState = 'normal' | 'empty' | 'filled' | 'selected' | 'correct' | 'partial' | 'wrong';

/** What to draw for one edge. */
export interface EdgeView {
  kind: LineKind;
  /** Display label in symbol form (see symbolToTspans), or null for none. */
  label: string | null;
  state: EdgeState;
}

export function lineKindForParticle(id: ParticleId): LineKind {
  const p = getParticle(id);
  if (p.kind === 'lepton' || p.kind === 'quark') return 'fermion';
  if (p.kind === 'higgs') return 'higgs';
  if (id === 'g') return 'gluon';
  return 'photon'; // gamma, Z, W+-
}

export interface ViewOptions {
  /** Edge ids the player must fill in. */
  hidden?: readonly string[];
  /** Player's answers (stored, along-the-arrow convention). */
  answers?: Record<string, ParticleId | null | undefined>;
  selected?: string | null;
  /** Keep the true line style (wavy/curly/...) on hidden edges as a free hint. */
  revealKinds?: boolean;
  wrong?: readonly string[];
  correct?: readonly string[];
  partial?: readonly string[];
}

/**
 * Build per-edge views from a diagram. Revealed edges show their PHYSICAL
 * particle (a backward-arrow e- shows as e+). Hidden edges show "?" until the
 * player picks something; an answer's label uses the same arrow-vs-time rule
 * as the engine.
 */
export function buildEdgeViews(d: Diagram, o: ViewOptions = {}): Record<string, EdgeView> {
  const hidden = new Set(o.hidden ?? []);
  const wrong = new Set(o.wrong ?? []);
  const correct = new Set(o.correct ?? []);
  const partial = new Set(o.partial ?? []);
  const out: Record<string, EdgeView> = {};
  for (const e of d.edges) {
    let state: EdgeState = 'normal';
    let label: string | null = null;
    let kind: LineKind = e.particle ? lineKindForParticle(e.particle) : 'unknown';
    if (hidden.has(e.id)) {
      const ans = o.answers?.[e.id] ?? null;
      if (ans) {
        label = getParticle(physicalParticle(d, { ...e, particle: ans })!).symbol;
        kind = lineKindForParticle(ans);
        state = 'filled';
      } else {
        label = '?';
        state = 'empty';
        if (!o.revealKinds) kind = 'unknown';
      }
      if (o.selected === e.id) state = 'selected';
      if (partial.has(e.id)) state = 'partial';
      if (wrong.has(e.id)) state = 'wrong';
      if (correct.has(e.id)) state = 'correct';
    } else if (e.particle) {
      label = getParticle(physicalParticle(d, e)!).symbol;
    }
    out[e.id] = { kind, label, state };
  }
  return out;
}
