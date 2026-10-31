// De opdracht (?) in de DOM boven het canvas (spelregel 1, DEV.md "Uit onderzoek"):
// - een letter (A, B, C) boven elk antwoordblokje en een ? boven de opdracht;
// - bij de ? (logica: opdracht.actief) de vraag met de antwoorden, elk achter zijn letter;
// - na een landing de terugkoppeling in hetzelfde frame, TERUGKOPPELING_MS zichtbaar: goed = "Goed zo!" plus het
//   goede antwoord, fout = de hint (en meteen opnieuw proberen: niets wacht).
// Waarom letters op de blokjes en de zinnen in het vak: een vakje is ~40 px op het scherm; zinnen van 24 px op de
// blokjes zelf zouden elkaar en de held bedekken. De letter is tekst, geen kleur; alle blokjes zijn gelijk wit.
// Kindteksten via zetInhoud (NL/EN, wisselen mee met de taal); letters en ? zijn losse symbolen.
import { t, zetInhoud } from '../i18n.mjs';

export const TERUGKOPPELING_MS = 1750;
const $ = (id) => document.getElementById(id);

let opdracht = null; // het ding uit de logica
let labels = []; // { el, ding, hoogte (wereld) }
let klok;

function symbool(klasse, tekst) {
  const el = document.createElement('span');
  el.className = klasse;
  el.dataset.symbool = '';
  el.textContent = tekst;
  return el;
}

// Een antwoord is kindinhoud {nl, en} (meerkeuze) of een UI-sleutel {sleutel} (waar-niet-waar). t('waar') en
// t('niet_waar') staan hier letterlijk, zodat de bouw toetst dat ze in beide talen bestaan (non-negotiable 4).
// Hetzelfde element wisselt van soort (de terugkoppeling): het andere taal-attribuut gaat eraf, anders zet vertaal()
// er bij een taalwissel de oude tekst in.
function zetAntwoord(el, tekst) {
  if (tekst?.sleutel === undefined) {
    delete el.dataset.t;
    zetInhoud(el, tekst);
    return;
  }
  const uit = { waar: () => t('waar'), niet_waar: () => t('niet_waar') }[tekst.sleutel];
  if (!uit) throw new Error(`opdracht: onbekende antwoordsleutel '${tekst.sleutel}'`);
  for (const k of ['inhoud', 'nl', 'en']) delete el.dataset[k];
  el.dataset.t = tekst.sleutel;
  el.textContent = uit();
}

export function zetOpdracht(spel) {
  wisOpdracht();
  opdracht = spel.raster.dingen.find((d) => d.soort === 'opdracht') ?? null;
  if (!opdracht) return;
  zetInhoud($('opdracht-vraag'), opdracht.vraag);
  const lijst = $('opdracht-antwoorden');
  for (const b of opdracht.blokjes) {
    const li = document.createElement('li');
    const tekst = document.createElement('span');
    zetAntwoord(tekst, b.tekst);
    li.append(symbool('letter', b.letter), tekst);
    lijst.append(li);
    labels.push({ el: symbool('blok-label', b.letter), ding: b, hoogte: 0.5 });
  }
  labels.push({ el: symbool('blok-label vraagteken', '?'), ding: opdracht, hoogte: 0.1 });
  $('labels').append(...labels.map((l) => l.el));
  // De vraag komt aan de kant van het scherm waar de ? niet is, zodat hij de held niet bedekt.
  $('opdracht').classList.toggle('boven', opdracht.cel[1] >= 6);
}

// Elke frame: labels op hun blokje (de camera staat vast, maar het podium kan van maat veranderen) en de vraag
// in beeld zolang de held in de buurt is.
export function werkOpdrachtBij(naarScherm) {
  if (!opdracht) return;
  const vak = $('opdracht');
  if (vak.hidden === opdracht.actief) vak.hidden = !opdracht.actief;
  for (const { el, ding, hoogte } of labels) {
    if (el.hidden !== (ding.weg === true)) el.hidden = ding.weg === true;
    const teken = opdracht.opgelost ? '✓' : '?';
    if (ding === opdracht && el.textContent !== teken) el.textContent = teken;
    if (el.hidden) continue;
    const p = naarScherm(ding.cel[0] + 0.5, hoogte + 0.2, ding.cel[1] + 0.5);
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
  }
}

// Gebeurtenis 'antwoord' uit de logica: meteen tonen, en na TERUGKOPPELING_MS weer weg.
export function toonAntwoord(e) {
  $('tk-goed').hidden = !e.goed;
  $('tk-fout').hidden = e.goed;
  if (e.goed) zetAntwoord($('tk-antwoord'), e.antwoord);
  else zetInhoud($('tk-hint'), e.hint);
  $('terugkoppeling').hidden = false;
  clearTimeout(klok);
  klok = setTimeout(() => { $('terugkoppeling').hidden = true; }, TERUGKOPPELING_MS);
}

export function wisOpdracht() {
  clearTimeout(klok);
  opdracht = null;
  labels = [];
  $('labels').replaceChildren();
  $('opdracht-antwoorden').replaceChildren();
  $('opdracht').hidden = true;
  $('terugkoppeling').hidden = true;
}
