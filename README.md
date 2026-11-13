# Daily Feynman Diagram Puzzle

A Wordle-style daily puzzle: fill in the missing particles on a Feynman diagram.
Static site (Vite + TypeScript), no backend.

## Run locally
```bash
npm install
npm test        # physics engine unit tests
npm run dev     # open the printed local URL (works well in a phone-sized window)
```

## Status
- [x] Phase 1: physics engine + tests (`src/engine`)
- [x] Phase 2: SVG renderer (`src/render`, demo gallery at `#/demo`)
- [x] Phase 3: daily gameplay (`src/game`, `src/puzzle`, `src/ui`)
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

## Daily puzzle
- Everyone gets the same puzzle on a given local date: the date seeds a PRNG that picks a
  library process (difficulty = weekday, Monday 1 ... Sunday 7; nearest available if the
  library has no entry of that difficulty) and which edges to hide.
- A hide set is accepted only if the engine can solve it, has at most 60 valid completions,
  and any hidden *external* leg is forced to a single particle (so the process can't change).
- Any assignment that validates is correct (e.g. the e+e- -> mu+mu- propagator may be gamma, Z or H).
- 3 attempts; each wrong guess highlights vertices and explains which law is violated.
  Edge colors: green = both end vertices valid, amber = one, red = none. The emoji share uses the same marks.
- Difficulty <= 3 keeps the line style (wavy/curly/...) of hidden edges as a free hint.
- Preview another day: `?date=2026-11-10` (does not affect streaks).
- Progress and stats live in localStorage under the `fdp:v1:` prefix.
