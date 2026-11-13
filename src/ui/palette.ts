import { antiparticle, getParticle, type ParticleId } from '../engine/particles';
import { escapeXml } from '../render/svg';

export type PaletteTab = 'leptons' | 'quarks' | 'bosons';

export const PALETTE_TABS: { id: PaletteTab; label: string }[] = [
  { id: 'leptons', label: 'Leptons' },
  { id: 'quarks', label: 'Quarks' },
  { id: 'bosons', label: 'Bosons' },
];

const BASE: Record<PaletteTab, ParticleId[]> = {
  leptons: ['e-', 'mu-', 'tau-', 'nu_e', 'nu_mu', 'nu_tau'],
  quarks: ['u', 'd', 'c', 's', 't', 'b'],
  // W+ and W- are listed explicitly; the antiparticle toggle does not apply to bosons.
  bosons: ['gamma', 'Z', 'W+', 'W-', 'g', 'H'],
};

/** Physical particle ids shown for a tab (antiparticles when `anti`; fermions only). */
export function paletteIds(tab: PaletteTab, anti: boolean): ParticleId[] {
  const ids = BASE[tab];
  if (tab === 'bosons' || !anti) return ids;
  return ids.map(antiparticle);
}

/** "ν_μ" -> "ν<sub>μ</sub>" for HTML contexts. */
export function symbolToHtml(sym: string): string {
  const chars = Array.from(sym);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '_' && i + 1 < chars.length) {
      out += `<sub>${escapeXml(chars[i + 1])}</sub>`;
      i++;
    } else out += escapeXml(chars[i]);
  }
  return out;
}

export function renderPalette(tab: PaletteTab, anti: boolean, current: ParticleId | null, enabled: boolean): string {
  const tabs = PALETTE_TABS.map(
    (t) =>
      `<button class="tab${t.id === tab ? ' active' : ''}" data-tab="${t.id}" role="tab" aria-selected="${t.id === tab}">${t.label}</button>`,
  ).join('');
  const antiDisabled = tab === 'bosons';
  const cells = paletteIds(tab, anti)
    .map((id) => {
      const p = getParticle(id);
      const sel = current === id ? ' chosen' : '';
      return `<button class="pbtn${sel}" data-particle="${id}" aria-label="${escapeXml(p.name)}" title="${escapeXml(p.name)}" ${enabled ? '' : 'disabled'}>${symbolToHtml(p.symbol)}</button>`;
    })
    .join('');
  return `
    <div class="palette">
      <div class="tabs" role="tablist">${tabs}
        <button class="anti${anti && !antiDisabled ? ' on' : ''}" data-anti ${antiDisabled ? 'disabled' : ''} aria-pressed="${anti && !antiDisabled}">anti</button>
      </div>
      <div class="pgrid">${cells}</div>
      <button class="clear" data-clear ${enabled && current ? '' : 'disabled'}>Clear this edge</button>
    </div>`;
}
