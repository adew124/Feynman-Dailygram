import { validateDiagram } from '../engine/validator';
import { findProcess, LIBRARY } from '../puzzle/library';
import type { DecayInfo } from '../puzzle/types';
import { escapeXml, renderDiagram } from '../render/svg';

const REASON: Record<string, string> = {
  'cabibbo-single': 'singly Cabibbo-suppressed',
  'cabibbo-double': 'doubly Cabibbo-suppressed',
  'ckm-b-u': 'b → u instead of b → c',
  helicity: 'helicity',
  ozi: 'OZI',
  color: 'color',
  'loop-gim': 'loop / GIM',
  isospin: 'isospin / G-parity',
};

function decayLine(d: DecayInfo): string {
  const kind = d.category === 'allowed' ? 'allowed' : 'suppressed';
  const why = d.reasons.length ? ` — ${d.reasons.map((r) => REASON[r] ?? r).join(', ')}` : '';
  const cmp = d.compareWith ? findProcess(d.compareWith) : undefined;
  return `<p class="sub"><b>${kind}</b> (${d.interaction})${escapeXml(why)} · BR ${escapeXml(d.brText)}${cmp ? ` · compare with <a href="#p-${cmp.id}">${escapeXml(cmp.name)}</a>` : ''}</p>`;
}

/** Library browser (#/library): every process with its solution, filterable by difficulty. */
export function mountGallery(app: HTMLElement): void {
  app.innerHTML = `
    <h1>Process library <span class="sub">(${LIBRARY.length})</span></h1>
    <p class="sub">All curated processes with their full diagrams. Straight + arrow = fermion, wavy = γ/Z/W,
    curly = gluon, dashed = Higgs. Time flows left → right.</p>
    <div class="toolbar">
      <label class="sub" for="lvl">Difficulty</label>
      <select id="lvl"><option value="0">All</option>${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}">${d}</option>`).join('')}</select>
      <label class="sub" for="kind">Type</label>
      <select id="kind"><option value="all">All</option><option value="scattering">Scattering</option><option value="decay">Decays</option><option value="allowed">Allowed decays</option><option value="suppressed">Suppressed decays</option></select>
    </div>
    <div id="gallery"></div>`;
  const gallery = document.getElementById('gallery')!;
  const lvl = document.getElementById('lvl') as HTMLSelectElement;
  const kind = document.getElementById('kind') as HTMLSelectElement;

  function draw() {
    const level = Number(lvl.value);
    const k = kind.value;
    const keep = (e: (typeof LIBRARY)[number]) =>
      k === 'all' ||
      (k === 'scattering' && !e.isDecay) ||
      (k === 'decay' && e.isDecay) ||
      ((k === 'allowed' || k === 'suppressed') && e.decay?.category === k);
    gallery.innerHTML = LIBRARY.filter((e) => (!level || e.difficulty === level) && keep(e))
      .map((e) => {
        const ok = validateDiagram(e.diagram).valid;
        return `<div class="card" id="p-${e.id}">
          <h2>${e.name} <span class="pill">level ${e.difficulty}</span>${ok ? '' : ' <b style="color:var(--bad)">INVALID</b>'}</h2>
          ${renderDiagram(e.diagram, { revealKinds: true, ariaLabel: e.name })}
          ${e.decay ? decayLine(e.decay) : ''}
          <p class="sub">${e.explanation}</p>
          <p class="sub"><code>${e.id}</code></p>
        </div>`;
      })
      .join('');
  }
  lvl.addEventListener('change', draw);
  kind.addEventListener('change', draw);
  draw();
}
