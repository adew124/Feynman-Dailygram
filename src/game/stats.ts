import { addDays } from './dates';
import { MAX_ATTEMPTS } from './state';

export interface Stats {
  played: number;
  wins: number;
  streak: number;
  maxStreak: number;
  /** Last date a daily puzzle was finished. */
  lastDate: string | null;
  lastWinDate: string | null;
  /** dist[i] = wins using i+1 attempts. */
  dist: number[];
}

export function emptyStats(): Stats {
  return {
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    lastDate: null,
    lastWinDate: null,
    dist: Array.from({ length: MAX_ATTEMPTS }, () => 0),
  };
}

/** Record a finished daily puzzle. Idempotent for the same date. */
export function recordResult(s: Stats, dateKey: string, won: boolean, attempts: number): Stats {
  if (s.lastDate === dateKey) return s;
  const next: Stats = { ...s, dist: [...s.dist], played: s.played + 1, lastDate: dateKey };
  if (won) {
    next.wins += 1;
    next.streak = s.lastWinDate === addDays(dateKey, -1) ? s.streak + 1 : 1;
    next.maxStreak = Math.max(s.maxStreak, next.streak);
    next.lastWinDate = dateKey;
    const i = Math.min(Math.max(attempts, 1), MAX_ATTEMPTS) - 1;
    next.dist[i] += 1;
  } else {
    next.streak = 0;
  }
  return next;
}

/** Streak to display today: it is broken if the last win was before yesterday. */
export function currentStreak(s: Stats, todayKey: string): number {
  if (!s.lastWinDate) return 0;
  if (s.lastWinDate === todayKey || s.lastWinDate === addDays(todayKey, -1)) return s.streak;
  return 0;
}

/** Coerce arbitrary parsed JSON into valid Stats (defends against corrupted storage). */
export function sanitizeStats(raw: unknown): Stats {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Stats>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    played: num(r.played),
    wins: num(r.wins),
    streak: num(r.streak),
    maxStreak: num(r.maxStreak),
    lastDate: str(r.lastDate),
    lastWinDate: str(r.lastWinDate),
    dist: base.dist.map((_, i) => (Array.isArray(r.dist) ? num(r.dist[i]) : 0)),
  };
}
