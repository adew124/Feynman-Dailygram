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
- [x] Phase 4: process library (51 processes) + practice mode
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

## Library and practice mode
- **Practice** (`#/practice`): unlimited random puzzles, filterable by difficulty 1-7. Nothing is saved or counted in stats.
- **Library** (`#/library`): browse every process with its full diagram, handy for checking layouts.
- The library lives in `src/puzzle/library/*.json` (qed, qcd, weak, higgs, loops). Every file is an
  array of processes and files are picked up automatically; there is nothing to register.

## Adding a process to the library
Add an object to any array in `src/puzzle/library/*.json` (or create a new `*.json` file with an array):

```json
{
  "id": "beta-minus",
  "name": "β⁻ decay (quark level)",
  "difficulty": 2,
  "explanation": "Two or three sentences shown after the puzzle ends.",
  "vertices":  { "v1": [1, 0], "v2": [2, 1] },
  "externals": { "din": [0, -1], "uout": [3, -1], "eout": [3, 1], "nuout": [3, 2] },
  "legs": [
    ["d",     "in",  "din",  "v1", "d"],
    ["u",     "out", "uout", "v1", "u"],
    ["e",     "out", "eout", "v2", "e-"],
    ["nubar", "out", "nuout","v2", "anti_nu_e"]
  ],
  "edges": [ ["W", "v1", "v2", "W-"] ],
  "hideSets": [["W"], ["nubar"], ["W", "nubar"]]
}
```

- **Coordinates:** `x` is time (left to right), `y` grows downward. Incoming legs go on the left edge,
  outgoing legs on the right edge. A leg exactly above or below its vertex (same `x`) is fine.
- **`legs`**: `[edgeId, "in"|"out", externalNode, vertex, particle]`. Write the **physical** particle
  (what you would label the leg). The loader works out arrow direction and the stored particle, so you
  never think about backward arrows for external legs. Incoming particles flow toward the vertex.
- **`edges`**: internal lines `[edgeId, from, to, particle, bend?]`. `particle` is the particle traveling
  **along the arrow** from `from` to `to`; fermion arrows follow the fermion-number flow, even when that
  runs backward in time. For bosons the direction is arbitrary but the charge must be consistent
  (a W⁻ from v1 to v2 is the same as a W⁺ from v2 to v1). `bend` (layout units, negative = up for a
  left-to-right edge) curves an edge; parallel edges between two vertices are fanned out automatically.
- **Particle ids:** `e- e+ mu- mu+ tau- tau+ nu_e anti_nu_e nu_mu anti_nu_mu nu_tau anti_nu_tau`,
  quarks `u d c s t b` and `ubar dbar cbar sbar tbar bbar`, bosons `gamma Z g H W+ W-`.
- **`hideSets`** (strongly recommended): lists of edge ids that make good puzzles. A set is only used if the
  engine can solve it, it has at most 60 valid completions, and any hidden *external* leg is forced to a single
  answer. Hiding an external that could be several things (a photon vs. Z leg, a CKM-ambiguous quark) is
  rejected automatically. If no set passes, random subsets are tried.
- **Difficulty** 1-7 maps to the weekday (Mon = 1 ... Sun = 7). Aim for: 1 = single tree diagram, 3 = a
  weak/strong 2-to-2, 5 = a long fermion chain or contact vertex, 6-7 = loops, boxes, penguins.
- Run `npm test`: it checks that your diagram is a valid, fully assigned Standard Model diagram, that the
  layout is sane, that the explanation is 2-3 sentences, and that a fair hide set exists. The error
  messages name the vertex and the law that is violated, so mistakes are easy to find.
