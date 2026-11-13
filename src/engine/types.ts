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

/**
 * A hadron drawn as its quark lines. The group owns EXTERNAL NODES (each external node has
 * exactly one edge), not edges, so a spectator quark can run from an incoming hadron straight to
 * an outgoing one. The group's quark content is the physical particle on each of those edges.
 */
export interface HadronGroup {
  id: string;
  /** Hadron id from the hadron table; null = hidden (the player must choose it). */
  hadron: string | null;
  side: 'in' | 'out';
  nodes: string[];
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Hadrons made of the diagram's external quark lines (decays at the quark level). */
  hadrons?: HadronGroup[];
}
