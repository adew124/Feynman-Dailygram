import { mountGallery } from './demo/gallery';
import { decodeShared, HASH_PREFIX, puzzleFromShared } from './editor/share';
import { dayNumber, isValidKey, todayKey } from './game/dates';
import { recordResult } from './game/stats';
import { dailyPuzzle } from './puzzle/generator';
import { loadDaily, loadShared, loadStats, saveDaily, saveShared, saveStats } from './storage';
import { mountEditor } from './ui/editor';
import { mountGame } from './ui/game';
import { showHelp, showHelpOnFirstVisit } from './ui/help';
import { mountPractice } from './ui/practice';
import { showStatsDialog } from './ui/statsDialog';
import { applyTheme, cycleTheme, getTheme, THEME_ICON, THEME_LABEL } from './ui/theme';
import './style.css';

const app = document.getElementById('app')!;
app.innerHTML = '<nav class="nav" id="nav"></nav><div id="view"></div>';
const nav = document.getElementById('nav')!;
applyTheme(getTheme());
const view = document.getElementById('view')!;
let current: { destroy(): void } | null | undefined = null;

/** `?date=YYYY-MM-DD` previews another day's puzzle (handy for testing). */
function activeDateKey(): { key: string; isToday: boolean } {
  const q = new URLSearchParams(location.search).get('date');
  const today = todayKey();
  if (q && isValidKey(q)) return { key: q, isToday: q === today };
  return { key: today, isToday: true };
}

type Route = 'daily' | 'practice' | 'create' | 'library' | null;

function renderNav(active: Route) {
  const link = (r: Route, href: string, label: string) =>
    `<a href="${href}"${r === active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  nav.innerHTML =
    link('daily', '#/', 'Daily') +
    link('practice', '#/practice', 'Practice') +
    link('create', '#/editor', 'Create') +
    link('library', '#/library', 'Library') +
    `<span class="nav-sp"></span>` +
    `<button class="icon" data-theme-btn aria-label="${THEME_LABEL[getTheme()]} (tap to change)" title="${THEME_LABEL[getTheme()]}">${THEME_ICON[getTheme()]}</button>` +
    `<button class="icon" data-help aria-label="How to play" title="How to play">?</button>`;
}

nav.addEventListener('click', (ev) => {
  const t = ev.target as Element;
  if (t.closest('[data-theme-btn]')) {
    cycleTheme();
    const btn = nav.querySelector<HTMLElement>('[data-theme-btn]')!;
    btn.textContent = THEME_ICON[getTheme()];
    btn.setAttribute('aria-label', `${THEME_LABEL[getTheme()]} (tap to change)`);
    btn.title = THEME_LABEL[getTheme()];
  } else if (t.closest('[data-help]')) {
    showHelp();
  }
});

function route() {
  try {
    renderRoute();
  } catch (err) {
    console.error(err);
    current = null;
    view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p>Sorry, this page failed to load.</p><p><a href="#/">Back to today's puzzle</a> · <button onclick="location.reload()">Reload</button></p></div>`;
  }
}

function renderRoute() {
  current?.destroy();
  current = null;
  view.innerHTML = '';
  const hash = location.hash;
  if (hash.startsWith(HASH_PREFIX)) {
    renderNav(null);
    current = startShared(hash.slice(HASH_PREFIX.length));
  } else if (hash.startsWith('#/editor')) {
    renderNav('create');
    current = mountEditor(view);
  } else if (hash.startsWith('#/library') || hash.startsWith('#/demo')) {
    renderNav('library');
    mountGallery(view);
  } else if (hash.startsWith('#/practice')) {
    renderNav('practice');
    current = mountPractice(view);
  } else {
    renderNav('daily');
    current = startDaily();
    showHelpOnFirstVisit();
  }
}

function startShared(compressed: string) {
  const r = decodeShared(compressed);
  if (!r.ok) {
    view.innerHTML = `<div class="card"><h2>Can't open this puzzle</h2><p>${r.error}</p><p><a href="#/">Today's puzzle</a> · <a href="#/editor">Make your own</a></p></div>`;
    return null;
  }
  const puzzle = puzzleFromShared(r.data, r.key);
  return mountGame(view, puzzle, {
    initial: loadShared(r.key, puzzle),
    shareLabel: 'Feynman Puzzle',
    shareUrl: location.href,
    onChange: (s) => saveShared(r.key, s),
    finishedExtra: () =>
      `<p class="sub">Made by a friend with the puzzle editor. <a href="#/editor">Make your own</a> · <a href="#/">Today's puzzle</a></p>`,
  });
}

function startDaily() {
  const { key, isToday } = activeDateKey();
  const puzzle = dailyPuzzle(key);
  const url = location.origin + location.pathname;
  return mountGame(view, puzzle, {
    initial: loadDaily(key, puzzle),
    dayNumber: dayNumber(key),
    shareUrl: url,
    onChange: (s) => saveDaily(key, s),
    onFinish: (s) => {
      // previews of other days don't affect streaks
      if (isToday) saveStats(recordResult(loadStats(), key, s.status === 'won', s.guesses.length));
    },
    onStats: () => showStatsDialog(loadStats(), todayKey()),
    finishedExtra: () => `<p class="sub next">Next puzzle in <b data-countdown>--:--:--</b> · or try <a href="#/practice">Practice</a></p>`,
  });
}

window.addEventListener('hashchange', route);
route();
