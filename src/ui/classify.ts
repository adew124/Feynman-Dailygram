import {
  classifyShareText,
  giveUpClassify,
  guessReasons,
  MAX_REASON_TRIES,
  newClassify,
  pickCategory,
  REASON_GROUPS,
  reasonFeedback,
  reasonGroupsOf,
  type Category,
  type ClassifyState,
  type ReasonGroup,
} from '../game/classify';
import { findProcess } from '../puzzle/library';
import type { Puzzle } from '../puzzle/types';
import { escapeXml, renderDiagram } from '../render/svg';

export interface ClassifyHooks {
  finishedExtra?(): string;
  shareLabel?: string;
}

const DIFF = ['', 'Very easy', 'Easy', 'Easy+', 'Medium', 'Hard', 'Harder', 'Expert'];
const INTERACTION = { strong: 'strong', em: 'electromagnetic', weak: 'weak' } as const;

/** "Allowed or suppressed?": a complete decay; classify it and, if suppressed, say why. */
export function mountClassify(root: HTMLElement, puzzle: Puzzle, hooks: ClassifyHooks = {}): { destroy(): void } {
  const entry = findProcess(puzzle.processId)!;
  const info = entry.decay!;
  let state: ClassifyState = newClassify(puzzle);
  let picks = new Set<ReasonGroup>();
  let toast = '';

  function reasonLabel(id: ReasonGroup): string {
    return REASON_GROUPS.find((g) => g.id === id)!.label;
  }

  function triesHtml(): string {
    const dots = Array.from(
      { length: MAX_REASON_TRIES },
      (_, i) => `<i class="dot${i < state.tries.length ? ' used' : ''}"></i>`,
    ).join('');
    return `<div class="attempts" aria-label="${MAX_REASON_TRIES - state.tries.length} tries left for the reason">${dots}</div>`;
  }

  function stepHtml(): string {
    if (state.category === null) {
      return `
        <div class="card">
          <h2>Allowed or suppressed?</h2>
          <p class="sub">Compare this decay with the best route available to the same parent. Is it one of the parent's allowed decays, or is it suppressed?</p>
          <div class="row actions">
            <button class="primary" data-cat="allowed">Allowed</button>
            <button class="primary" data-cat="suppressed">Suppressed</button>
          </div>
        </div>`;
    }
    const last = state.tries[state.tries.length - 1];
    const fb = last ? reasonFeedback(entry, last) : null;
    const hint = fb
      ? `<div class="hints"><b>Not quite.</b> ${fb.right} of your picks ${fb.right === 1 ? 'is' : 'are'} right${fb.extra ? `, ${fb.extra} ${fb.extra === 1 ? "doesn't" : "don't"} apply` : ''}${fb.missing ? `, and ${fb.missing} more ${fb.missing === 1 ? 'reason is' : 'reasons are'} missing` : ''}.</div>`
      : '';
    const boxes = REASON_GROUPS.map(
      (g) =>
        `<label class="reason"><input type="checkbox" data-reason="${g.id}" ${picks.has(g.id) ? 'checked' : ''}> <span><b>${escapeXml(g.label)}</b><br><span class="sub">${escapeXml(g.help)}</span></span></label>`,
    ).join('');
    return `
      ${hint}
      <div class="card">
        <h2>Why is it suppressed?</h2>
        <p class="sub">Tick every reason that applies. Some decays have more than one.</p>
        <div class="reasons">${boxes}</div>
        <div class="row actions">
          <button class="primary" data-check-reasons ${picks.size ? '' : 'disabled'}>Check</button>
          <button class="ghost" data-giveup>Give up</button>
        </div>
      </div>`;
  }

  function compareHtml(): string {
    const ref = info.compareWith ? findProcess(info.compareWith) : undefined;
    const side = (e: typeof entry, title: string) => `
      <div class="cmp">
        <h3>${title}</h3>
        <div class="card diagram">${renderDiagram(e.diagram, { revealKinds: true, ariaLabel: e.name })}</div>
        <p class="sub"><b>${escapeXml(e.name)}</b><br>${escapeXml(e.decay?.category ?? '')} (${INTERACTION[e.decay!.interaction]}) · BR ${escapeXml(e.decay!.brText)}</p>
      </div>`;
    if (!ref) return `<div class="compare">${side(entry, 'This decay')}</div>`;
    return `<div class="compare">${side(entry, 'This decay')}${side(ref, 'The allowed route to compare with')}</div>`;
  }

  function finishedHtml(): string {
    const won = state.status === 'won';
    const share = classifyShareText(entry, state, hooks.shareLabel);
    const rows = share.split('\n').filter((l) => /[🟩🟨🟥]/u.test(l)).join('<br>');
    const truth = reasonGroupsOf(info.reasons);
    const verdict =
      info.category === 'allowed'
        ? 'This decay is allowed: it is one of the parent\'s main routes.'
        : `This decay is suppressed because of: <b>${truth.map(reasonLabel).join(' + ')}</b>.`;
    return `
      <div class="result card">
        <h2>${won ? 'Correct!' : 'Not this time'}</h2>
        <p>${verdict}</p>
        <p class="proc"><b>${escapeXml(puzzle.name)}</b> <span class="pill">${DIFF[puzzle.difficulty] ?? ''}</span></p>
        <p>${escapeXml(entry.explanation)}</p>
        <p class="sub"><b>Branching ratio:</b> ${escapeXml(info.brText)} (PDG 2025)</p>
        <div class="emoji">${rows}</div>
        <div class="row"><button class="primary" data-share>Share result</button></div>
        ${hooks.finishedExtra?.() ?? ''}
        <pre class="share-pre" hidden>${escapeXml(share)}</pre>
      </div>
      ${compareHtml()}`;
  }

  function render() {
    const playing = state.status === 'playing';
    root.innerHTML = `
      <header class="top">
        <div>
          <h1>Allowed or suppressed?</h1>
          <div class="sub">${escapeXml(puzzle.name)} · ${DIFF[puzzle.difficulty] ?? ''}</div>
        </div>
        <div class="top-right">${state.category === 'suppressed' && playing ? triesHtml() : ''}</div>
      </header>
      ${playing ? `<div class="card diagram">${renderDiagram(entry.diagram, { revealKinds: true, ariaLabel: 'Feynman diagram of the decay' })}</div>` : ''}
      ${playing ? stepHtml() : finishedHtml()}
      <div class="toast${toast ? ' show' : ''}" role="status">${escapeXml(toast)}</div>`;
  }

  async function doShare() {
    const text = classifyShareText(entry, state, hooks.shareLabel);
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
    const cat = t.closest<HTMLElement>('[data-cat]');
    if (cat) {
      state = pickCategory(entry, state, cat.dataset.cat as Category);
      return render();
    }
    if (t.closest('[data-check-reasons]')) {
      state = guessReasons(entry, state, [...picks]);
      return render();
    }
    if (t.closest('[data-giveup]')) {
      state = giveUpClassify(state);
      return render();
    }
    if (t.closest('[data-share]')) void doShare();
  };
  const onChange = (ev: Event) => {
    const box = (ev.target as Element).closest<HTMLInputElement>('[data-reason]');
    if (!box) return;
    const id = box.dataset.reason as ReasonGroup;
    if (box.checked) picks.add(id);
    else picks.delete(id);
    picks = new Set(picks);
    const btn = root.querySelector<HTMLButtonElement>('[data-check-reasons]');
    if (btn) btn.disabled = picks.size === 0;
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  render();
  return {
    destroy() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.innerHTML = '';
    },
  };
}
