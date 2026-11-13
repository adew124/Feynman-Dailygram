import { physicalParticle } from '../engine/orientation';
import { getParticle, type ParticleId } from '../engine/particles';
import {
  forbiddenHint,
  forbiddenReason,
  forbiddenShareText,
  giveUpForbidden,
  guessVertex,
  newForbidden,
  type ForbiddenState,
} from '../game/forbidden';
import { MAX_ATTEMPTS, vertexNumbers } from '../game/state';
import type { Puzzle } from '../puzzle/types';
import { buildScene } from '../render/scene';
import { escapeXml, sceneToSvg } from '../render/svg';
import { buildEdgeViews } from '../render/view';

export interface ForbiddenHooks {
  finishedExtra?(): string;
  shareLabel?: string;
}

const DIFF = ['', 'Very easy', 'Easy', 'Easy+', 'Medium', 'Hard', 'Harder', 'Expert'];

/** "Spot the forbidden vertex": tap the one vertex that breaks a rule. */
export function mountForbidden(root: HTMLElement, puzzle: Puzzle, hooks: ForbiddenHooks = {}): { destroy(): void } {
  const info = puzzle.forbidden!;
  const nums = vertexNumbers(puzzle.diagram);
  let state: ForbiddenState = newForbidden(puzzle);
  let confirmGiveUp = false;
  let toast = '';

  function symbolOf(particle: string, edgeId: string): string {
    const e = puzzle.diagram.edges.find((x) => x.id === edgeId)!;
    return getParticle(physicalParticle(puzzle.diagram, { ...e, particle: particle as ParticleId })!).symbol;
  }

  function diagramHtml(): string {
    const finished = state.status !== 'playing';
    const vertexStates: Record<string, 'ok' | 'error'> = {};
    for (const g of state.guesses) vertexStates[g] = g === info.vertexId ? 'error' : 'ok';
    if (finished) vertexStates[info.vertexId] = 'error';
    const vertexLabels = Object.fromEntries(Object.entries(nums).map(([id, n]) => [id, String(n)]));
    const scene = buildScene(puzzle.diagram, buildEdgeViews(puzzle.diagram), { vertexStates, vertexLabels });
    const over =
      state.status === 'playing'
        ? `<g class="vhits">${scene.vertices
            .map(
              (v) =>
                `<circle class="vhit" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="20" data-vertex-hit="${escapeXml(v.id)}" tabindex="0" role="button" aria-label="Vertex ${nums[v.id]}"/>`,
            )
            .join('')}</g>`
        : '';
    return sceneToSvg(scene, 'Feynman diagram with one forbidden vertex', { over });
  }

  function attemptsHtml(): string {
    const dots = Array.from(
      { length: MAX_ATTEMPTS },
      (_, i) => `<i class="dot${i < state.guesses.length ? ' used' : ''}"></i>`,
    ).join('');
    return `<div class="attempts" aria-label="${MAX_ATTEMPTS - state.guesses.length} attempts left">${dots}</div>`;
  }

  function messagesHtml(): string {
    if (state.status !== 'playing' || state.guesses.length === 0) return '';
    const misses = state.guesses.map((g) => `Vertex ${nums[g]}`).join(', ');
    const hint = state.guesses.length >= 2 ? `<br>${escapeXml(forbiddenHint(puzzle))}` : '';
    return `<div class="hints"><b>Not that one.</b> ${misses} ${state.guesses.length > 1 ? 'are' : 'is'} fine.${hint}</div>`;
  }

  function finishedHtml(): string {
    const won = state.status === 'won';
    const share = forbiddenShareText(puzzle, state, hooks.shareLabel);
    const rows = share
      .split('\n')
      .filter((l) => /[🟩🟥]/u.test(l))
      .join('<br>');
    const shownId = puzzle.diagram.edges.find((e) => e.id === info.edgeId)!.particle!;
    return `
      <div class="result card">
        <h2>${won ? `Found it in ${state.guesses.length}/${MAX_ATTEMPTS}!` : 'The forbidden vertex'}</h2>
        <p><b>Vertex ${nums[info.vertexId]}</b> is forbidden: ${escapeXml(forbiddenReason(puzzle))}</p>
        <p class="muted">The leg labelled <b>${escapeXml(symbolOf(shownId, info.edgeId))}</b> was really <b>${escapeXml(symbolOf(info.original, info.edgeId))}</b>.</p>
        <p class="proc"><b>${escapeXml(puzzle.name)}</b> <span class="pill">${DIFF[puzzle.difficulty] ?? ''}</span></p>
        <p>${escapeXml(puzzle.explanation)}</p>
        <div class="emoji">${rows}</div>
        <div class="row"><button class="primary" data-share>Share result</button></div>
        ${hooks.finishedExtra?.() ?? ''}
        <pre class="share-pre" hidden>${escapeXml(share)}</pre>
      </div>`;
  }

  function render() {
    const playing = state.status === 'playing';
    root.innerHTML = `
      <header class="top">
        <div>
          <h1>Spot the forbidden vertex</h1>
          <div class="sub">One vertex breaks a rule · ${DIFF[puzzle.difficulty] ?? ''}</div>
        </div>
        <div class="top-right">${attemptsHtml()}</div>
      </header>
      <div class="card diagram">${diagramHtml()}</div>
      ${messagesHtml()}
      ${
        playing
          ? `<div class="row actions"><button class="ghost" data-giveup>${confirmGiveUp ? 'Tap again to give up' : 'Give up'}</button></div>
             <p class="sub tip">Tap the numbered vertex that is not allowed: charge, baryon or lepton number is broken, or the particles simply never couple.</p>`
          : finishedHtml()
      }
      <div class="toast${toast ? ' show' : ''}" role="status">${escapeXml(toast)}</div>`;
  }

  function pickVertex(id: string, keyboard: boolean) {
    const before = state;
    state = guessVertex(puzzle, state, id);
    if (state === before) return;
    confirmGiveUp = false;
    render();
    if (keyboard && state.status === 'playing') {
      root.querySelector<HTMLElement>(`[data-vertex-hit]:not([data-vertex-hit="${id}"])`)?.focus({ preventScroll: true });
    }
  }

  async function doShare() {
    const text = forbiddenShareText(puzzle, state, hooks.shareLabel);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast = 'Copied to clipboard!';
    } catch {
      root.querySelector<HTMLElement>('.share-pre')?.removeAttribute('hidden');
      toast = 'Select the text to copy';
    }
    const t = root.querySelector('.toast');
    if (t) {
      t.textContent = toast;
      t.classList.add('show');
      window.setTimeout(() => t.classList.remove('show'), 1800);
    }
  }

  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    const v = t.closest<HTMLElement>('[data-vertex-hit]');
    if (v) return pickVertex(v.dataset.vertexHit!, false);
    if (t.closest('[data-giveup]')) {
      if (!confirmGiveUp) confirmGiveUp = true;
      else state = giveUpForbidden(state);
      return render();
    }
    if (t.closest('[data-share]')) void doShare();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const v = (ev.target as Element).closest<HTMLElement>('[data-vertex-hit]');
    if (!v) return;
    ev.preventDefault();
    pickVertex(v.dataset.vertexHit!, true);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  render();
  return {
    destroy() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.innerHTML = '';
    },
  };
}
