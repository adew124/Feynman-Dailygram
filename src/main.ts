import { mountGallery } from './demo/gallery';
import { dayNumber, isValidKey, todayKey } from './game/dates';
import { recordResult } from './game/stats';
import { dailyPuzzle } from './puzzle/generator';
import { loadDaily, loadStats, saveDaily, saveStats } from './storage';
import { mountGame } from './ui/game';
import { showStatsDialog } from './ui/statsDialog';
import './style.css';

const app = document.getElementById('app')!;
let current: { destroy(): void } | null = null;

/** `?date=YYYY-MM-DD` previews another day's puzzle (handy for testing). */
function activeDateKey(): { key: string; isToday: boolean } {
  const q = new URLSearchParams(location.search).get('date');
  const today = todayKey();
  if (q && isValidKey(q)) return { key: q, isToday: q === today };
  return { key: today, isToday: true };
}

function route() {
  current?.destroy();
  current = null;
  app.innerHTML = '';
  if (location.hash.startsWith('#/demo')) {
    mountGallery(app);
    return;
  }
  startDaily();
}

function startDaily() {
  const { key, isToday } = activeDateKey();
  const puzzle = dailyPuzzle(key);
  const url = location.origin + location.pathname;
  current = mountGame(app, puzzle, {
    initial: loadDaily(key, puzzle),
    dayNumber: dayNumber(key),
    shareUrl: url,
    onChange: (s) => saveDaily(key, s),
    onFinish: (s) => {
      // previews of other days don't affect streaks
      if (isToday) saveStats(recordResult(loadStats(), key, s.status === 'won', s.guesses.length));
    },
    onStats: () => showStatsDialog(loadStats(), todayKey()),
    finishedExtra: () =>
      `<p class="sub next">Next puzzle in <b data-countdown>--:--:--</b></p>`,
  });
}

window.addEventListener('hashchange', route);
route();
