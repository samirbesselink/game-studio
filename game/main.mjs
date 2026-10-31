// Opstart en spellus. Verbindt de gebundelde inhoud (inhoud.json), i18n, de UI, de logica en het beeld.
// PlayCanvas zit alleen in beeld/; de logica weet niets van beeld of DOM.
import { laadTeksten, taal, zetTaal } from './i18n.mjs';
import { huidigScherm, startBeursmodus, toonScherm, vulHelden, vulLevels } from './ui/menu.mjs';
import { hulp, toonFoutReden, toonHint, toonHud, verbergHint, verbergHud, vulBesturing, werkHudBij } from './ui/overlay.mjs';
import { toonAntwoord, werkOpdrachtBij, wisOpdracht, zetOpdracht } from './ui/opdracht.mjs';
import * as feest from './ui/feest.mjs';
import { maakGeluid } from './geluid.mjs';
import { maakSpel, tik, vraagGooi, vraagSprong } from './logica/spel.mjs';
import { zaadRandom } from './logica/schud.mjs';
import { HALF } from './logica/beweging.mjs';
import { VIJAND_HALF } from './logica/vijanden.mjs';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BEURS_SECONDEN = params.has('beurs') ? Number(params.get('beurs')) : 45; // ?beurs=0 zet de beursmodus uit
// Geluid staat standaard aan; ?geluid=uit (precies 'uit') is de beginstand voor de klas. Dit is geen spelregel: het
// verandert alleen of je iets hoort. De stand leeft alleen in het geheugen van de pagina (besluit 008).
const GELUID_START = params.get('geluid') !== 'uit';
const geluid = maakGeluid({ startAan: GELUID_START });
const HINT_SECONDEN = 10;
const LAAD_SECONDEN = 25; // inhoud.json en de figuurtexturen; daarna het foutscherm 'laden' met "opnieuw"
// ?seed=<geheel getal> (voor tests): elke beurt dezelfde volgorde van schudden (klasschurken, antwoordblokjes).
// Geen regel verandert. Zonder (geldige) seed: echt willekeurig.
const ZAAD = /^-?\d{1,9}$/.test(params.get('seed') ?? '') ? Number(params.get('seed')) : null;

let inhoud = null;
let beeld = null;
let spel = null;
let heldId = null;
let levelNr = 0; // plek van het gespeelde level in inhoud.levels (op wereldnummer)
let beurt = 0; // telt op bij elke nieuwe beurt, zodat een oude laadactie niets meer overschrijft
const ingedrukt = new Set();

// Voor de speeltest: alleen lezen. Welk antwoordblokje goed is, staat er bewust niet in.
window.spelstaat = () => {
  const o = spel?.raster.dingen.find((d) => d.soort === 'opdracht');
  return {
    scherm: huidigScherm(),
    taal: taal(),
    hulpOpen: hulp.isOpen(),
    level: spel?.level.id ?? null,
    held: spel ? heldId : null,
    cel: spel ? [...spel.held.cel] : null,
    x: spel?.held.x ?? null,
    y: spel?.held.y ?? null,
    z: spel?.held.z ?? null,
    opGrond: spel?.held.opGrond ?? null,
    vy: spel?.held.vy ?? null,
    tijd: spel?.tijd ?? null,
    sterren: spel?.sterren ?? null,
    vitamines: spel?.vitamines ?? null,
    terugGezet: spel?.terugGezet ?? null,
    checkpoint: spel?.checkpoint ?? null,
    botsvorm: { held: 2 * HALF, vijand: 2 * VIJAND_HALF },
    vijanden: (spel?.vijanden ?? []).map(({ v, cel, figuur, eindbaas, beweging, x, y, z, leven, weg }) => ({ v, cel, figuur, eindbaas, beweging, x, y, z, leven, weg })),
    ballen: spel?.ballen.length ?? 0,
    hartslag: spel ? (({ bpm, slagen, slagTijd }) => ({ bpm, slagen, slagTijd }))(spel.hartslag) : null,
    afweer: spel ? { voorraad: spel.afweer.voorraad } : null,
    buit: spel ? spel.buit.map(({ actief, cel, aantal }) => ({ actief, cel, aantal })) : [],
    vlotten: spel ? spel.raster.dingen.filter((d) => d.soort === 'vlot').map(({ cel, x, z }) => ({ cel, x, z })) : [],
    hoogtes: spel ? spel.raster.dingen.filter((d) => d.hoogte !== undefined).map((d) => ({ soort: d.soort, cel: d.cel, hoogte: d.hoogte })) : [],
    opdracht: o ? {
      cel: o.cel, actief: o.actief, opgelost: o.opgelost,
      blokjes: o.blokjes.map(({ cel, letter, tekst, weg }) => ({ cel, letter, tekst, weg })),
    } : null,
  };
};
window.beeldstaat = () => beeld?.staat() ?? null;
window.geluidstaat = () => geluid.staat();
// Voor de speeltest (alleen lezen): waar een punt van de wereld op het canvas staat (css-px), om de look te meten.
window.naarScherm = (x, y, z) => beeld?.naarScherm(x, y, z) ?? null;

