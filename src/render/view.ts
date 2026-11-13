import { getHadron } from '../engine/hadrons';
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
  /** Hadron groups the player must identify: their quark legs are shown as "?". */
  hiddenGroups?: readonly string[];
  /** The player's hadron choice per hidden group (hadron id). */
  groupAnswers?: Record<string, string | null | undefined>;
  /** Display state per hidden group (empty/filled/selected/correct/partial/wrong). */
  groupStates?: Record<string, EdgeState>;
}

/** What to draw for one hadron group (the outline around its quark lines). */
export interface GroupView {
  /** Hadron symbol, or "?" while hidden and unanswered. */
  label: string;
  state: EdgeState;
  hidden: boolean;
}

export function buildGroupViews(d: Diagram, o: ViewOptions = {}): Record<string, GroupView> {
  const hidden = new Set(o.hiddenGroups ?? []);
  const out: Record<string, GroupView> = {};
  for (const g of d.hadrons ?? []) {
    if (hidden.has(g.id)) {
      const ans = o.groupAnswers?.[g.id] ?? null;
      out[g.id] = {
        label: ans ? getHadron(ans).symbol : '?',
        state: o.groupStates?.[g.id] ?? (ans ? 'filled' : 'empty'),
        hidden: true,
      };
    } else {
      out[g.id] = { label: g.hadron ? getHadron(g.hadron).symbol : '?', state: 'normal', hidden: false };
    }
  }
  return out;
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
  const groupViews = buildGroupViews(d, o);
  // quark legs of hidden hadron groups: unknown line, "?" label, the group's state
  const legState = new Map<string, EdgeState>();
  for (const g of d.hadrons ?? []) {
    if (!groupViews[g.id].hidden) continue;
    for (const nid of g.nodes) {
      for (const e of d.edges) if (e.from === nid || e.to === nid) legState.set(e.id, groupViews[g.id].state);
    }
  }
  for (const e of d.edges) {
    const gs = legState.get(e.id);
    if (gs && !hidden.has(e.id)) {
      out[e.id] = { kind: 'unknown', label: '?', state: gs };
      continue;
    }
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
