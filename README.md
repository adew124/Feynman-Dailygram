# Daily Feynman Diagram Puzzle

A Wordle-style daily puzzle for particle physics. Each day shows a Feynman diagram with some lines hidden;
fill in the missing particles so that every vertex is a legal Standard Model vertex and conserves charge,
baryon number and each lepton family number. A static site (Vite + TypeScript, no backend) that works on a phone.

**Features**
- **Daily puzzle**: the same puzzle for everyone each local day, easy on Monday up to hard on Sunday. 3 attempts,
  per-vertex hints, spoiler-free emoji share card, streaks and stats.
- **Practice**: unlimited random puzzles, filterable by difficulty (1-7) and by type: fill in the particles, or
  **spot the forbidden vertex** (a fully labelled diagram where one leg was swapped; tap the one vertex that breaks a rule).
- **Create**: a puzzle editor (drag vertices, draw lines, pick particles, hide lines) that shares a puzzle as a link.
- **Library**: 51 real processes, from beta decay and e+e- -> mu+mu- to penguins, meson-mixing boxes and Higgs loops.
- Any valid assignment is accepted, not just a stored answer key.

## Run locally
Requires Node 20 or newer.

```bash
npm install
npm run dev        # open the printed local URL (use a phone-sized window to check mobile)
npm test           # unit tests (physics engine, renderer, game logic, library, editor)
npm run typecheck  # TypeScript
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Preview another day's daily puzzle with `?date=2026-11-15` (it does not touch your streak).
Other pages: `#/practice`, `#/editor`, `#/library`.

## Deploy to GitHub Pages
The repository includes a workflow, `.github/workflows/deploy.yml`, that typechecks, runs the tests, builds and
publishes the site on every push to `main` (or `master`).

1. Create an empty repository on GitHub and push this folder to it:
   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git branch -M main
   git push -u origin main
   ```
2. In the repository, open **Settings -> Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab: the "Deploy to GitHub Pages" run builds the site. When it is green the site is live at
   `https://<you>.github.io/<repo>/`.

Notes:
- The build uses relative asset paths (`base: './'`) and hash routing (`#/practice`, `#p=...`), so it works under any
  repository name and with a custom domain, and needs no server rewrites.
- If the run fails on `npm test`, the log shows which test failed; the build step only runs after the tests pass.
- Manual alternative: run `npm run build` and upload the contents of `dist/` to any static host.
- "Daily" is based on the player's local date, so the puzzle changes at local midnight.

## How the puzzle works
- **Edges and arrows.** A diagram is a graph with time flowing left to right. Each edge stores the particle that
  travels **along its arrow**. If the arrow points backward in time, the physical particle is the antiparticle
  (`src/engine/orientation.ts`). The UI always shows and lets you pick the *physical* label.
- **Vertices.** `src/engine/vertices.ts` lists every allowed vertex (QED, QCD including 3- and 4-gluon, weak charged
  current with the full CKM matrix, weak neutral current, Higgs couplings, gauge self-interactions) with all lines
  counted as incoming. Neutrino oscillation is ignored.
- **Validation.** `src/engine/validator.ts` checks each vertex for the allowed-vertex list and for conservation of
  charge, baryon number and lepton family numbers, and returns per-vertex hint messages.
- **Answers.** Anything that makes the whole diagram valid is correct (for example the e+e- -> mu+mu- propagator may be
  gamma, Z or H). Revealed lines can never change.
- **Daily selection.** The date seeds a PRNG that picks a library process (difficulty = weekday, Monday 1 ... Sunday 7)
  and which lines to hide. A hide set is only used if the engine can solve it, it has at most 60 valid completions, and
  every hidden *external* leg is forced to a single particle (so the process cannot change).
- **Hints and sharing.** A wrong guess marks vertices red or green and names the violated law. Lines turn green, amber or
  red by how many of their end vertices are valid; the emoji card uses the same marks and never includes the answer.
  Difficulty 1-3 keeps the line style (wavy, curly, ...) of hidden lines as a free hint.
- **Storage.** Progress, stats, theme and the editor draft live in `localStorage` under the `fdp:v1:` prefix, and the
  app still works if storage is unavailable.

## Adding a process to the library
Add an object to any array in `src/puzzle/library/*.json` (or create a new `*.json` file containing an array; files are
picked up automatically, with nothing to register):

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

