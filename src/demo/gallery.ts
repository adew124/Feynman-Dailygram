import { validateDiagram } from '../engine/validator';
import { LIBRARY } from '../puzzle/library';
import { renderDiagram } from '../render/svg';

/** Library browser (#/library): every process with its solution, filterable by difficulty. */
export function mountGallery(app: HTMLElement): void {
  app.innerHTML = `
    <h1>Process library <span class="sub">(${LIBRARY.length})</span></h1>
    <p class="sub">All curated processes with their full diagrams. Straight + arrow = fermion, wavy = γ/Z/W,
    curly = gluon, dashed = Higgs. Time flows left → right.</p>
    <div class="toolbar">
      <label class="sub" for="lvl">Difficulty</label>
      <select id="lvl"><option value="0">All</option>${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}">${d}</option>`).join('')}</select>
    </div>
    <div id="gallery"></div>`;
  const gallery = document.getElementById('gallery')!;
  const lvl = document.getElementById('lvl') as HTMLSelectElement;

  function draw() {
    const level = Number(lvl.value);
    gallery.innerHTML = LIBRARY.filter((e) => !level || e.difficulty === level)
      .map((e) => {
        const ok = validateDiagram(e.diagram).valid;
        return `<div class="card" id="p-${e.id}">
          <h2>${e.name} <span class="pill">level ${e.difficulty}</span>${ok ? '' : ' <b style="color:var(--bad)">INVALID</b>'}</h2>
          ${renderDiagram(e.diagram, { revealKinds: true, ariaLabel: e.name })}
          <p class="sub">${e.explanation}</p>
          <p class="sub"><code>${e.id}</code></p>
        </div>`;
      })
      .join('');
  }
  lvl.addEventListener('change', draw);
  draw();
}
