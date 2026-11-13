/** Date helpers. A "date key" is a local calendar date, "YYYY-MM-DD". */

const pad = (n: number) => String(n).padStart(2, '0');

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidKey(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function utc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const t = new Date(utc(key) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** Monday = 1 ... Sunday = 7. */
export function weekday(key: string): number {
  const d = new Date(utc(key)).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Puzzle #1 is the launch day. */
export const EPOCH = '2026-11-12';
export function dayNumber(key: string): number {
  return daysBetween(EPOCH, key) + 1;
}

/** Milliseconds from `now` until the next local midnight. */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