function toonFout(soort, fout) {
  toonFoutReden(soort);
  toonScherm('fout');
  throw fout; // zichtbaar in de console en rood in de speeltest
}

// Een belofte met een tijdslimiet: na LAAD_SECONDEN een fout (en `stop` breekt af wat nog loopt). Zonder dit blijft
// een Chromebook op haperende wifi eeuwig op "Laden…" staan.
function metTijdslimiet(belofte, wat, stop) {
  return new Promise((ok, fout) => {
    const klok = setTimeout(() => {
      stop?.();
      fout(new Error(`${wat}: geen antwoord na ${LAAD_SECONDEN} s`));
    }, LAAD_SECONDEN * 1000);
    belofte.then((w) => { clearTimeout(klok); ok(w); }, (e) => { clearTimeout(klok); fout(e); });
  });
}

async function opstarten() {
  toonScherm('laden');
  $('knop-opnieuw').addEventListener('click', () => location.reload());
  try {
    // Zonder ?meet komt het meetinstrument niet eens over het netwerk. Het moet vóór PlayCanvas laden.
    if (params.has('meet')) await import('./meet.mjs');
    const afbreken = new AbortController();
    inhoud = await metTijdslimiet((async () => {
      const antwoord = await fetch('inhoud.json', { cache: 'no-cache', signal: afbreken.signal });
      if (!antwoord.ok) throw new Error(`inhoud.json: HTTP ${antwoord.status}`);
      return antwoord.json();
    })(), 'inhoud.json', () => afbreken.abort());
    laadTeksten(inhoud.teksten);
    vulBesturing();
    zetTaal('nl');
    document.documentElement.classList.add('teksten-geladen'); // de terugval uit de bouw is niet meer nodig
    $('knop-taal').lang = 'en';
    $('knop-taal').hidden = false;
    zetGeluidKnop();
    $('knop-geluid').hidden = false;
  } catch (e) {
    toonFout('laden', e);
  }
  try {
    const { maakBeeld } = await import('./beeld/wereld.mjs');
    beeld = maakBeeld($('doek'));
  } catch (e) {
    toonFout(e.message.includes('WebGL') ? 'webgl' : 'laden', e);
  }

  // Levels op wereldnummer, dan id. Een beurt begint bij het eerste (Health Fair: het hart); na de finish kan het kind
  // met dezelfde held door naar het volgende.
  inhoud.levels.sort((a, b) => a.wereld - b.wereld || (a.id < b.id ? -1 : 1));
  // Een fout in het level zelf (onbekend symbool, verkeerde kaart) krijgt een eigen tekst, niet "kon niet laden".
  const start = (id, nr) => speel(id, nr).catch((e) => toonFout(e.name === 'LevelFout' ? 'level' : 'laden', e));
  // Na de held het level (meer dan één level): een kaart per level, op volgorde. Bij één level meteen spelen.
  vulHelden(inhoud.figuren.filter((f) => f.soort === 'held'), (id) => {
    geluid.speel('start'); // je kiest je eigen tekening
    heldId = id;
    if (inhoud.levels.length > 1) toonScherm('level');
    else start(id, 0);
  });
  vulLevels(inhoud.levels, (nr) => {
    geluid.speel('start');
    start(heldId, nr);
  });
  $('knop-volgend').addEventListener('click', () => {
    geluid.stopAlles(); // geen halve fanfare in het volgende level
    feest.wis();
    geluid.speel('start');
    start(heldId, levelNr + 1);
  });
  $('knop-start').addEventListener('click', () => {
    geluid.speel('start');
    toonScherm('kies');
  });
  $('knop-naar-start').addEventListener('click', naarStart);
  $('knop-taal').addEventListener('click', wisselTaal);
  // De focus blijft op de knop (een toetsenbordgebruiker houdt zijn plek). Spatie of een pijl in het spel wisselt niet
  // nog eens: de toetsen hieronder doen preventDefault en halen de focus van de knop.
  $('knop-geluid').addEventListener('click', wisselGeluid);
  $('knop-hulp').addEventListener('click', () => hulp.open());
  $('knop-sluit').addEventListener('click', () => hulp.sluit());
  beeld.elkFrame(frame);
  // Na de beurstijd zonder invoer: het geluid terug op de beginstand van de pagina (ook op het startscherm: de keuze
  // van het vorige kind neemt het volgende niet mee), en vanaf een ander scherm terug naar start.
  startBeursmodus(BEURS_SECONDEN, naarStart, () => {
    geluid.zetAan(GELUID_START, { stil: true });
    zetGeluidKnop();
  });
  naarStart();
}

