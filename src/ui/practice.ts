import { makeClassifyPuzzle } from '../game/classify';
import { makeForbiddenPuzzle } from '../puzzle/forbidden';
import { makePuzzle } from '../puzzle/generator';
import { LIBRARY } from '../puzzle/library';
import { practicePool, type DecayClass, type PracticeFilter, type PracticeType, type Scope } from '../puzzle/practiceFilter';
import { pick } from '../puzzle/rng';
import type { ProcessEntry } from '../puzzle/types';
import { readRaw, writeRaw } from '../storage';
import { mountClassify } from './classify';
import { mountForbidden } from './forbidden';
import { mountGame } from './game';

const KEYS = { level: 'practice-level', type: 'practice-type', scope: 'practice-scope', cls: 'practice-class' };
const TYPES: [PracticeType, string][] = [
  ['mixed', 'Mixed puzzles'],
  ['fill', 'Fill in the particles'],
  ['forbidden', 'Spot the forbidden vertex'],
  ['classify', 'Allowed or suppressed?'],
];
const SCOPES: [Scope, string][] = [
  ['both', 'Scattering + decays'],
  ['scattering', 'Scattering only'],
  ['decay', 'Decays only'],
];
const CLASSES: [DecayClass, string][] = [
  ['any', 'Any decay'],
  ['allowed', 'Allowed decays'],
  ['suppressed', 'Suppressed decays'],
];
const LABELS = ['Any difficulty', '1 · Very easy', '2 · Easy', '3 · Easy+', '4 · Medium', '5 · Hard', '6 · Harder', '7 · Expert'];

function load<T extends string>(key: string, options: readonly [T, string][], fallback: T): T {
  const v = readRaw(key);
  return options.some((o) => o[0] === v) ? (v as T) : fallback;
}

/** Practice: unlimited random puzzles from the library, with filters. Nothing is saved. */
export function mountPractice(root: HTMLElement): { destroy(): void } {
  const saved = Number(readRaw(KEYS.level));
  const f: PracticeFilter = {
    level: Number.isInteger(saved) && saved >= 0 && saved <= 7 ? saved : 0,
    type: load(KEYS.type, TYPES, 'mixed'),
    scope: load(KEYS.scope, SCOPES, 'both'),
    cls: load(KEYS.cls, CLASSES, 'any'),
  };
  let lastId: string | null = null;
  let game: { destroy(): void } | null = null;

  const opts = <T extends string>(list: readonly [T, string][], cur: T) =>
    list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');

  root.innerHTML = `
    <div class="toolbar">
      <select id="level" aria-label="Difficulty">${LABELS.map(
        (l, i) =>
          `<option value="${i}"${i === f.level ? ' selected' : ''}>${l}${i ? ` (${LIBRARY.filter((e) => e.difficulty === i).length})` : ''}</option>`,
      ).join('')}</select>
      <select id="ptype" aria-label="Puzzle type">${opts(TYPES, f.type)}</select>
      <select id="scope" aria-label="Scattering or decays">${opts(SCOPES, f.scope)}</select>
      <select id="cls" aria-label="Allowed or suppressed decays">${opts(CLASSES, f.cls)}</select>
      <button data-new>New puzzle</button>
    </div>
    <div id="practice-game"></div>`;
  const gameRoot = root.querySelector<HTMLElement>('#practice-game')!;
  const sel = (id: string) => root.querySelector<HTMLSelectElement>(id)!;

  function chooseEntry(): ProcessEntry | null {
    const pool = practicePool(LIBRARY, f);
    const candidates = pool.length > 1 ? pool.filter((e) => e.id !== lastId) : pool;
    return candidates.length ? pick(Math.random, candidates) : null;
  }

  function next() {
    game?.destroy();
    game = null;
    const entry = chooseEntry();
    if (!entry) {
      gameRoot.innerHTML = `<div class="card"><h2>No puzzles match</h2><p class="sub">Try another difficulty, or switch the filters to "any".</p></div>`;
      return;
    }
    lastId = entry.id;
    const seed = `practice:${Date.now()}:${Math.random()}`;
    const extra = () => '<p><button class="primary wide" data-next>Next puzzle →</button></p>';

    const wantClassify = entry.decay && (f.type === 'classify' || (f.type === 'mixed' && Math.random() < 0.2));
    const classify = wantClassify ? makeClassifyPuzzle(entry) : null;
    if (classify) {
      game = mountClassify(gameRoot, classify, { shareLabel: 'Feynman Verdict', finishedExtra: extra });
      return;
    }
    const wantSpot = f.type === 'forbidden' || (f.type === 'mixed' && Math.random() < 0.25);
    const spot = wantSpot ? makeForbiddenPuzzle(entry, seed) : null;
    if (spot) {
      game = mountForbidden(gameRoot, spot, { shareLabel: 'Feynman Spot', finishedExtra: extra });
      return;
    }
    const puzzle = { ...makePuzzle(entry, seed), title: 'Practice' };
    game = mountGame(gameRoot, puzzle, { shareLabel: 'Feynman Practice', finishedExtra: extra });
  }

  const onClick = (ev: Event) => {
    if ((ev.target as Element).closest('[data-next],[data-new]')) next();
  };
  const onChange = (ev: Event) => {
    const t = ev.target as HTMLSelectElement;
    if (t.id === 'level') f.level = Number(t.value);
    else if (t.id === 'ptype') f.type = t.value as PracticeType;
    else if (t.id === 'scope') f.scope = t.value as Scope;
    else if (t.id === 'cls') f.cls = t.value as DecayClass;
    else return;
    // asking for allowed/suppressed decays, or the classify puzzle, implies decays
    if (f.cls !== 'any' && f.scope === 'scattering') f.scope = 'decay';
    if (f.type === 'classify' && f.scope === 'scattering') f.scope = 'decay';
    sel('#scope').value = f.scope;
    writeRaw(KEYS.level, String(f.level));
    writeRaw(KEYS.type, f.type);
    writeRaw(KEYS.scope, f.scope);
    writeRaw(KEYS.cls, f.cls);
    next();
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  next();

  return {
    destroy() {
      game?.destroy();
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.innerHTML = '';
    },
  };
}
