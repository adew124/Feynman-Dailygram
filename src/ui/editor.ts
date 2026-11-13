import { checkModel } from '../editor/checks';
import {
  addEdge,
  addExternalLeg,
  addVertex,
  BOUNDS,
  deleteEdge,
  deleteNode,
  emptyModel,
  hiddenIds,
  LIMITS,
  modelFromDiagram,
  moveNode,
  sanitizeModel,
  setParticle,
  setText,
  toDiagram,
  toggleHidden,
  type EditorModel,
  type Result,
} from '../editor/model';
import { puzzleFromShared, shareUrl, type SharedData } from '../editor/share';
import { getParticle, type ParticleId } from '../engine/particles';
import { validateDiagram } from '../engine/validator';
import { vertexNumbers } from '../game/state';
import { LIBRARY } from '../puzzle/library';
import { buildScene, type Scene } from '../render/scene';
import { escapeXml, sceneToSvg } from '../render/svg';
import { lineKindForParticle, type EdgeView } from '../render/view';
import { loadDraftRaw, saveDraftRaw } from '../storage';
import { mountGame } from './game';
import { renderPalette, type PaletteTab } from './palette';

type Tool = 'move' | 'vertex' | 'line' | 'delete';
type Selection = { kind: 'node' | 'edge'; id: string } | null;

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'move', label: 'Move', hint: 'Drag points to move them. Tap a line to choose its particle.' },
  { id: 'vertex', label: 'Vertex', hint: 'Tap empty space to add a vertex (a point where 3 or 4 lines meet).' },
  { id: 'line', label: 'Line', hint: 'Drag from a vertex to another vertex, or into empty space to make an external leg.' },
  { id: 'delete', label: 'Delete', hint: 'Tap a point or a line to remove it.' },
];