// De knop volgt de stand (aria-pressed; het icoon wisselt in stijl.css op aria-pressed, dus ze lopen nooit uiteen).
function zetGeluidKnop() {
  $('knop-geluid').setAttribute('aria-pressed', String(geluid.isAan()));
}

function wisselGeluid() {
  geluid.zetAan(!geluid.isAan());
  zetGeluidKnop();
}

function wisselTaal() {
  const knop = $('knop-taal');
  knop.lang = taal(); // de knop noemt straks de taal die we nu verlaten
  zetTaal(taal() === 'nl' ? 'en' : 'nl');
  if (huidigScherm() === 'spel' && !hulp.isOpen()) knop.blur(); // spatie is springen, geen tweede wissel
}

async function speel(id, nr) {
  const dezeBeurt = ++beurt;
  toonScherm('laden');
  // De klasschurken: alle goedgekeurde figuren van soort slechterik; de logica schudt ze over de V-plekken.
  const schurken = inhoud.figuren.filter((f) => f.soort === 'slechterik').map((f) => f.id);
  const nieuw = maakSpel(inhoud.levels[nr], { schurken, random: ZAAD === null ? Math.random : zaadRandom(ZAAD) });
  let texturen;
  try {
    const urls = [id, ...nieuw.vijanden.map((v) => v.figuur)].map((f) => `figuren/${f}.png`);
    texturen = await metTijdslimiet(beeld.laadTexturen(urls), 'figuren');
  } catch (e) {
    if (dezeBeurt !== beurt) return; // intussen terug naar start (beursmodus): hoort bij een oude beurt
    throw e;
  }
  if (dezeBeurt !== beurt) return;
  spel = nieuw;
  heldId = id;
  levelNr = nr;
  beeld.bouwLevel(spel);
  beeld.zetFiguren(spel, texturen);
  zetOpdracht(spel);
  if (window.meet) {
    const { driehoeken, figuren } = beeld.telFiguren();
    window.meet.held(driehoeken, figuren);
  }
  window.meet?.cel(...spel.held.cel);
  toonHud(spel.level);
  werkHudBij(spel);
  toonScherm('spel');
  toonHint(HINT_SECONDEN);
  beeld.naVolgendFrame(() => window.meet?.eersteBeeld());
}

function stopBeurt() {
  ingedrukt.clear();
  hulp.sluit();
  verbergHud();
  verbergHint();
  wisOpdracht();
}

