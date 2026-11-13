# Daily Feynman Diagram Puzzle

A Wordle-style daily puzzle: fill in the missing particles on a Feynman diagram.
Static site (Vite + TypeScript), no backend.

## Run locally
```bash
npm install
npm test        # physics engine unit tests
npm run dev     # (from phase 2 on)
```

## Status
- [x] Phase 1: physics engine + tests (`src/engine`)
- [ ] Phase 2: SVG renderer
- [ ] Phase 3: daily gameplay
- [ ] Phase 4: process library
- [ ] Phase 5: editor + sharing
- [ ] Phase 6: polish + deploy

## Engine conventions
- Edge `particle` = the particle traveling **along the edge's arrow**. If the arrow
  points backward in time (x decreases), the physical object is the antiparticle
  (`src/engine/orientation.ts`).
- Vertex rules (`src/engine/vertices.ts`) list particles **all-incoming**; outgoing
  particles count as incoming antiparticles.
- Any assignment making every vertex an allowed SM vertex with conserved charge,
  baryon number and lepton-family numbers is accepted — there is no answer key.
