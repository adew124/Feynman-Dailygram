import { storedFromPhysical } from '../engine/orientation';
import type { ParticleId } from '../engine/particles';
import { msUntilMidnight } from '../game/dates';
import { applyEdgeAnswers, evaluateHadrons } from '../game/hadronAnswer';
import {
  evaluate,
  giveUp,
  isComplete,
  MAX_ATTEMPTS,
  matchesLastGuess,
  newGame,
  setAnswer,
  setGroupAnswer,
  shareText,
  solutionOf,
  submit,
  vertexNumbers,
  type GameState,
} from '../game/state';
import type { Puzzle } from '../puzzle/types';
import { onEdgeTap, onGroupTap, renderDiagram, escapeXml } from '../render/svg';
import type { EdgeState } from '../render/view';
import { renderHadronPalette, renderPalette, type PaletteTab } from './palette';

export interface GameHooks {
  initial?: GameState | null;
  onChange?(s: GameState): void;
  /** Called once when the game ends (win, loss or give up). */
  onFinish?(s: GameState): void;
  dayNumber?: number | null;
  shareUrl?: string;
  shareLabel?: string;
  /** Extra HTML shown in the finished panel (e.g. "next puzzle in ..." or a practice button). */
  finishedExtra?(): string;
  /** Called after each render so hosts can bind extra buttons. */
  afterRender?(root: HTMLElement): void;
  onStats?(): void;
}

const DIFF = ['', 'Very easy', 'Easy', 'Easy+', 'Medium', 'Hard', 'Harder', 'Expert'];

