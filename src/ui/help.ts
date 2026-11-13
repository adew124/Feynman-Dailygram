import { readRaw, writeRaw } from '../storage';

const SEEN_KEY = 'seen-help';

const HELP_HTML = `
  <h2>How to play</h2>
  <p>Each puzzle is a Feynman diagram with some lines hidden (dotted, marked <b>?</b>). Time flows left to right.
  Fill in the missing particles so that <b>every vertex is allowed</b>.</p>
  <ol>
    <li>Tap a dotted line.</li>
    <li>Pick the particle from the palette. Use <b>anti</b> for antiparticles: a particle going backward in
    time is drawn with a backward arrow, and you label what you would write on the line.</li>
    <li>When every hidden line is filled, press <b>Check answer</b>. You have 3 attempts.</li>
  </ol>
  <h3>The rules</h3>
  <ul>
    <li>At each vertex, electric charge, baryon number and each lepton family number (e, μ, τ) must be conserved.</li>
    <li>The vertex must also exist in the Standard Model, for example a photon never couples to a neutrino.</li>
    <li>Several answers can be valid. Any assignment that works is correct, not only the textbook one.</li>
  </ul>
  <h3>Line styles</h3>
  <ul>
    <li><b>Straight with an arrow</b>: quarks and leptons</li>
    <li><b>Wavy</b>: photon γ, Z and W bosons</li>
    <li><b>Curly</b>: gluon g</li>
    <li><b>Dashed</b>: Higgs boson H</li>
  </ul>
  <h3>Decays and hadrons</h3>
  <p>Some puzzles are particle decays drawn at the quark level: a hadron (π, K, D, B, p, Λ, ...) is shown as its quark
  lines inside a rounded outline. A hidden hadron shows <b>?</b>: tap its outline and pick the hadron. The quarks must
  match, every vertex must be valid, and the parent must be heavier than its decay products. In <b>Practice</b> you can
  also be asked whether a decay is <b>allowed</b> or <b>suppressed</b>, and why.</p>
  <h3>After a wrong guess</h3>
  <p>Numbered vertices turn red or green and tell you which law is broken. Lines turn green, amber or red depending on
  how many of their end vertices are valid. Your share card uses the same colors and never shows the answer.</p>
  <p class="sub">Tip: make your own puzzle with <b>Create</b> and send a friend the link. <b>Practice</b> gives unlimited puzzles.</p>`;

function dialog(): HTMLDialogElement {
  let dlg = document.getElementById('help-dialog') as HTMLDialogElement | null;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'help-dialog';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || (e.target as Element).closest('[data-close]')) dlg!.close();
    });
  }
  return dlg;
}

export function showHelp(): void {
  const dlg = dialog();
  dlg.innerHTML = `<div class="dlg-body help">${HELP_HTML}<button class="primary" data-close>Got it</button></div>`;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
  writeRaw(SEEN_KEY, '1');
}

/** Show the help once, on a player's first visit. */
export function showHelpOnFirstVisit(): void {
  if (readRaw(SEEN_KEY) === null) showHelp();
}
