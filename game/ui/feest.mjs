// Sap in de DOM (DEV.md, Sap en geluid): kleine effecten boven het canvas. Ze komen bij de echte staat en nemen
// nooit de plaats ervan in (een ster verdwijnt meteen in het beeld; hier alleen de vonkjes en de vliegende ster).
// - Deeltjes: stipjes die één keer wegspatten en zichzelf weghalen. WAAPI op transform en opacity: werk voor de
//   compositor en 0 draw calls. Positie via naarScherm, zoals de letters boven de antwoordblokjes.
// - De sterrenteller en "Goed zo" wippen, de hint schuift in beeld, en een schurk die je raakte roept zijn naam
//   (zoals het kind hem schreef, via zetInhoud: geen nieuwe tekst).
// - Eindscherm: het podium met de eigen held, de verdiende sterren één voor één (geen lege plekken), en confetti.
// Flitsen (WCAG 2.3.1): dezelfde soort deeltjes (per bron) hoogstens één keer per GRENS_MS, en elk element is klein
// (onder 25% van een veld van 341x256 px). Behalve het naamlabel van een schurk (de hele naam, groter): dat komt
// hoogstens één keer per GRENS_MS, dus nooit meer dan 3 per seconde. uitbarstingen() laat de speeltest de echte
// tijdstempels lezen.
// Verminderde beweging (instelling van de computer): geen vliegende ster, geen springende held, en de confetti
// vervaagt ter plekke (12 stukjes).
// CSP: alleen CSSOM (el.style) en el.animate(); nooit een style-attribuut in HTML.
import { zetInhoud } from '../i18n.mjs';
import { hupFase } from '../logica/vijanden.mjs';

const $ = (id) => document.getElementById(id);
export const GRENS_MS = 350; // één soort deeltjes (per bron) hoogstens één keer per 350 ms: nooit meer dan 3 per seconde
export const MAX_DEELTJES = 80; // meer tegelijk: het oudste gaat eerst weg
export const EIND_STER_START = 0.9; // s na het eindscherm: eerst "Gehaald!" en de fanfare, dan de sterren
export const EIND_STER_STAP = 0.15; // s tussen twee sterren (elk met zijn toon van de sterrenladder)
export const STOF_DREMPEL = 3; // m/s: harder landen geeft stof
const bewegingMq = matchMedia('(prefers-reduced-motion: reduce)'); // één lijst, die de instelling live volgt
const minder = () => bewegingMq.matches;
const kans = (a, b) => a + Math.random() * (b - a); // alleen uiterlijk: geen regel hangt hiervan af

// Per soort: aantal, kleuren (klassen in stijl.css), grootte (px), duur (ms) en de beweging.
const SOORTEN = {
  ster: { n: 10, kleuren: ['goud', 'wit'], grootte: [8, 14], duur: 500, hoek: [-160, -20], afstand: [30, 70], val: 30 },
  poef: { n: 12, kleuren: ['grijs', 'wit'], grootte: [10, 18], duur: 500, hoek: [-180, 180], afstand: [25, 55], val: 0 },
  fontein: { n: 20, kleuren: ['goud', 'wit', 'goud'], grootte: [8, 14], duur: 800, hoek: [-120, -60], afstand: [50, 110], val: 60 },
  vonk: { n: 8, kleuren: ['wit'], grootte: [6, 10], duur: 500, hoek: [-180, 0], afstand: [20, 45], val: 15 },
  stof: { n: 6, kleuren: ['beige', 'wit'], grootte: [8, 14], duur: 350, hoek: [-170, -10], afstand: [20, 40], val: 20 },
};

let laatst = new Map(); // soort+bron -> tijdstip (performance.now) van de vorige spuit
const LOG_MAX = 200;
const log = []; // { nr, soort, bron, t }: de echte uitbarstingen (alleen in het geheugen, niets over het kind)
let nr = 0;
function noteer(soort, bron, t) {
  log.push({ nr: ++nr, soort, bron, t });
  if (log.length > LOG_MAX) log.shift();
}
// Leeshaak voor de speeltest (alleen lezen): wanneer (performance.now) welke uitbarsting echt kwam.
export const uitbarstingen = () => log.map((e) => ({ ...e }));
let roepen = []; // { el, v, hoog }: naamlabels die meebewegen met hun schurk
let baasFase = []; // hupfase per eindbaas, vorige frame (landen = de fase springt terug naar 0)
let gepauzeerd = false;