function naarStart() {
  beurt++;
  stopBeurt();
  geluid.stopAlles(); // geen halve fanfare op het startscherm
  feest.wis();
  spel = null;
  beeld.leeg();
  toonScherm('start');
}

function naarEind() {
  window.meet?.finish();
  const { sterren } = spel;
  stopBeurt();
  feest.wis();
  const knopVolgend = $('knop-volgend');
  knopVolgend.hidden = levelNr + 1 >= inhoud.levels.length;
  toonScherm('eind');
  if (!knopVolgend.hidden) knopVolgend.focus(); // door naar het volgende level is de eerste keuze
  feest.eind({ held: inhoud.figuren.find((f) => f.id === heldId), sterren });
  for (let i = 0; i < sterren; i++) {
    geluid.speel('ster', { bron: 'eind', ladder: i, na: feest.EIND_STER_START + i * feest.EIND_STER_STAP });
  }
}

// Geluid mag pas binnen een gebaar beginnen (autoplay): elke echte klik of toets ontgrendelt het.
for (const soort of ['pointerdown', 'keydown']) addEventListener(soort, (e) => geluid.ontgrendel(e), { capture: true });

// Toetsen: pijltjes of WASD = lopen, spatie = springen, F = gooien, H = hulp, Esc = hulp dicht, M = geluid aan/uit
// (elk scherm).
const SPELTOETSEN = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
const houdt = (...codes) => codes.some((c) => ingedrukt.has(c));

addEventListener('keydown', (e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    wisselGeluid();
    return;
  }
  if (huidigScherm() !== 'spel' || !spel) return;
  if (hulp.isOpen()) {
    if (e.key === 'Escape') {
      e.preventDefault();
      hulp.sluit();
    }
    return;
  }
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    hulp.open();
    return;
  }
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) { // Ctrl/Cmd+F blijft zoeken in de browser
    e.preventDefault();
    vraagGooi(spel, { herhaal: e.repeat }); // ingedrukt houden gooit om de PAUZE; bij 0 alleen een nieuwe druk geeft leeg
    return;
  }
  if (!SPELTOETSEN.has(e.code)) return;
  e.preventDefault(); // geen scrollen, en spatie activeert geen knop
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  ingedrukt.add(e.code);
  if (e.code === 'Space') vraagSprong(spel);
});
addEventListener('keyup', (e) => ingedrukt.delete(e.code));
addEventListener('blur', () => ingedrukt.clear());

function richting() {
  const x = houdt('KeyD', 'ArrowRight') - houdt('KeyA', 'ArrowLeft');
  const z = houdt('KeyS', 'ArrowDown') - houdt('KeyW', 'ArrowUp');
  const lengte = Math.hypot(x, z);
  return lengte ? { x: x / lengte, z: z / lengte } : { x: 0, z: 0 };
}

// Zo heet een figuur (zoals het kind hem schreef), voor de schurk die zijn naam roept.
const naamVan = (id) => inhoud.figuren.find((f) => f.id === id)?.naam ?? null;

function frame(dt) {
  feest.pauzeer(hulp.isOpen());
  if (!spel || huidigScherm() !== 'spel' || hulp.isOpen()) return;
  const gebeurd = tik(spel, richting(), dt);
  for (const [k, r] of gebeurd.cellen) window.meet?.cel(k, r);
  for (let i = 0; i < gebeurd.sprongen; i++) window.meet?.sprong();
  const g = gebeurd.gebeurtenissen;
  for (const e of g) if (e.soort === 'antwoord') toonAntwoord(e);
  // Sap: geluid, animaties in het beeld en effecten in de DOM lezen dezelfde gebeurtenissen; niets verandert het spel.
  geluid.bij(g, spel);
  beeld.effecten(g, spel);
  beeld.werkBij(spel);
  feest.bij(g, spel, { naarScherm: beeld.naarScherm, naamVan });
  feest.werkBij(spel, beeld.naarScherm);
  werkHudBij(spel, g);
  werkOpdrachtBij(beeld.naarScherm);
  if (spel.gehaald) naarEind();
}

opstarten();
