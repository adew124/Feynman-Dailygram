import { parseProcess, type RawProcess } from './loader';
import type { ProcessEntry } from './types';

/**
 * Curated process library: every JSON file in ./library holds an array of
 * processes (see README, "Adding a process"). Files are discovered at build
 * time, so adding a process needs no code change.
 */
const modules = import.meta.glob('./library/*.json', { eager: true, import: 'default' }) as Record<
  string,
  RawProcess[]
>;

export const LIBRARY: ProcessEntry[] = Object.keys(modules)
  .sort()
  .flatMap((path) => modules[path].map(parseProcess))
  .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));

export function findProcess(id: string): ProcessEntry | undefined {
  return LIBRARY.find((e) => e.id === id);
}
