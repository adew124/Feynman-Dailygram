import { readRaw, writeRaw } from '../storage';

export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'theme';

export function getTheme(): Theme {
  const t = readRaw(KEY);
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

/** auto -> light -> dark -> auto */
export function cycleTheme(): Theme {
  const order: Theme[] = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  writeRaw(KEY, next);
  applyTheme(next);
  return next;
}

export const THEME_LABEL: Record<Theme, string> = { auto: 'Auto theme', light: 'Light theme', dark: 'Dark theme' };
export const THEME_ICON: Record<Theme, string> = { auto: '◐', light: '☀', dark: '☾' };
