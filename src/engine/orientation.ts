import { antiparticle, type ParticleId } from './particles';
import type { Diagram, DiagramEdge } from './types';

function nodeX(d: Diagram, id: string): number {
  const n = d.nodes.find((n) => n.id === id);
  if (!n) throw new Error(`Unknown node: ${id}`);
  return n.x;
}

/** True if the edge's arrow points forward in time (left to right). */
export function arrowForwardInTime(d: Diagram, e: DiagramEdge): boolean {
  return nodeX(d, e.to) >= nodeX(d, e.from);
}

/**
 * The particle that physically propagates forward in time along this edge,
 * i.e. what a student would write on the diagram.
 *   arrow forward in time  -> same as the stored particle
 *   arrow backward in time -> its antiparticle
 */
export function physicalParticle(d: Diagram, e: DiagramEdge): ParticleId | null {
  if (e.particle === null) return null;
  return arrowForwardInTime(d, e) ? e.particle : antiparticle(e.particle);
}

/** Convert a physical (displayed) label into the stored along-the-arrow particle. */
export function storedFromPhysical(
  d: Diagram,
  e: DiagramEdge,
  physical: ParticleId,
): ParticleId {
  // The mapping is an involution, so it is its own inverse.
  return arrowForwardInTime(d, e) ? physical : antiparticle(physical);
}

/**
 * Particle as seen by vertex `vertexId`, counting every line as INCOMING:
 *  - edge ending at the vertex contributes its particle,
 *  - edge starting at the vertex contributes its antiparticle
 *    (an outgoing particle is equivalent to an incoming antiparticle).
 * Returns null for unassigned edges, and also null if the edge does not touch
 * the vertex (or is a self-loop, which is not meaningful).
 */
export function incomingAt(e: DiagramEdge, vertexId: string): ParticleId | null {
  if (e.particle === null) return null;
  if (e.from === e.to) return null;
  if (e.to === vertexId) return e.particle;
  if (e.from === vertexId) return antiparticle(e.particle);
  return null;
}
