import { mountGallery } from './demo/gallery';
import { dayNumber, isValidKey, todayKey } from './game/dates';
import { recordResult } from './game/stats';
import { dailyPuzzle } from './puzzle/generator';
import { loadDaily, loadStats, saveDaily, saveStats } from './storage';
import { mountGame } from './ui/game';
import { mountPractice } from './ui/practice';
import { showStatsDialog } from './ui/statsDialog';
import './style.css';

const app = document.getElementById('app')!;
app.innerHTML = '<nav class="nav" id="nav"></nav><div id="view"></div>';
const nav = document.getElementById('nav')!;
const view = document.getElementById('view')!;
let current: { destroy(): void } | null = null;

/** `?date=YYYY-MM-DD` previews another day's puzzle (handy for testing). */
function activeDateKey(): { key: string; isToday: boolean } {
  const q = new URLSearchParams(location.search).get('date');
  const today = todayKey();
  if (q && isValidKey(q)) return { key: q, isToday: q === today };
  return { key: today, isToday: true };
}

type Route = 'daily' | 'practice' | 'library';

function renderNav(active: Route) {
  const link = (r: Route, href: string, label: string) =>
    `<a href="${href}"${r === active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  nav.innerHTML =
    link('daily', '#/', 'Daily') + link('practice', '#/practice', 'Practice') + link('library', '#/library', 'Library');
}

function route() {
  current?.destroy();
  current = null;
  view.innerHTML = '';
  const hash = location.hash;
  if (hash.startsWith('#/library') || hash.startsWith('#/demo')) {
    renderNav('library');
    mountGallery(view);
  } else if (hash.startsWith('#/practice')) {
    renderNav('practice');
    current = mountPractice(view);
  } else {
    renderNav('daily');
    current = startDaily();
  }
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
