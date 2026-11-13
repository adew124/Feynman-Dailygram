import type { GameState } from './game/state';
import { emptyStats, sanitizeStats, type Stats } from './game/stats';
import { isParticleId } from './engine/particles';
import type { Puzzle } from './puzzle/types';

/**
 * localStorage wrapper. Every access is guarded: storage can be unavailable
 * (private mode, blocked cookies) or hold garbage, and the app must still work.
 */
const PREFIX = 'fdp:v1:';
const memory = new Map<string, string>(); // fallback when localStorage throws

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    memory.set(key, value);
  }
}

function readJson(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadStats(): Stats {
  const raw = readJson('stats');
  return raw ? sanitizeStats(raw) : emptyStats();
}

export function saveStats(s: Stats): void {
  writeRaw('stats', JSON.stringify(s));
}

/** Validate saved progress against the current puzzle; discard anything that doesn't fit. */
export function sanitizeGameState(raw: unknown, p: Puzzle): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<GameState>;
  if (r.puzzleId !== p.id) return null;
  if (r.status !== 'playing' && r.status !== 'won' && r.status !== 'lost') return null;
  if (!Array.isArray(r.guesses) || r.guesses.length > 3) return null;
  const ok = (v: unknown) => typeof v === 'string' && isParticleId(v);
  const answers: GameState['answers'] = {};
  for (const id of p.hidden) {
    const v = (r.answers as Record<string, unknown> | undefined)?.[id];
    answers[id] = ok(v) ? (v as string) : null;
  }
  const guesses: GameState['guesses'] = [];
  for (const g of r.guesses) {
    const ga = (g as { answers?: Record<string, unknown> })?.answers;
    const gm = (g as { marks?: unknown })?.marks;
    if (!ga || !Array.isArray(gm) || gm.length !== p.hidden.length) return null;
    if (!p.hidden.every((id) => ok(ga[id]))) return null;
    if (!gm.every((m) => m === 'G' || m === 'Y' || m === 'R')) return null;
    guesses.push({ answers: Object.fromEntries(p.hidden.map((id) => [id, ga[id] as string])), marks: gm });
  }
  return { puzzleId: p.id, answers, guesses, status: r.status, gaveUp: r.gaveUp === true };
}

export function loadDaily(dateKey: string, p: Puzzle): GameState | null {
  return sanitizeGameState(readJson(`daily:${dateKey}`), p);
}

export function saveDaily(dateKey: string, s: GameState): void {
  writeRaw(`daily:${dateKey}`, JSON.stringify(s));
}

export function loadShared(key: string, p: Puzzle): GameState | null {
  return sanitizeGameState(readJson(`shared:${key}`), p);
}

export function saveShared(key: string, s: GameState): void {
  writeRaw(`shared:${key}`, JSON.stringify(s));
}

/** Raw JSON access for the editor draft (sanitized by the caller). */
export function loadDraftRaw(): unknown {
  return readJson('editor-draft');
}

export function saveDraftRaw(value: unknown): void {
  writeRaw('editor-draft', JSON.stringify(value));
}
