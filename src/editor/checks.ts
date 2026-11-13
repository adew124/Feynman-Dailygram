import type { Diagram } from '../engine/types';
import { structuralErrors, validateDiagram, type ValidationResult } from '../engine/validator';
import { vertexNumbers } from '../game/state';
import { analyzeHideSet, isExternalEdge } from '../puzzle/generator';
import { hiddenIds, LIMITS, toDiagram, type EditorModel } from './model';

export interface EditorReport {
  /** Problems that block sharing. */
  errors: string[];
  /** Things worth knowing, but sharing is allowed. */
  warnings: string[];
  ok: boolean;
  diagram: Diagram;
  validation: ValidationResult;
  vertexNumbers: Record<string, number>;
  /** Number of valid answers for the hidden lines (capped), when computed. */
  solutions: number | null;
}

function connected(d: Diagram): boolean {
  if (d.nodes.length === 0) return true;
  const adj = new Map<string, string[]>(d.nodes.map((n) => [n.id, []]));
  for (const e of d.edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const seen = new Set<string>([d.nodes[0].id]);
  const stack = [d.nodes[0].id];
  while (stack.length) {
    for (const n of adj.get(stack.pop()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === d.nodes.length;
}

/** Everything the editor needs to know before a puzzle may be shared. */
export function checkModel(m: EditorModel): EditorReport {
  const diagram = toDiagram(m);
  const validation = validateDiagram(diagram);
  const nums = vertexNumbers(diagram);
  const errors: string[] = [];
  const warnings: string[] = [];
  let solutions: number | null = null;

  const vertices = m.nodes.filter((n) => n.kind === 'vertex');
  const externals = m.nodes.filter((n) => n.kind === 'external');
  if (vertices.length === 0) {
    errors.push('Add at least one vertex (a point where lines meet).');
  } else {
    if (externals.length === 0) errors.push('Add at least one external leg: drag a line from a vertex into empty space.');
    if (!connected(diagram)) errors.push('Everything must be connected into one diagram.');
    for (const msg of structuralErrors(diagram)) errors.push(msg);

    const unassigned = m.edges.filter((e) => e.p === null).length;
    if (unassigned) errors.push(`${unassigned} line${unassigned > 1 ? 's' : ''} still need${unassigned > 1 ? '' : 's'} a particle.`);

    for (const i of validation.issues) {
      errors.push(`Vertex ${nums[i.vertexId] ?? '?'}: ${i.message}`);
    }
  }

  const hidden = hiddenIds(m);
  if (errors.length === 0) {
    if (hidden.length === 0) {
      errors.push('Hide at least one line: select it and switch on "Hidden from the player".');
    } else if (hidden.length > LIMITS.hidden) {
      errors.push(`Hide at most ${LIMITS.hidden} lines.`);
    } else {
      const r = analyzeHideSet(diagram, hidden);
      solutions = r.solutions;
      if (r.solutions < 1) errors.push('The hidden lines have no valid answer.');
      for (const id of r.ambiguousExternals) {
        const label = isExternalEdge(diagram, id) ? 'An external leg' : 'A line';
        errors.push(
          `${label} you hid could be more than one particle, which would change the process. Reveal it, or hide the inner lines instead.`,
        );
      }
      if (r.tooOpen) warnings.push(`Very open puzzle: more than ${r.solutions - 1} valid answers.`);
    }
  }

  return { errors, warnings, ok: errors.length === 0, diagram, validation, vertexNumbers: nums, solutions };
}