- **Coordinates:** `x` is time (left to right), `y` grows downward. Incoming legs go on the left edge, outgoing legs on the
  right edge. A leg exactly above or below its vertex (same `x`) is fine.
- **`legs`:** `[edgeId, "in"|"out", externalNode, vertex, particle]`. Write the **physical** particle (what you would
  label the leg); the loader works out arrow direction and the stored particle, so you never handle backward arrows for
  external legs.
- **`edges`:** internal lines `[edgeId, from, to, particle, bend?]`. `particle` travels **along the arrow** from `from` to
  `to`; fermion arrows follow the fermion-number flow, even backward in time. For bosons the direction is arbitrary but
  the charge must be consistent (a W⁻ from v1 to v2 equals a W⁺ from v2 to v1). `bend` (layout units; negative = up for a
  left-to-right edge) curves an edge, and parallel edges between two vertices fan out automatically.
- **Particle ids:** `e- e+ mu- mu+ tau- tau+ nu_e anti_nu_e nu_mu anti_nu_mu nu_tau anti_nu_tau`; quarks `u d c s t b` and
  `ubar dbar cbar sbar tbar bbar`; bosons `gamma Z g H W+ W-`.
- **`hideSets`** (strongly recommended): lists of edge ids that make good puzzles. Hiding an external leg that could be
  several particles (a photon vs. Z leg, a CKM-ambiguous quark) is rejected automatically; if no set passes, random
  subsets are tried.
- **Difficulty** 1-7 maps to the weekday. Aim for: 1 = a single tree diagram, 3 = a weak or strong 2-to-2, 5 = a long
  fermion chain or contact vertex, 6-7 = loops, boxes and penguins.
- Run `npm test`: it checks that your diagram is a valid, fully assigned Standard Model diagram, that the layout is sane,
  that the explanation is 2-3 sentences, and that a fair hide set exists. Error messages name the vertex and the law that
  is violated.
- Preview your diagram at `#/library`, or load it in the editor.

## Puzzle editor and sharing (`#/editor`)
1. Pick a tool: **Vertex** (tap to place), **Line** (drag from a vertex to another vertex, or into empty space for an
   external leg), **Move** (drag points), **Delete**. Positions snap to a half-unit grid. Or start from any library
   process with the dropdown and modify it.
2. Select a line and choose the particle you would write on it (forward in time). Antiparticles get backward arrows
   automatically. Vertices turn green when valid and red otherwise; the status box explains every problem.
3. Switch on **Hidden from the player** for the lines to solve (amber in the editor).
4. Sharing is blocked until the whole diagram is connected, fully assigned, valid at every vertex, has at least one hidden
   line, and no hidden external leg could be several particles. A very open puzzle (more than 60 valid answers) only gets
   a warning.
5. **Test play** lets you solve your own puzzle; **Copy share link** gives `https://<site>/#p=<compressed puzzle>`. An
   optional title and message are shown to the player.

How links work: the puzzle is stored as compact JSON, compressed with lz-string and placed in the URL hash, so there is no
server. The JSON contains the creator's complete answer, which the app uses to check progress, so a determined person could
decode a link and read it. Links are treated as untrusted input: size caps, schema checks, unknown particles, broken
geometry and diagrams that violate a conservation law are rejected with a friendly message, and text is always escaped
before display. Progress on a shared puzzle is saved per puzzle and never counts toward daily stats.

## Project layout
```
src/engine/    particles, vertex rules, validator, solver, answer checking (no DOM)
src/render/    diagram -> scene -> SVG (straight/wavy/curly/dashed lines)
src/puzzle/    library JSON, loader, generator (daily + practice), seeded RNG
src/game/      game state, stats/streaks, dates, share text
src/editor/    editor model, checks, share codec
src/ui/        game view, palette, practice, editor, dialogs, theme
tests/         Vitest suites
```

## Spot the forbidden vertex
`src/puzzle/forbidden.ts` takes a library diagram and swaps the label of one *external* leg (preferring the same line
style so the shape gives nothing away), keeping only swaps that leave exactly one invalid vertex. The player taps that
vertex (3 attempts; a wrong tap turns that vertex green, and a coarse hint appears after two misses). It is available in
Practice only; the daily puzzle is unchanged.

## Not yet implemented
- Offline support (service worker). The app already ships a web manifest, so it can be added to a home screen.
