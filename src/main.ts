import { validateDiagram } from './engine/validator';
import { EXAMPLES } from './demo/examples';
import { onEdgeTap, renderDiagram } from './render/svg';
import './style.css';

// Phase 2 demo gallery: shows each example with hidden edges; tap a hidden edge
// to select it (full gameplay arrives in phase 3).
const app = document.getElementById('app')!;
app.innerHTML = `
  <h1>Renderer demo</h1>
  <p class="sub">Phase 2 — straight+arrow = fermion, wavy = γ/W/Z, curly = gluon, dashed = Higgs.
  Tap a dotted (hidden) edge to select it. Time flows left → right.</p>
  <label class="sub"><input type="checkbox" id="reveal"> reveal line styles on hidden edges</label>
  <label class="sub"><input type="checkbox" id="solved"> show solution</label>
  <div id="gallery"></div>
`;

const selected: Record<string, string | null> = {};
const gallery = document.getElementById('gallery')!;
const reveal = document.getElementById('reveal') as HTMLInputElement;
const solved = document.getElementById('solved') as HTMLInputElement;

function draw() {
  gallery.innerHTML = '';
  for (const ex of EXAMPLES) {
    const card = document.createElement('div');
    card.className = 'card';
    const ok = validateDiagram(ex.diagram).valid;
    const answers = solved.checked
      ? Object.fromEntries(ex.hidden.map((id) => [id, ex.diagram.edges.find((e) => e.id === id)!.particle]))
      : {};
    card.innerHTML =
      `<h2>${ex.title} <span class="sub">${ok ? '(valid)' : '(INVALID!)'}</span></h2>` +
      renderDiagram(ex.diagram, {
        hidden: ex.hidden,
        answers,
        selected: selected[ex.id] ?? null,
        revealKinds: reveal.checked,
        ariaLabel: ex.title,
      });
    onEdgeTap(card, (edgeId) => {
      if (ex.hidden.includes(edgeId)) {
        selected[ex.id] = edgeId;
        draw();
      }
    });
    gallery.appendChild(card);
  }
}
reveal.addEventListener('change', draw);
solved.addEventListener('change', draw);
draw();
