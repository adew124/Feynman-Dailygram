import type { ParticleId } from './particles';

/**
 * A Feynman diagram as a graph. Time flows left to right: a node's `x` is its
 * time coordinate.
 *
 * Edge convention (the single most important one in this codebase):
 *   `edge.particle` is the particle that travels ALONG THE EDGE'S ARROW
 *   (from `from` to `to`). The arrow is the direction of particle-number flow,
 *   not of time. If the arrow points backward in time (to.x < from.x), the
 *   physical object propagating forward in time is the antiparticle.
 *   See orientation.ts for the conversions.
 */
export interface DiagramNode {
  id: string;
  /** 'vertex' = interaction point, 'external' = open end of an external leg. */
  kind: 'vertex' | 'external';
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  /** Particle along the arrow; null = not yet assigned. */
  particle: ParticleId | null;
  /**
   * Layout only (no physics): sideways bulge of the edge, in layout units,
   * measured to the left of the from->to direction (SVG coords: y down).
   * Parallel edges between the same two nodes are spread automatically
   * when this is undefined.
   */
  bend?: number;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
