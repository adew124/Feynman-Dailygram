import type { Diagram } from '../engine/types';
import { buildScene, type Scene, type SceneOptions } from './scene';
import { buildEdgeViews, type ViewOptions } from './view';

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Turn a particle symbol into SVG text content. "_x" (underscore + one
 * character) becomes a subscript: "ν_μ" -> ν<tspan>μ</tspan>.
 */
export function symbolToTspans(sym: string): string {
  const chars = Array.from(sym);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '_' && i + 1 < chars.length) {
      out += `<tspan class="subscript" dy="4" font-size="70%">${escapeXml(chars[i + 1])}</tspan>`;
      if (i + 2 < chars.length) out += '<tspan dy="-4"></tspan>';
      i++;
    } else {
      out += escapeXml(chars[i]);
    }
  }
  return out;
}

export interface SvgLayers {
  /** Extra SVG drawn beneath everything (e.g. an editor grid). */
  under?: string;
  /** Extra SVG drawn on top of everything (e.g. drag handles). */
  over?: string;
}

export function sceneToSvg(scene: Scene, ariaLabel = 'Feynman diagram', layers: SvgLayers = {}): string {
  const { width: W, height: H } = scene;
  const parts: string[] = [];
  parts.push(
    `<svg class="feynman" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">`,
  );
  if (layers.under) parts.push(layers.under);
  // 1. strokes
  parts.push('<g class="strokes">');
  for (const e of scene.edges) {
    parts.push(`<g class="edge k-${e.kind} s-${e.state}" data-edge="${escapeXml(e.id)}">`);
    parts.push(`<path class="stroke" d="${e.d}"/>`);
    if (e.arrow) parts.push(`<path class="arrowhead" d="${e.arrow}"/>`);
    parts.push('</g>');
  }
  parts.push('</g>');
  // 2. vertices
  parts.push('<g class="vertices">');
  for (const v of scene.vertices) {
    const r = v.label ? 9 : 4;
    parts.push(`<circle class="vertex v-${v.state}" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="${r}" data-vertex="${escapeXml(v.id)}"/>`);
    if (v.label) {
      parts.push(`<text class="vnum" x="${v.x.toFixed(1)}" y="${v.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(v.label)}</text>`);
    }
  }
  parts.push('</g>');
  // 3. labels
  parts.push('<g class="labels">');
  for (const e of scene.edges) {
    if (!e.label) continue;
    const { x, y, anchor, text } = e.label;
    parts.push(
      `<text class="label s-${e.state}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central">${symbolToTspans(text)}</text>`,
    );
  }
  parts.push('</g>');
  // 4. time axis
  const { x0, x1, y } = scene.timeAxis;
  parts.push(
    `<g class="time-axis"><path d="M${x0} ${y}L${x1} ${y}M${x1 - 5} ${y - 3.5}L${x1} ${y}L${x1 - 5} ${y + 3.5}"/><text x="${x0 - 6}" y="${y}" text-anchor="end" dominant-baseline="central">time</text></g>`,
  );
  // 5. tap targets on top
  parts.push('<g class="hits">');
  for (const e of scene.edges) {
    parts.push(`<path class="hit" d="${e.hitD}" data-edge-hit="${escapeXml(e.id)}"/>`);
  }
  parts.push('</g>');
  if (layers.over) parts.push(layers.over);
  parts.push('</svg>');
  return parts.join('');
}

export interface RenderOptions extends ViewOptions, SceneOptions {
  ariaLabel?: string;
}

/** One-call convenience: diagram + game state -> SVG markup. */
export function renderDiagram(d: Diagram, o: RenderOptions = {}): string {
  const views = buildEdgeViews(d, o);
  const scene = buildScene(d, views, o);
  return sceneToSvg(scene, o.ariaLabel);
}

/**
 * Attach tap handling: calls `onEdge(edgeId)` when the user taps an edge's
 * hit area. Uses event delegation, so it survives re-rendering innerHTML.
 */
export function onEdgeTap(container: HTMLElement, onEdge: (edgeId: string) => void): () => void {
  const handler = (ev: Event) => {
    const t = (ev.target as Element | null)?.closest?.('[data-edge-hit]');
    if (t) onEdge(t.getAttribute('data-edge-hit')!);
  };
  container.addEventListener('click', handler);
  return () => container.removeEventListener('click', handler);
}
