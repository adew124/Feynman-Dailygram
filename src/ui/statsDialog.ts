import { MAX_ATTEMPTS } from '../game/state';
import { currentStreak, type Stats } from '../game/stats';

export function statsHtml(s: Stats, today: string): string {
  const pct = s.played ? Math.round((100 * s.wins) / s.played) : 0;
  const max = Math.max(1, ...s.dist);
  const bars = s.dist
    .map(
      (n, i) =>
        `<div class="bar-row"><span>${i + 1}</span><div class="bar" style="width:${Math.max(8, (100 * n) / max)}%">${n}</div></div>`,
    )
    .join('');
  return `
    <div class="stat-grid">
      <div><b>${s.played}</b><span>Played</span></div>
      <div><b>${pct}</b><span>Win %</span></div>
      <div><b>${currentStreak(s, today)}</b><span>Streak</span></div>
      <div><b>${s.maxStreak}</b><span>Best</span></div>
    </div>
    <h3>Solved in … attempts (max ${MAX_ATTEMPTS})</h3>
    <div class="dist">${bars}</div>`;
}

export function showStatsDialog(s: Stats, today: string): void {
  let dlg = document.getElementById('stats-dialog') as HTMLDialogElement | null;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'stats-dialog';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || (e.target as Element).closest('[data-close]')) dlg!.close();
    });
  }
  dlg.innerHTML = `<div class="dlg-body"><h2>Statistics</h2>${statsHtml(s, today)}<button class="primary" data-close>Close</button></div>`;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}
