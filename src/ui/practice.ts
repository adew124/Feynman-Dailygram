import { pick } from '../puzzle/rng';
import { LIBRARY } from '../puzzle/library';
import { makePuzzle } from '../puzzle/generator';
import type { ProcessEntry } from '../puzzle/types';
import { readRaw, writeRaw } from '../storage';
import { mountGame } from './game';

const LEVEL_KEY = 'practice-level';
const LABELS = ['Any difficulty', '1 · Very easy', '2 · Easy', '3 · Easy+', '4 · Medium', '5 · Hard', '6 · Harder', '7 · Expert'];

/** Practice: unlimited random puzzles from the library, filterable by difficulty. Nothing is saved. */
export function mountPractice(root: HTMLElement): { destroy(): void } {
  const saved = Number(readRaw(LEVEL_KEY));
  let level = Number.isInteger(saved) && saved >= 0 && saved <= 7 ? saved : 0;
  let lastId: string | null = null;
  let game: { destroy(): void } | null = null;

  root.innerHTML = `
    <div class="toolbar">
      <label class="sub" for="level">Difficulty</label>
      <select id="level">${LABELS.map(
        (l, i) =>
          `<option value="${i}"${i === level ? ' selected' : ''}>${l}${i ? ` (${LIBRARY.filter((e) => e.difficulty === i).length})` : ''}</option>`,
      ).join('')}</select>
      <button data-new>New puzzle</button>
    </div>
    <div id="practice-game"></div>`;
  const gameRoot = root.querySelector<HTMLElement>('#practice-game')!;
  const select = root.querySelector<HTMLSelectElement>('#level')!;

  function chooseEntry(): ProcessEntry {
    const pool = LIBRARY.filter((e) => level === 0 || e.difficulty === level);
    const candidates = pool.length > 1 ? pool.filter((e) => e.id !== lastId) : pool;
    return pick(Math.random, candidates);
  }

  function next() {
    game?.destroy();
    const entry = chooseEntry();
    lastId = entry.id;
    const seed = `practice:${Date.now()}:${Math.random()}`;
    const puzzle = { ...makePuzzle(entry, seed), title: 'Practice' };
    game = mountGame(gameRoot, puzzle, {
      shareLabel: 'Feynman Practice',
      finishedExtra: () => '<p><button class="primary wide" data-next>Next puzzle →</button></p>',
    });
  }

  const onClick = (ev: Event) => {
    if ((ev.target as Element).closest('[data-next],[data-new]')) next();
  };
  const onChange = () => {
    level = Number(select.value);
    writeRaw(LEVEL_KEY, String(level));
    next();
  };
  root.addEventListener('click', onClick);
  select.addEventListener('change', onChange);
  next();

  return {
    destroy() {
      game?.destroy();
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    },
  };
}