// Eén uitbarsting deeltjes op (x, y) in px van het canvas. Geeft het aantal, of 0 binnen de grens.
export function spuit(soort, { x, y }, bron = '') {
  const s = SOORTEN[soort];
  const laag = $('deeltjes');
  const nu = performance.now();
  const sleutel = `${soort}:${bron}`;
  if (!s || !laag || nu - (laatst.get(sleutel) ?? -Infinity) < GRENS_MS) return 0;
  laatst.set(sleutel, nu);
  noteer(soort, bron, nu);
  for (let i = 0; i < s.n; i++) {
    while (laag.childElementCount >= MAX_DEELTJES) laag.firstElementChild.remove();
    const el = document.createElement('span');
    el.className = `sap deeltje ${s.kleuren[i % s.kleuren.length]}`;
    el.dataset.soort = soort;
    const g = kans(...s.grootte);
    el.style.width = `${g}px`;
    el.style.height = `${g}px`;
    const hoek = (kans(...s.hoek) * Math.PI) / 180;
    const ver = kans(...s.afstand);
    const [dx, dy] = [Math.cos(hoek) * ver, Math.sin(hoek) * ver];
    const [x0, y0] = [x - g / 2, y - g / 2];
    laag.append(el);
    const a = el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${x0 + dx * 0.75}px, ${y0 + dy * 0.75}px) scale(0.9)`, opacity: 0.9, offset: 0.45 },
      { transform: `translate(${x0 + dx}px, ${y0 + dy + s.val}px) scale(0.3)`, opacity: 0 },
    ], { duration: s.duur * kans(0.85, 1.15), easing: 'ease-out' });
    a.onfinish = () => el.remove();
    if (gepauzeerd) a.pause();
  }
  // Ster: ook een grote gouden stip die in 0,3 s groeit en vervaagt.
  if (soort === 'ster') {
    const el = document.createElement('span');
    el.className = 'sap deeltje goud stip';
    el.dataset.soort = soort;
    laag.append(el);
    const a = el.animate([
      { transform: `translate(${x - 20}px, ${y - 20}px) scale(0.3)`, opacity: 0.9 },
      { transform: `translate(${x - 20}px, ${y - 20}px) scale(1.6)`, opacity: 0 },
    ], { duration: 300, easing: 'ease-out' });
    a.onfinish = () => el.remove();
    if (gepauzeerd) a.pause();
  }
  return s.n;
}

// Een element even laten wippen (scale), los van zijn eigen transform in stijl.css.
function wip(el, van = 1.25, duur = 250) {
  if (!el || el.hidden) return;
  el.animate({ scale: [van, 1] }, { duration: duur, easing: 'cubic-bezier(.3,1.6,.6,1)' });
}

// De ster vliegt van zijn plek naar de sterrenteller (450 ms), en de teller wipt. Verminderde beweging: alleen de wip.
function vliegSter({ x, y }) {
  const pil = $('hud-sterren');
  if (minder() || !pil || pil.hidden) return wip(pil);
  const doel = (pil.querySelector('.ster-teken') ?? pil).getBoundingClientRect();
  const podium = $('podium').getBoundingClientRect();
  const [tx, ty] = [doel.left - podium.left + doel.width / 2, doel.top - podium.top + doel.height / 2];
  const el = document.createElement('span');
  el.className = 'sap vlieg-ster';
  el.dataset.symbool = '';
  el.dataset.soort = 'ster';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = '★';
  $('deeltjes').append(el);
  const a = el.animate([
    { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(1.5)`, opacity: 1 },
    { transform: `translate(${(x + tx) / 2}px, ${Math.min(y, ty) - 60}px) translate(-50%, -50%) scale(1.3)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.8)`, opacity: 0.9 },
  ], { duration: 450, easing: 'ease-in-out' });
  a.onfinish = () => { el.remove(); wip(pil); };
  if (gepauzeerd) a.pause();
}

