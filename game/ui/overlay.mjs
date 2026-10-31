// Lagen boven het spel: de balk (leveltitel, ?, taal), de besturingshint, het hulpvenster en de foutreden.
import { vertaal, zetInhoud } from '../i18n.mjs';
import { LATENTIE } from '../geluid.mjs';

const $ = (id) => document.getElementById(id);

// Het besturingsplaatje staat één keer in index.html en komt op elke plek waar het nodig is.
export function vulBesturing() {
  const sjabloon = $('tpl-besturing');
  for (const plek of document.querySelectorAll('.besturing-plek')) {
    plek.replaceChildren(sjabloon.content.firstElementChild.cloneNode(true));
    vertaal(plek);
  }
}

export function toonHud(level) {
  zetInhoud($('level-titel'), level.titel);
  $('level-titel').hidden = false;
  $('hud-sterren').hidden = false;
  $('hud-hart').hidden = false;
  $('hud-afweer').hidden = false;
  $('knop-hulp').hidden = false;
  hartSlagen = null;
}

// De hartslag van de held (loop D): het getal per slag (niet per frame, en zonder aria-live: geen voorleesvloed), en
// het hartje klopt mee, net zo laat als het geluid (LATENTIE). Verminderde beweging: alleen het getal.
let hartSlagen = null;
const bewegingMq = matchMedia('(prefers-reduced-motion: reduce)');
function werkHartBij({ bpm, slagen }) {
  if (slagen === hartSlagen) return;
  const klopt = hartSlagen !== null && slagen > hartSlagen;
  hartSlagen = slagen;
  $('hart-bpm').textContent = String(Math.round(bpm));
  if (!klopt || bewegingMq.matches) return;
  const hartje = $('hud-hart').querySelector('.hartje');
  setTimeout(() => hartje.animate({ scale: [1, 1.25, 1] }, { duration: 180, easing: 'ease-out' }), LATENTIE * 1000);
}

// De voorraad witte bloedcellen (loop E): het getal, gedimd bij 0; bij oppakken of aanmaak wipt het getal, bij F zonder
// voorraad schudt de pil (verminderde beweging: even omgekeerd, geen beweging).
function werkAfweerBij(spel, gebeurtenissen) {
  const pil = $('hud-afweer');
  const aantal = String(spel.afweer.voorraad);
  if ($('afweer-aantal').textContent !== aantal) $('afweer-aantal').textContent = aantal;
  pil.classList.toggle('leeg', spel.afweer.voorraad === 0);
  for (const e of gebeurtenissen) {
    if (e.soort === 'leeg') {
      if (!bewegingMq.matches) pil.animate({ translate: ['0 0', '-3px 0', '3px 0', '-3px 0', '0 0'] }, { duration: 240 });
      else {
        pil.classList.add('tik');
        setTimeout(() => pil.classList.remove('tik'), 300);
      }
    }
    if ((e.soort === 'oppak' || e.soort === 'aanmaak') && !bewegingMq.matches) $('afweer-aantal').animate({ scale: [1.4, 1] }, { duration: 220, easing: 'ease-out' });
  }
}

// De tellers in de balk: sterren (altijd) en de vitamine van een goed antwoord (spelregel 1); de hartslag en de
// witte bloedcellen in de onderhoeken.
export function werkHudBij(spel, gebeurtenissen = []) {
  const sterren = String(spel.sterren);
  if ($('aantal-sterren').textContent !== sterren) $('aantal-sterren').textContent = sterren;
  if ($('hud-vitamine').hidden !== (spel.vitamines === 0)) $('hud-vitamine').hidden = spel.vitamines === 0;
  werkHartBij(spel.hartslag);
  werkAfweerBij(spel, gebeurtenissen);
}

export function verbergHud() {
  $('level-titel').hidden = true;
  $('hud-sterren').hidden = true;
  $('hud-vitamine').hidden = true;
  $('hud-hart').hidden = true;
  $('hud-afweer').hidden = true;
  $('knop-hulp').hidden = true;
}

// De besturing in de eerste seconden van een level in beeld.
let hintKlok;
export function toonHint(seconden) {
  clearTimeout(hintKlok);
  $('besturing-hint').hidden = false;
  hintKlok = setTimeout(verbergHint, seconden * 1000);
}
export function verbergHint() {
  clearTimeout(hintKlok);
  $('besturing-hint').hidden = true;
}

// Hulpvenster: open met H of de knop "?", dicht met Esc of de sluitknop.
export const hulp = {
  isOpen: () => !$('hulp').hidden,
  open() {
    verbergHint(); // de hulp laat dezelfde besturing zien
    $('hulp').hidden = false;
    $('knop-sluit').focus();
  },
  sluit() {
    if ($('hulp').hidden) return;
    $('hulp').hidden = true;
    // Focus niet terug op "?": spatie (springen) zou het venster dan meteen weer openen.
    document.activeElement?.blur();
  },
};

// soort: 'laden' (netwerk of inhoud.json), 'webgl' (deze computer), 'level' (het level zelf klopt niet).
export function toonFoutReden(soort) {
  $('fout-laden').hidden = soort !== 'laden';
  $('fout-webgl').hidden = soort !== 'webgl';
  $('fout-level').hidden = soort !== 'level';
}