/** Puzzle editor: build a diagram, pick particles, hide lines, share a link. */
export function mountEditor(root: HTMLElement): { destroy(): void } {
  let model: EditorModel = sanitizeModel(loadDraftRaw());
  let tool: Tool = 'move';
  let selection: Selection = null;
  let tab: PaletteTab = 'leptons';
  let anti = false;
  let undo: EditorModel[] = [];
  let toastTimer: number | undefined;
  let scene: Scene | null = null;
  let drag: { id: string; startModel: EditorModel; moved: boolean } | null = null;
  let drawing: { from: string; x: number; y: number } | null = null;
  let testGame: { destroy(): void } | null = null;

  root.innerHTML = `
    <div id="ed-main">
      <h1>Puzzle editor</h1>
      <p class="sub">Build a diagram, pick the particles, hide some lines, then share the link. Amber lines are hidden from the player.</p>
      <div class="toolbar">
        <select id="ed-template" aria-label="Start from a library process"></select>
      </div>
      <div class="tools" id="ed-tools"></div>
      <p class="sub tool-hint" id="ed-hint"></p>
      <div class="card diagram"><div id="ed-canvas" class="canvas"></div></div>
      <div class="card" id="ed-inspector"></div>
      <div class="card" id="ed-status"></div>
      <div class="card meta">
        <label class="field">Title <span class="sub">(optional)</span>
          <input id="ed-title" maxlength="${LIMITS.title}" placeholder="e.g. Can you spot the penguin?" />
        </label>
        <label class="field">Message <span class="sub">(optional)</span>
          <textarea id="ed-message" maxlength="${LIMITS.message}" rows="2" placeholder="A note for your friend"></textarea>
        </label>
      </div>
      <div class="row actions">
        <button id="ed-test-btn">Test play</button>
        <button class="primary" id="ed-share-btn">Copy share link</button>
      </div>
      <div id="ed-linkbox"></div>
      <div class="toast" id="ed-toast" role="status"></div>
    </div>
    <div id="ed-test" hidden>
      <button data-back>← Back to editor</button>
      <div id="ed-test-game"></div>
    </div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const canvas = $('ed-canvas');
  const titleInput = $<HTMLInputElement>('ed-title');
  const messageInput = $<HTMLTextAreaElement>('ed-message');
  const template = $<HTMLSelectElement>('ed-template');
  titleInput.value = model.title;
  messageInput.value = model.message;
  template.innerHTML =
    '<option value="">Start from a library process…</option><option value="__blank">Blank canvas</option>' +
    LIBRARY.map((e) => `<option value="${e.id}">Level ${e.difficulty} · ${escapeXml(e.name)}</option>`).join('');

  // ---------------------------------------------------------------- state helpers
  function save() {
    saveDraftRaw(model);
  }

  function flash(msg: string) {
    const t = $('ed-toast');
    t.textContent = msg;
    t.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
  }

  function pushUndo(snapshot: EditorModel = model) {
    undo.push(snapshot);
    if (undo.length > 60) undo.shift();
  }

  /** Apply a new model as one undoable step. */
  function commit(next: EditorModel) {
    if (next === model) return;
    pushUndo();
    model = next;
    save();
    fixSelection();
    renderAll();
  }

  function tryApply<T>(r: Result<T>): T | undefined {
    if (!r.ok) {
      flash(r.error);
      return undefined;
    }
    commit(r.model);
    return r.value;
  }

  function fixSelection() {
    if (!selection) return;
    const exists =
      selection.kind === 'node' ? model.nodes.some((n) => n.id === selection!.id) : model.edges.some((e) => e.id === selection!.id);
    if (!exists) selection = null;
  }

  // ---------------------------------------------------------------- canvas
  function canvasHtml(): string {
    const diagram = toDiagram(model);
    const v = validateDiagram(diagram);
    const nums = vertexNumbers(diagram);
    const views: Record<string, EdgeView> = {};
    for (const e of model.edges) {
      const sel = selection?.kind === 'edge' && selection.id === e.id;
      views[e.id] =
        e.p === null
          ? { kind: 'unknown', label: '?', state: sel ? 'selected' : 'empty' }
          : { kind: lineKindForParticle(e.p), label: getParticle(e.p).symbol, state: sel ? 'selected' : e.hidden ? 'partial' : 'normal' };
    }
    const vertexStates: Record<string, 'ok' | 'error'> = {};
    for (const [id, r] of Object.entries(v.vertices)) {
      if (r.status === 'ok') vertexStates[id] = 'ok';
      else if (r.status === 'invalid') vertexStates[id] = 'error';
    }
    const vertexLabels = Object.fromEntries(Object.entries(nums).map(([id, n]) => [id, String(n)]));
    scene = buildScene(diagram, views, { bounds: BOUNDS, padding: 40, vertexStates, vertexLabels, arrowOnUnknown: false });
    const t = scene.transform;
    const px = (x: number, y: number) => ({ x: t.offX + (x - t.minX) * t.scale, y: t.offY + (y - t.minY) * t.scale });

    let under = '<g class="grid">';
    for (let gx = BOUNDS.minX; gx <= BOUNDS.maxX; gx++) {
      for (let gy = BOUNDS.minY; gy <= BOUNDS.maxY; gy++) {
        const p = px(gx, gy);
        under += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.6"/>`;
      }
    }
    under += '</g>';

    let over = '<g class="handles">';
    for (const n of model.nodes) {
      const p = px(n.x, n.y);
      if (n.kind === 'external') over += `<circle class="ext-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"/>`;
      if (selection?.kind === 'node' && selection.id === n.id) {
        over += `<circle class="sel-ring" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${n.kind === 'vertex' ? 15 : 11}"/>`;
      }
      over += `<circle class="handle" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${n.kind === 'vertex' ? 22 : 18}" data-node="${n.id}"/>`;
    }
    if (drawing) {
      const from = model.nodes.find((n) => n.id === drawing!.from);
      if (from) {
        const a = px(from.x, from.y);
        over += `<line class="preview" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${drawing.x.toFixed(1)}" y2="${drawing.y.toFixed(1)}"/>`;
      }
    }
    over += '</g>';
    return sceneToSvg(scene, 'Diagram editor canvas', { under, over });
  }

  function renderCanvas() {
    canvas.innerHTML = canvasHtml();
  }

  function pointerToSvg(ev: PointerEvent): { x: number; y: number } {
    const svg = canvas.querySelector('svg')!;
    const r = svg.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) * scene!.width) / r.width, y: ((ev.clientY - r.top) * scene!.height) / r.height };
  }

  function svgToLayout(p: { x: number; y: number }): { x: number; y: number } {
    const t = scene!.transform;
    return { x: t.minX + (p.x - t.offX) / t.scale, y: t.minY + (p.y - t.offY) / t.scale };
  }

  function nearestNode(x: number, y: number, maxDist: number, exclude?: string) {
    let best: { id: string; kind: string; d: number } | null = null;
    for (const n of model.nodes) {
      if (n.id === exclude) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= maxDist && (!best || d < best.d)) best = { id: n.id, kind: n.kind, d };
    }
    return best;
  }

  /** Pointer capture keeps drags alive outside the canvas; it can throw for odd pointers, so never rely on it. */
  function capture(ev: PointerEvent) {
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  const onDown = (ev: PointerEvent) => {
    if (testGame) return;
    const el = ev.target as Element;
    const nodeId = el.closest('[data-node]')?.getAttribute('data-node') ?? null;
    const edgeId = el.closest('[data-edge-hit]')?.getAttribute('data-edge-hit') ?? null;
    const pos = svgToLayout(pointerToSvg(ev));

    if (tool === 'delete') {
      if (nodeId) commit(deleteNode(model, nodeId));
      else if (edgeId) commit(deleteEdge(model, edgeId));
      return;
    }
    if (nodeId) {
      const node = model.nodes.find((n) => n.id === nodeId)!;
      if (tool === 'line' && node.kind === 'vertex') {
        selection = { kind: 'node', id: nodeId };
        drawing = { from: nodeId, ...pointerToSvg(ev) };
        capture(ev);
        renderAll();
        return;
      }
      selection = { kind: 'node', id: nodeId };
      if (tool === 'move' || tool === 'line') {
        drag = { id: nodeId, startModel: model, moved: false };
        capture(ev);
      }
      renderAll();
      return;
    }
    if (edgeId) {
      selection = { kind: 'edge', id: edgeId };
      renderAll();
      return;
    }
    if (tool === 'vertex') {
      const id = tryApply(addVertex(model, pos.x, pos.y));
      if (id) {
        selection = { kind: 'node', id };
        renderAll();
      }
      return;
    }
    selection = null;
    renderAll();
  };

  const onMove = (ev: PointerEvent) => {
    if (drag) {
      const pos = svgToLayout(pointerToSvg(ev));
      const r = moveNode(model, drag.id, pos.x, pos.y);
      if (r.ok && r.model !== model) {
        drag.moved = true;
        model = r.model;
        renderCanvas();
      }
    } else if (drawing) {
      const p = pointerToSvg(ev);
      drawing.x = p.x;
      drawing.y = p.y;
      renderCanvas();
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (drag) {
      const d = drag;
      drag = null;
      if (d.moved) {
        pushUndo(d.startModel);
        save();
      }
      renderAll();
    } else if (drawing) {
      const from = drawing.from;
      drawing = null;
      const pos = svgToLayout(pointerToSvg(ev));
      const target = nearestNode(pos.x, pos.y, 0.6, from);
      if (target) {
        if (target.kind === 'vertex') {
          const id = tryApply(addEdge(model, from, target.id));
          if (id) selection = { kind: 'edge', id };
        } else {
          flash('That point already has a line.');
        }
      } else {
        const fromNode = model.nodes.find((n) => n.id === from)!;
        if (Math.hypot(pos.x - fromNode.x, pos.y - fromNode.y) >= 0.5) {
          const id = tryApply(addExternalLeg(model, from, pos.x, pos.y));
          if (id) selection = { kind: 'edge', id };
        }
      }
      renderAll();
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ---------------------------------------------------------------- panels
  function renderTools() {
    $('ed-tools').innerHTML =
      TOOLS.map(
        (t) => `<button class="tool${t.id === tool ? ' active' : ''}" data-tool="${t.id}" aria-pressed="${t.id === tool}">${t.label}</button>`,
      ).join('') +
      `<button data-undo ${undo.length ? '' : 'disabled'}>Undo</button><button class="ghost" data-clearall ${model.nodes.length ? '' : 'disabled'}>Clear</button>`;
    $('ed-hint').textContent = TOOLS.find((t) => t.id === tool)!.hint;
  }

  function describeEnd(id: string, nums: Record<string, number>): string {
    const n = model.nodes.find((q) => q.id === id)!;
    return n.kind === 'vertex' ? `vertex ${nums[id]}` : 'an external point';
  }

  function renderInspector() {
    const box = $('ed-inspector');
    const nums = vertexNumbers(toDiagram(model));
    if (!selection) {
      box.innerHTML = `<p class="sub">Nothing selected. ${
        model.nodes.length ? 'Tap a line to choose its particle or hide it.' : 'Start with <b>Vertex</b>, or pick a library process above.'
      }</p>`;
      return;
    }
    if (selection.kind === 'node') {
      const n = model.nodes.find((q) => q.id === selection!.id)!;
      const deg = model.edges.filter((e) => e.a === n.id || e.b === n.id).length;
      box.innerHTML = `<h3>${n.kind === 'vertex' ? `Vertex ${nums[n.id]}` : 'External point'}</h3>
        <p class="sub">${deg} line${deg === 1 ? '' : 's'} attached${n.kind === 'vertex' ? ' (a vertex needs 3 or 4)' : ''}.</p>
        <button data-del-node>Delete</button>`;
      return;
    }
    const e = model.edges.find((q) => q.id === selection!.id)!;
    box.innerHTML = `
      <h3>Line between ${describeEnd(e.a, nums)} and ${describeEnd(e.b, nums)}</h3>
      <p class="sub">Choose the particle you would write on this line, travelling forward in time (left to right).</p>
      ${renderPalette(tab, anti, e.p, true)}
      <div class="row">
        <button class="toggle${e.hidden ? ' on' : ''}" data-hide aria-pressed="${e.hidden}">${e.hidden ? '✓ ' : ''}Hidden from the player</button>
        <button class="ghost" data-del-edge>Delete line</button>
      </div>`;
  }

  function renderStatus() {
    const r = checkModel(model);
    const box = $('ed-status');
    const counts = `${model.nodes.filter((n) => n.kind === 'vertex').length} vertices · ${model.edges.length} lines · ${hiddenIds(model).length} hidden`;
    if (r.ok) {
      box.innerHTML = `<p class="ok-line">✓ Ready to share <span class="sub">(${counts}; ${r.solutions === null ? '' : `${r.solutions} valid answer${r.solutions === 1 ? '' : 's'}`})</span></p>
        ${r.warnings.map((w) => `<p class="warn-line">⚠ ${escapeXml(w)}</p>`).join('')}`;
    } else {
      const shown = r.errors.slice(0, 6);
      box.innerHTML = `<p class="sub">${counts}</p><ul class="problems">${shown.map((x) => `<li>${escapeXml(x)}</li>`).join('')}</ul>${
        r.errors.length > shown.length ? `<p class="sub">…and ${r.errors.length - shown.length} more.</p>` : ''
      }`;
    }
    ($('ed-test-btn') as HTMLButtonElement).disabled = !r.ok;
    ($('ed-share-btn') as HTMLButtonElement).disabled = !r.ok;
    return r;
  }

  function renderAll() {
    fixSelection();
    renderTools();
    renderCanvas();
    renderInspector();
    renderStatus();
  }

  // ---------------------------------------------------------------- clicks
  function currentData(): SharedData | null {
    const r = checkModel(model);
    if (!r.ok) return null;
    return { title: model.title.trim(), message: model.message.trim(), diagram: r.diagram, hidden: hiddenIds(model) };
  }

  async function doShare() {
    const data = currentData();
    if (!data) return;
    const url = shareUrl(data, location.origin + location.pathname);
    $('ed-linkbox').innerHTML = `<div class="card"><p class="sub">Send this link to a friend (${url.length} characters):</p>
      <input class="linkfield" readonly value="${escapeXml(url)}" aria-label="Share link" />
      <p class="sub"><a href="${escapeXml(url)}">Open it</a> to see what your friend will see.</p></div>`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: data.title || 'Feynman puzzle', url });
        return;
      }
    } catch {
      return; // share sheet cancelled
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('Link copied!');
    } catch {
      const f = root.querySelector<HTMLInputElement>('.linkfield');
      f?.select();
      flash('Select the link and copy it.');
    }
  }

  function startTest() {
    const data = currentData();
    if (!data) return;
    const puzzle = puzzleFromShared(data, 'preview');
    $('ed-main').hidden = true;
    const box = $('ed-test');
    box.hidden = false;
    testGame = mountGame($('ed-test-game'), puzzle, {
      shareLabel: 'Feynman Puzzle',
      shareUrl: shareUrl(data, location.origin + location.pathname),
    });
  }

  function stopTest() {
    testGame?.destroy();
    testGame = null;
    $('ed-test').hidden = true;
    $('ed-main').hidden = false;
    renderAll();
  }

  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    const toolBtn = t.closest<HTMLElement>('[data-tool]');
    if (toolBtn) {
      tool = toolBtn.dataset.tool as Tool;
      drawing = null;
      renderTools();
      return;
    }
    if (t.closest('[data-undo]')) {
      const prev = undo.pop();
      if (prev) {
        model = prev;
        save();
        renderAll();
      }
      return;
    }
    if (t.closest('[data-clearall]')) {
      if (model.nodes.length && window.confirm('Clear the whole diagram?')) {
        selection = null;
        commit({ ...emptyModel(), title: model.title, message: model.message });
      }
      return;
    }
    if (t.closest('[data-del-node]') && selection?.kind === 'node') {
      commit(deleteNode(model, selection.id));
      return;
    }
    if (t.closest('[data-del-edge]') && selection?.kind === 'edge') {
      commit(deleteEdge(model, selection.id));
      return;
    }
    if (t.closest('[data-hide]') && selection?.kind === 'edge') {
      commit(toggleHidden(model, selection.id));
      return;
    }
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab as PaletteTab;
      renderInspector();
      return;
    }
    if (t.closest('[data-anti]')) {
      anti = !anti;
      renderInspector();
      return;
    }
    const pbtn = t.closest<HTMLElement>('[data-particle]');
    if (pbtn && selection?.kind === 'edge') {
      commit(setParticle(model, selection.id, pbtn.dataset.particle as ParticleId));
      return;
    }
    if (t.closest('.palette [data-clear]') && selection?.kind === 'edge') {
      commit(setParticle(model, selection.id, null));
      return;
    }
    if (t.closest('#ed-share-btn')) void doShare();
    else if (t.closest('#ed-test-btn')) startTest();
    else if (t.closest('[data-back]')) stopTest();
  };
  root.addEventListener('click', onClick);

  titleInput.addEventListener('input', () => {
    model = setText(model, titleInput.value, model.message);
    save();
  });
  messageInput.addEventListener('input', () => {
    model = setText(model, model.title, messageInput.value);
    save();
  });
  template.addEventListener('change', () => {
    const id = template.value;
    template.value = '';
    if (!id) return;
    if (model.nodes.length && !window.confirm('Replace the current diagram?')) return;
    selection = null;
    if (id === '__blank') {
      commit({ ...emptyModel(), title: model.title, message: model.message });
      return;
    }
    const entry = LIBRARY.find((e) => e.id === id)!;
    const m = modelFromDiagram(entry.diagram, entry.hideSets?.[0] ?? [], model.title);
    m.message = model.message;
    commit(m);
  });

  const onKey = (ev: KeyboardEvent) => {
    if (testGame || !selection) return;
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      commit(selection.kind === 'node' ? deleteNode(model, selection.id) : deleteEdge(model, selection.id));
    }
  };
  window.addEventListener('keydown', onKey);

  renderAll();

  return {
    destroy() {
      window.clearTimeout(toastTimer);
      window.removeEventListener('keydown', onKey);
      testGame?.destroy();
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    },
  };
}