// Hoeveel regels tekst een element heeft (line-height in px in stijl.css).
function regels(el) {
  const s = getComputedStyle(el);
  return Math.round((el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / parseFloat(s.lineHeight));
}

// De schurk die je raakte, roept zijn naam: een label boven hem, 1,5 s, dat met hem meebeweegt (werkBij). De hele naam
// (tot 60 tekens, besluit meester 29 sep: nooit afgekapt), op hoogstens 2 regels: eerst smal; past hij zo niet op 2
// regels (brede letters, geen spaties), dan breed. Het label is groter dan de oppervlaktegrens voor een flits; daarom
// komt het hoogstens één keer per GRENS_MS (over alle schurken samen): nooit meer dan 3 per seconde (WCAG 2.3.1).
function roep(v, naam) {
  const nu = performance.now();
  if (!naam || nu - (laatst.get('roep') ?? -Infinity) < GRENS_MS) return;
  laatst.set('roep', nu);
  noteer('roep', '', nu);
  const el = document.createElement('span');
  el.className = 'sap roep';
  el.dataset.soort = 'roep';
  zetInhoud(el, naam);
  $('deeltjes').append(el);
  if (regels(el) > 2) el.classList.add('breed');
  // De maat blijft gelijk (NL = EN, datacontract): één keer meten, niet elke frame.
  const item = { el, v, hoog: v.eindbaas ? 3 : 2.2, b: el.offsetWidth, h: el.offsetHeight };
  roepen.push(item);
  const a = el.animate([
    { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1.1, offset: 0.1 }, { opacity: 1, scale: 1, offset: 0.2 },
    { opacity: 1, scale: 1, offset: 0.85 }, { opacity: 0, scale: 1 },
  ], { duration: 1500 });
  a.onfinish = () => { el.remove(); roepen = roepen.filter((r) => r !== item); };
  if (gepauzeerd) a.pause();
}

// Gebeurtenissen van deze frame (spel.mjs, tik) -> effecten. naarScherm: wereld -> px van het canvas.
// naamVan(id): de naam {nl, en} van een figuur uit de goedgekeurde inhoud.
export function bij(gebeurtenissen, spel, { naarScherm, naamVan }) {
  const { held } = spel;
  for (const e of gebeurtenissen) {
    switch (e.soort) {
      case 'ster': {
        const p = naarScherm(e.cel[0] + 0.5, 0.5, e.cel[1] + 0.5);
        if (spuit('ster', p)) vliegSter(p);
        break;
      }
      case 'geraakt': {
        const [x, y, z] = e.waar;
        spuit('poef', naarScherm(x, y + 0.4, z));
        const v = spel.vijanden[e.door];
        if (v) roep(v, naamVan(v.figuur));
        break;
      }
      case 'raak': { // een witte bloedcel raakte een schurk: poef, en hij roept zijn naam
        const [x, y, z] = e.waar;
        spuit('poef', naarScherm(x, y + 0.4, z), `raak${e.door}`);
        const v = spel.vijanden[e.door];
        if (v) roep(v, naamVan(v.figuur));
        break;
      }
      case 'antwoord':
        if (e.goed) {
          spuit('fontein', naarScherm(held.x, held.y + 0.1, held.z));
          wip($('terugkoppeling'), 0.8, 250);
          wip($('hud-vitamine'));
        } else {
          $('terugkoppeling')?.animate({ translate: ['0 8px', '0 0'] }, { duration: 150, easing: 'ease-out' });
        }
        break;
      case 'checkpoint': spuit('vonk', naarScherm(e.cel[0] + 0.5 - 0.28, 1.34, e.cel[1] + 0.5)); break;
      case 'land': if (e.snelheid > STOF_DREMPEL) spuit('stof', naarScherm(held.x, held.grond, held.z), 'held'); break;
      default:
    }
  }
}

// Elke frame in het spel: naamlabels volgen hun schurk, en een landende eindbaas geeft stof (zonder geluid).
export function werkBij(spel, naarScherm) {
  const breed = $('deeltjes')?.clientWidth ?? 0;
  for (const { el, v, hoog, b, h } of roepen) {
    const p = naarScherm(v.x, v.y + hoog, v.z);
    // Altijd helemaal in beeld (#deeltjes knipt af): hoogstens tot 8 px van de rand, ook boven een schurk aan de rand.
    const x = Math.min(Math.max(p.x, b / 2 + 8), breed - b / 2 - 8);
    const y = Math.max(70, h + 8, p.y);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }
  spel.vijanden.forEach((v, i) => {
    if (!v.eindbaas || v.weg) return;
    const f = hupFase(v, spel.tijd);
    if (baasFase[i] !== undefined && f < baasFase[i]) spuit('stof', naarScherm(v.x, 0, v.z), `baas${i}`);
    baasFase[i] = f;
  });
}

// Hulp open: de deeltjes staan stil, net als het spel. Pas iets doen als de stand verandert.
export function pauzeer(stil) {
  if (stil === gepauzeerd) return;
  gepauzeerd = stil;
  for (const a of document.getAnimations()) {
    if (a.effect?.target?.closest?.('#deeltjes')) stil ? a.pause() : a.play();
  }
}

// Alles weg (terug naar start, naar het eindscherm): deeltjes, labels en confetti.
export function wis() {
  $('deeltjes')?.replaceChildren();
  $('confetti')?.replaceChildren();
  roepen = [];
  baasFase = [];
  laatst = new Map();
}

// Het eindscherm als podium: de eigen tekening groot, de naam en de maker, de verdiende sterren één voor één
// (EIND_STER_START + i x EIND_STER_STAP; main.mjs speelt er de toon van de sterrenladder bij), en confetti.
export function eind({ held, sterren }) {
  $('eind-held').src = `figuren/${held.id}.png`;
  zetInhoud($('eind-naam'), held.naam);
  zetInhoud($('eind-maker'), { nl: held.maker, en: held.maker });
  $('eind-sterren').hidden = sterren === 0;
  const rij = $('eind-sterren-rij');
  rij.replaceChildren();
  // Een schermlezer hoort het aantal ("Sterren 3"), niet drie keer "ster": de tekens zelf zijn aria-hidden.
  const aantal = document.createElement('span');
  aantal.className = 'voor-schermlezer';
  aantal.dataset.symbool = '';
  aantal.textContent = String(sterren);
  rij.append(aantal);
  for (let i = 0; i < sterren; i++) {
    const el = document.createElement('span');
    el.className = 'sap eind-ster';
    el.dataset.symbool = '';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '★';
    rij.append(el);
    el.animate([{ scale: 0, opacity: 0 }, { scale: 1.35, opacity: 1, offset: 0.6 }, { scale: 1, opacity: 1 }],
      { duration: 250, delay: (EIND_STER_START + i * EIND_STER_STAP) * 1000, fill: 'backwards', easing: 'ease-out' });
  }
  $('scherm-eind').querySelector('.feest')?.animate({ scale: [0.6, 1.1, 1] }, { duration: 400, easing: 'ease-out' });
  if (!minder()) {
    $('eind-held').animate([
      { translate: '0 0' }, { translate: '0 -28px', offset: 0.3 }, { translate: '0 0', offset: 0.55 }, { translate: '0 0' },
    ], { duration: 600, iterations: 3, delay: 200, easing: 'ease-in-out' });
  }
  confetti();
}

// Confetti: 40 stukjes (rechthoekjes en sterren in goud, wit en crème; geen lesskleuren) die één keer vallen en
// zichzelf weghalen. Verminderde beweging: 12 stukjes die ter plekke verschijnen en vervagen.
function confetti() {
  const laag = $('confetti');
  laag.replaceChildren();
  const { width, height } = laag.getBoundingClientRect();
  const stil = minder();
  const n = stil ? 12 : 40;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = `sap snipper k${i % 5}`;
    el.dataset.soort = 'confetti';
    if (i % 4 === 0) {
      el.classList.add('ster');
      el.dataset.symbool = '';
      el.textContent = '★';
    }
    laag.append(el);
    const x = kans(0, width);
    let a;
    if (stil) {
      const y = kans(0.1, 0.9) * height;
      el.style.transform = `translate(${x}px, ${y}px)`;
      a = el.animate({ opacity: [0, 1, 1, 0] }, { duration: 2500, delay: kans(0, 400), fill: 'backwards' });
    } else {
      const draai = kans(-540, 540);
      const drift = kans(-80, 80);
      a = el.animate([
        { transform: `translate(${x}px, -30px) rotate(0deg)` },
        { transform: `translate(${x + drift}px, ${height + 30}px) rotate(${draai}deg)` },
      ], { duration: kans(2200, 3200), delay: kans(0, 300), easing: 'cubic-bezier(.3,.1,.7,1)', fill: 'backwards' });
    }
    a.onfinish = () => el.remove();
  }
}