function sameState(a: GameState, b: GameState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mountGame(root: HTMLElement, puzzle: Puzzle, hooks: GameHooks = {}): { destroy(): void } {
  let state: GameState = hooks.initial ?? newGame(puzzle);
  const groups = puzzle.hiddenGroups ?? [];
  let selected: string | null = puzzle.hidden.find((id) => !state.answers[id]) ?? puzzle.hidden[0] ?? null;
  let selectedGroup: string | null =
    selected === null ? (groups.find((g) => !state.groupAnswers[g]) ?? groups[0] ?? null) : null;
  let tab: PaletteTab = 'leptons';
  let anti = false;
  let confirmGiveUp = false;
  let toast = '';
  let timer: number | undefined;
  let finishedNotified = state.status !== 'playing';

  const hiddenSet = new Set(puzzle.hidden);
  const nums = vertexNumbers(puzzle.diagram);
  const revealKinds = puzzle.difficulty <= 3;

  function update(next: GameState) {
    if (sameState(next, state)) return;
    state = next;
    hooks.onChange?.(state);
    if (state.status !== 'playing' && !finishedNotified) {
      finishedNotified = true;
      hooks.onFinish?.(state);
    }
    render();
  }

  function nextEmptyAfter(edgeId: string, s: GameState): string | null {
    const order = puzzle.hidden;
    const i = order.indexOf(edgeId);
    for (let k = 1; k <= order.length; k++) {
      const id = order[(i + k) % order.length];
      if (!s.answers[id]) return id;
    }
    return null;
  }

  function diagramHtml(): string {
    const playing = state.status === 'playing';
    const lost = state.status === 'lost';
    const showFb = playing && matchesLastGuess(puzzle, state);
    const fb = showFb ? evaluate(puzzle, state.answers, state.groupAnswers) : null;
    const answers = lost ? solutionOf(puzzle) : state.answers;
    // hidden hadrons: while playing they stay hidden; after a win show the player's hadrons with the quarks
    // arranged so that the diagram is valid; after a loss show the reference diagram
    let diagram = puzzle.diagram;
    if (state.status === 'won' && groups.length) {
      diagram = evaluateHadrons(applyEdgeAnswers(puzzle.diagram, puzzle.hidden, state.answers), groups, state.groupAnswers).applied;
    }
    const groupStates: Record<string, EdgeState> = {};
    if (playing) {
      for (const g of groups) {
        if (fb) groupStates[g] = fb.groupMarks[g] === 'G' ? 'correct' : fb.groupMarks[g] === 'Y' ? 'partial' : 'wrong';
        else if (selectedGroup === g) groupStates[g] = 'selected';
      }
    }
    const wrong: string[] = [];
    const correct: string[] = [];
    const partial: string[] = [];
    if (fb) {
      for (const id of puzzle.hidden) {
        const m = fb.marks[id];
        (m === 'G' ? correct : m === 'Y' ? partial : wrong).push(id);
      }
    }
    if (state.status === 'won') correct.push(...puzzle.hidden);
    const vertexLabels = fb
      ? Object.fromEntries(Object.entries(nums).map(([id, n]) => [id, String(n)]))
      : undefined;
    return renderDiagram(diagram, {
      hidden: puzzle.hidden,
      hiddenGroups: playing ? groups : [],
      groupAnswers: state.groupAnswers,
      groupStates,
      answers,
      selected: playing ? selected : null,
      revealKinds: revealKinds || !playing,
      wrong,
      correct,
      partial,
      vertexStates: fb?.vertexStates,
      vertexLabels,
      ariaLabel: 'Feynman diagram puzzle',
    });
  }

  function hintsHtml(): string {
    if (state.status !== 'playing' || state.guesses.length === 0) return '';
    if (!matchesLastGuess(puzzle, state)) {
      return `<div class="hints muted">Change your answer and check again.</div>`;
    }
    const fb = evaluate(puzzle, state.answers, state.groupAnswers);
    const items =
      fb.messages.map((m) => `<li><b>Vertex ${m.vertexNumber}:</b> ${escapeXml(m.text)}</li>`).join('') +
      fb.groupMessages.map((m) => `<li>${escapeXml(m.text)}</li>`).join('');
    return `<div class="hints"><b>Not quite.</b><ul>${items}</ul></div>`;
  }

  function attemptsHtml(): string {
    const dots = Array.from({ length: MAX_ATTEMPTS }, (_, i) => `<i class="dot${i < state.guesses.length ? ' used' : ''}"></i>`).join('');
    return `<div class="attempts" aria-label="${MAX_ATTEMPTS - state.guesses.length} attempts left">${dots}</div>`;
  }

  function finishedHtml(): string {
    const won = state.status === 'won';
    const share = shareText(puzzle, state, { dayNumber: hooks.dayNumber, url: hooks.shareUrl, label: hooks.shareLabel });
    const rows = share.split('\n').filter((l) => /[🟩🟨🟥]/u.test(l)).join('<br>');
    const heading = won
      ? `Solved in ${state.guesses.length}/${MAX_ATTEMPTS}!`
      : state.gaveUp
        ? 'Solution revealed'
        : 'Out of attempts';
    return `
      <div class="result card">
        <h2>${heading}</h2>
        <p class="proc"><b>${escapeXml(puzzle.name)}</b> <span class="pill">${DIFF[puzzle.difficulty] ?? ''}</span></p>
        <p>${escapeXml(puzzle.explanation)}</p>
        ${puzzle.message ? `<p class="creator">“${escapeXml(puzzle.message)}”</p>` : ''}
        ${!won ? `<p class="muted">Any valid assignment counts; the diagram shows one valid solution.</p>` : ''}
        <div class="emoji">${rows}</div>
        <div class="row">
          <button class="primary" data-share>Share result</button>
          ${hooks.onStats ? '<button data-stats>Stats</button>' : ''}
        </div>
        ${hooks.finishedExtra?.() ?? ''}
        <pre class="share-pre" hidden>${escapeXml(share)}</pre>
      </div>`;
  }

  /** Remember which control had keyboard focus so a re-render does not drop it. */
  const FOCUS_ATTRS = ['data-hadron', 'data-group-hit', 'data-particle', 'data-tab', 'data-anti', 'data-clear', 'data-check', 'data-giveup', 'data-share', 'data-stats', 'data-edge-hit'];
  function focusKey(): string | null {
    const el = document.activeElement;
    if (!el || !root.contains(el)) return null;
    for (const a of FOCUS_ATTRS) {
      if (el.hasAttribute(a)) return el.getAttribute(a) ? `[${a}="${el.getAttribute(a)}"]` : `[${a}]`;
    }
    return null;
  }
  let wantFocus: string | null = null;

  function render() {
    const restore = wantFocus ?? focusKey();
    wantFocus = null;
    const playing = state.status === 'playing';
    const cur = selected ? state.answers[selected] : null;
    const curHadron = selectedGroup ? state.groupAnswers[selectedGroup] : null;
    // palette shows the PHYSICAL particle for the selected edge so the chosen one highlights
    let curPhysical: ParticleId | null = null;
    if (selected && cur) curPhysical = storedFromPhysical(puzzle.diagram, puzzle.diagram.edges.find((e) => e.id === selected)!, cur);

    root.innerHTML = `
      <header class="top">
        <div>
          <h1>${escapeXml(puzzle.title ?? 'Feynman Puzzle')}${hooks.dayNumber && hooks.dayNumber > 0 ? ` <span class="sub">#${hooks.dayNumber}</span>` : ''}</h1>
          <div class="sub">${groups.length && puzzle.hidden.length === 0 ? 'Identify the hidden hadron(s)' : puzzle.kind === 'external' ? 'Find the missing particle(s)' : 'Fill in the missing particles'} · ${DIFF[puzzle.difficulty] ?? ''}</div>
        </div>
        <div class="top-right">${hooks.onStats ? '<button class="icon" data-stats aria-label="Statistics">📊</button>' : ''}${attemptsHtml()}</div>
      </header>
      ${puzzle.message && playing ? `<p class="creator">“${escapeXml(puzzle.message)}”</p>` : ''}
      <div class="card diagram">${diagramHtml()}</div>
      ${hintsHtml()}
      ${
        playing
          ? `${selected ? '' : ''}
             <div class="card">${selectedGroup ? renderHadronPalette(anti, curHadron, true) : renderPalette(tab, anti, curPhysical, !!selected)}</div>
             <div class="row actions">
               <button class="primary" data-check ${isComplete(puzzle, state) ? '' : 'disabled'}>Check answer</button>
               <button class="ghost" data-giveup>${confirmGiveUp ? 'Tap again to give up' : 'Give up'}</button>
             </div>
             <p class="sub tip">${groups.length ? 'Tap a dotted line or a hadron outline, then pick a particle.' : 'Tap a dotted line, then pick a particle.'} Several answers can be valid.</p>`
          : finishedHtml()
      }
      <div class="toast${toast ? ' show' : ''}" role="status">${escapeXml(toast)}</div>`;
    hooks.afterRender?.(root);
    startCountdown();
    if (restore) root.querySelector<HTMLElement>(restore)?.focus({ preventScroll: true });
  }

  function startCountdown() {
    window.clearInterval(timer);
    const el = root.querySelector<HTMLElement>('[data-countdown]');
    if (!el) return;
    const tick = () => {
      const ms = msUntilMidnight();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    tick();
    timer = window.setInterval(tick, 1000);
  }

  function flash(msg: string) {
    toast = msg;
    render();
    window.setTimeout(() => {
      toast = '';
      const t = root.querySelector('.toast');
      t?.classList.remove('show');
    }, 1800);
  }

  async function doShare() {
    const text = shareText(puzzle, state, { dayNumber: hooks.dayNumber, url: hooks.shareUrl, label: hooks.shareLabel });
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return; // user cancelled the share sheet
    }
    try {
      await navigator.clipboard.writeText(text);
      flash('Copied to clipboard!');
    } catch {
      // clipboard blocked: reveal the text so it can be copied by hand
      const pre = root.querySelector<HTMLElement>('.share-pre');
      if (pre) {
        pre.hidden = false;
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(pre);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      flash('Select the text to copy');
    }
  }

  const onClick = (ev: Event) => {
    const t = ev.target as Element;
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab as PaletteTab;
      render();
      return;
    }
    if (t.closest('[data-anti]')) {
      anti = !anti;
      render();
      return;
    }
    const pbtn = t.closest<HTMLElement>('[data-particle]');
    if (pbtn && selected && state.status === 'playing') {
      const edge = puzzle.diagram.edges.find((e) => e.id === selected)!;
      const stored = storedFromPhysical(puzzle.diagram, edge, pbtn.dataset.particle!);
      const next = setAnswer(state, selected, stored);
      const after = nextEmptyAfter(selected, next);
      if (after) selected = after;
      else {
        const g = groups.find((id) => !next.groupAnswers[id]);
        if (g) {
          selected = null;
          selectedGroup = g;
        }
      }
      confirmGiveUp = false;
      update(next);
      render();
      return;
    }
    const hbtn = t.closest<HTMLElement>('[data-hadron]');
    if (hbtn && selectedGroup && state.status === 'playing') {
      const next = setGroupAnswer(state, selectedGroup, hbtn.dataset.hadron!);
      const i = groups.indexOf(selectedGroup);
      const nextGroup = groups.map((_, k) => groups[(i + 1 + k) % groups.length]).find((g) => !next.groupAnswers[g]);
      if (nextGroup) selectedGroup = nextGroup;
      else {
        const e = puzzle.hidden.find((id) => !next.answers[id]);
        if (e) {
          selected = e;
          selectedGroup = null;
        }
      }
      confirmGiveUp = false;
      update(next);
      render();
      return;
    }
    if (t.closest('[data-clear]')) {
      if (selectedGroup) update(setGroupAnswer(state, selectedGroup, null));
      else if (selected) update(setAnswer(state, selected, null));
      return;
    }
    if (t.closest('[data-check]')) {
      confirmGiveUp = false;
      update(submit(puzzle, state));
      render();
      return;
    }
    if (t.closest('[data-giveup]')) {
      if (!confirmGiveUp) {
        confirmGiveUp = true;
        render();
      } else {
        confirmGiveUp = false;
        update(giveUp(state));
        render();
      }
      return;
    }
    if (t.closest('[data-share]')) {
      void doShare();
      return;
    }
    if (t.closest('[data-stats]')) hooks.onStats?.();
  };
  root.addEventListener('click', onClick);

  // Tap handling for edges is delegated, so it survives innerHTML re-renders.
  const offEdge = onEdgeTap(root, (edgeId, viaKeyboard) => {
    if (state.status !== 'playing' || !hiddenSet.has(edgeId)) return;
    selected = edgeId;
    selectedGroup = null;
    if (viaKeyboard) wantFocus = `[data-edge-hit="${edgeId}"]`;
    confirmGiveUp = false;
    render();
  });
  const offGroup = onGroupTap(root, (groupId, viaKeyboard) => {
    if (state.status !== 'playing' || !groups.includes(groupId)) return;
    selectedGroup = groupId;
    selected = null;
    if (viaKeyboard) wantFocus = `[data-group-hit="${groupId}"]`;
    confirmGiveUp = false;
    render();
  });

  render();
  return {
    destroy() {
      window.clearInterval(timer);
      root.removeEventListener('click', onClick);
      offEdge();
      offGroup();
      root.innerHTML = '';
    },
  };
}
