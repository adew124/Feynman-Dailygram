import type { ProcessEntry } from './types';

export type Scope = 'both' | 'scattering' | 'decay';
export type DecayClass = 'any' | 'allowed' | 'suppressed';
export type PracticeType = 'mixed' | 'fill' | 'forbidden' | 'classify';

export interface PracticeFilter {
  /** 0 = any difficulty, otherwise 1..7. */
  level: number;
  scope: Scope;
  cls: DecayClass;
  type: PracticeType;
}

/**
 * Library entries that can be used for the practice settings.
 *  - scope: scattering processes, decays, or both;
 *  - cls: only decays classified as allowed / suppressed (implies decays);
 *  - type "classify" needs a classified decay; "forbidden" needs a diagram without hadrons.
 */
export function practicePool(library: readonly ProcessEntry[], f: PracticeFilter): ProcessEntry[] {
  return library.filter((e) => {
    if (f.level !== 0 && e.difficulty !== f.level) return false;
    if (f.cls !== 'any') {
      if (e.decay?.category !== f.cls) return false;
    } else if (f.scope === 'scattering' ? e.isDecay : f.scope === 'decay' ? !e.isDecay : false) {
      return false;
    }
    if (f.type === 'classify' && !e.decay) return false;
    if (f.type === 'forbidden' && e.diagram.hadrons?.length) return false;
    return true;
  });
}
