// Geluid (DEV.md, Sap en geluid): korte klanken bij wat er in het spel gebeurt, gesynthetiseerd met Web Audio.
// Geen geluidsbestanden, geen muziek en geen woorden (dus geen NL/EN nodig). Geluid is nooit de enige informatie:
// elke klank heeft een beeld ernaast. Zonder Web Audio (of als de Chromebook geluid blokkeert) speelt de game stil door.
// - KLANKEN: recepten (ctx, uit, t, { sterkte, toon, ladder }) -> hoorbare duur in s (tot -40 dB onder de piek).
//   Puur: dezelfde functie draait in een OfflineAudioContext (tests/speeltest.mjs, tests/klankbord.mjs).
// - maakKetting(ctx): stemmen -> meester (0,7) -> begrenzer -> lowpass 6 kHz -> analyser (leeshaak, ~0,7 s) -> uitgang.
// - maakGeluid({ startAan }): de dienst van de game. Een AudioContext pas binnen een gebaar (autoplay); aan/uit
//   alleen in het geheugen van de pagina (besluit 008: niets bewaren over het kind); limieten tegen irritatie.
// Alle klanken liggen tussen 300 Hz en 4 kHz: een Chromebook-speaker geeft niets onder ~200 Hz weer.
import { zaadRandom } from './logica/schud.mjs';

export const MEESTER = 0.7;
export const MAX_STEMMEN = 8; // tegelijk; bij 8 vervalt een nieuwe bewegingsklank, een betekenisklank speelt altijd
export const VOORUIT = 0.02; // s: elke klank begint iets na nu, anders ligt de aanzet op een drukke Chromebook al achter ons
export const UITLOOP = 0.03; // s na de hoorbare duur: uitdoven van -40 naar -80 dB, dan pas stoppen (geen klik)
// Bewegingsklanken gebeuren vaak: zacht, kort, toon ±4% per keer, en ze wijken voor betekenisklanken.
// De hartslag (klop) wijkt ook, maar houdt zijn toon: een hart dat van toon verspringt, strompelt.
export const BEWEGING = new Set(['sprong', 'land', 'klop', 'gooi', 'leeg']);
// Hoogstens één keer per zoveel s (dezelfde klank): tegen gezeur bij herhalen.
export const LIMIET = Object.freeze({ sprong: 0.08, land: 0.1, geraakt: 0.5, fout: 0.6, gooi: 0.3, leeg: 0.4 });
export const LAND_DREMPEL = 6; // m/s: een gewone sprong (5,5) landt stil; van de lift of een trede af hoor je hem
// De hartslag van de held (logica/hartslag.mjs) klinkt zoveel later dan de logica hem zag, op een vast anker tussen
// speltijd en audiotijd: zo liggen de kloppen precies op hun afstand, niet op de frame waarin ze gezien werden. De puls
// van het hartje in de HUD wacht net zo lang (main.mjs).
export const LATENTIE = 0.1; // s
// De sterrenladder: per beurt een toon hoger (pentatonisch). 4 sterren in het hart-level = het akkoord C-E-G-C af.
export const LADDER = Object.freeze([523.25, 659.25, 783.99, 1046.5, 1174.66, 1318.51, 1567.98]);
const LOG_MAX = 50;

// --- Bouwstenen --------------------------------------------------------------------------------------------------
// Gain-omhulling: lineair op in `aan` s (minstens 2 ms: geen klik), exponentieel naar piek/100 op t + duur, dan in
// UITLOOP naar piek/10000. Na t + duur + UITLOOP is de bron gestopt.
function omhulling(ctx, uit, t, piek, aan, duur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(piek, t + aan);
  g.gain.exponentialRampToValueAtTime(piek * 0.01, t + duur);
  g.gain.exponentialRampToValueAtTime(piek * 0.0001, t + duur + UITLOOP);
  g.connect(uit);
  return g;
}

function filter(ctx, type, f, Q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = Q;
  return b;
}

// Een oscillator met omhulling; `naar` + `glij`: exponentieel glijden van f naar `naar` in `glij` s. `door`: een
// filter tussen oscillator en omhulling. Geeft de oscillator (voor vibrato).
function noot(ctx, uit, t, { vorm = 'sine', f, naar = null, glij = 0, piek, aan = 0.003, duur, door = null }) {
  const env = omhulling(ctx, uit, t, piek, aan, duur);
  const o = ctx.createOscillator();
  o.type = vorm;
  o.frequency.setValueAtTime(f, t);
  if (naar) o.frequency.exponentialRampToValueAtTime(naar, t + glij);
  if (door) o.connect(door).connect(env);
  else o.connect(env);
  o.start(t);
  o.stop(t + duur + UITLOOP);
  return o;
}

// Witte ruis: één buffer van 1 s per context, met een vaste seed (zaadRandom), zodat de offline test herhaalbaar is.
const ruisBuffers = new WeakMap();
function ruis(ctx, uit, t, { piek, aan = 0.002, duur, door }) {
  let buffer = ruisBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const r = zaadRandom(8);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    ruisBuffers.set(ctx, buffer);
  }
  const bron = ctx.createBufferSource();
  bron.buffer = buffer;
  bron.loop = true;
  bron.connect(door).connect(omhulling(ctx, uit, t, piek, aan, duur));
  bron.start(t);
  bron.stop(t + duur + UITLOOP);
}

// Een filter waarvan de frequentie in `in` s van f0 naar f1 glijdt (het "zwoesj" van de klep, het wapperen van de vlag).
function sweep(ctx, t, type, f0, f1, duur, Q) {
  const b = filter(ctx, type, f0, Q);
  b.frequency.setValueAtTime(f0, t);
  b.frequency.exponentialRampToValueAtTime(f1, t + duur);
  return b;
}

// --- Recepten ----------------------------------------------------------------------------------------------------
// Betekenisklanken (ster, goed, fout, finish, ...) zijn elke keer gelijk: kinderen leren ze herkennen. Ster, goed en
// finish zijn blokgolven door een lowpass van 3 kHz ("echte game", en ze snijden door het lawaai van een beurszaal).
// Bewegingsklanken zijn zachte sinussen. Luidheid volgt zeldzaamheid: wat vaak gebeurt, klinkt zacht en kort.
export const KLANKEN = Object.freeze({
  // Springen: een zacht "bwip" omhoog.
  sprong(ctx, uit, t, { toon = 1 } = {}) {
    noot(ctx, uit, t, { f: 320 * toon, naar: 640 * toon, glij: 0.11, piek: 0.15, aan: 0.005, duur: 0.13 });
    return 0.13;
  },
  // Gooien (F): een zacht "fwiet" dat wegvliegt, een korte ruisvlaag omhoog.
  gooi(ctx, uit, t, { toon = 1 } = {}) {
    noot(ctx, uit, t, { f: 520 * toon, naar: 980 * toon, glij: 0.1, piek: 0.08, aan: 0.004, duur: 0.12 });
    ruis(ctx, uit, t, { piek: 0.06, aan: 0.01, duur: 0.1, door: sweep(ctx, t, 'bandpass', 1200, 3200, 0.1, 2) });
    return 0.12;
  },
  // Raak: de witte bloedcel ruimt de schurk op, een bubbelende "plop" omlaag met een tik erbij.
  raak(ctx, uit, t) {
    noot(ctx, uit, t, { vorm: 'triangle', f: 880, naar: 330, glij: 0.18, piek: 0.22, aan: 0.003, duur: 0.25 });
    ruis(ctx, uit, t, { piek: 0.25, duur: 0.03, door: filter(ctx, 'bandpass', 1800, 2) });
    return 0.25;
  },
  // Landen na een flinke val: een dof "tup". sterkte 0-1 volgt de valsnelheid.
  land(ctx, uit, t, { sterkte = 1, toon = 1 } = {}) {
    const piek = 0.2 * sterkte;
    noot(ctx, uit, t, { f: 450 * toon, naar: 300 * toon, glij: 0.06, piek, aan: 0.003, duur: 0.08 });
    ruis(ctx, uit, t, { piek: piek * 0.8, duur: 0.025, door: filter(ctx, 'bandpass', 800, 1) });
    return 0.08;
  },
  // Ster: een "pling" met een octaaf erbovenop; de toon stijgt per ster (ladder = de hoeveelste ster, vanaf 0).
  ster(ctx, uit, t, { ladder = 0 } = {}) {
    const f = LADDER[Math.min(Math.max(0, ladder), LADDER.length - 1)];
    noot(ctx, uit, t, { vorm: 'square', f, piek: 0.18, duur: 0.45, door: filter(ctx, 'lowpass', 3000) });
    noot(ctx, uit, t + 0.05, { vorm: 'square', f: 2 * f, piek: 0.05, duur: 0.4, door: filter(ctx, 'lowpass', 3000) });
    return 0.45;
  },
  // Knop (en sleutel): een mechanisch "klik-klak".
  knop(ctx, uit, t) {
    ruis(ctx, uit, t, { piek: 0.5, duur: 0.012, door: filter(ctx, 'bandpass', 2500, 3) });
    noot(ctx, uit, t + 0.01, { vorm: 'triangle', f: 440, naar: 340, glij: 0.05, piek: 0.2, aan: 0.002, duur: 0.05 });
    return 0.06;
  },
  // Klep gaat open: een "zwoesj" dat omhoog glijdt, en aan het eind een "tok".
  klep(ctx, uit, t) {
    ruis(ctx, uit, t, { piek: 0.3, aan: 0.1, duur: 0.35, door: sweep(ctx, t, 'bandpass', 300, 1500, 0.35, 2) });
    noot(ctx, uit, t + 0.35, { vorm: 'triangle', f: 420, piek: 0.12, aan: 0.002, duur: 0.06 });
    return 0.41;
  },
  // De hartslag van de held: twee kleppen die dichtklappen ("lub-dub"), de tweede iets lager en zachter. Dat is het
  // echte geluid van een hart: hartkleppen (waar de vraag in het hart-level over gaat). Loop D: elke slag, in elk level.
  klop(ctx, uit, t, { sterkte = 1 } = {}) {
    const piek = 0.12 * sterkte;
    for (const [dt, f, k] of [[0, 380, 1], [0.14, 335, 0.7]]) {
      ruis(ctx, uit, t + dt, { piek: piek * k * 1.2, duur: 0.012, door: filter(ctx, 'bandpass', 1200, 3) });
      noot(ctx, uit, t + dt, { vorm: 'triangle', f, naar: f * 0.9, glij: 0.06, piek: piek * k, duur: 0.06 });
    }
    return 0.2;
  },
  // Checkpoint: een helder klokje, en de vlag die wappert.
  checkpoint(ctx, uit, t) {
    noot(ctx, uit, t, { f: 880, piek: 0.2, aan: 0.002, duur: 0.7 });
    noot(ctx, uit, t, { f: 880 * 2.76, piek: 0.05, aan: 0.002, duur: 0.35 });
    ruis(ctx, uit, t, { piek: 0.12, aan: 0.01, duur: 0.12, door: sweep(ctx, t, 'bandpass', 800, 2000, 0.12, 1.5) });
    return 0.7;
  },
  // Geraakt: een cartoon-"boing" omlaag (met vibrato), dan een "plop" omhoog: de held ploft op de vlag.
  // Geen zoemer en geen schreeuw.
  geraakt(ctx, uit, t) {
    const o = noot(ctx, uit, t, { f: 700, naar: 330, glij: 0.22, piek: 0.2, aan: 0.004, duur: 0.24 });
    const lfo = ctx.createOscillator();
    const diep = ctx.createGain();
    lfo.frequency.value = 18;
    diep.gain.value = 25;
    lfo.connect(diep).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.24 + UITLOOP);
    ruis(ctx, uit, t, { piek: 0.12, aan: 0.003, duur: 0.15, door: filter(ctx, 'bandpass', 900, 0.8) });
    noot(ctx, uit, t + 0.25, { f: 330, naar: 900, glij: 0.09, piek: 0.12, aan: 0.003, duur: 0.13 });
    return 0.38;
  },
  // Goed antwoord: twee noten een kwint omhoog, "ding-DING" (een eigen motief, niet de sterrenladder).
  goed(ctx, uit, t) {
    noot(ctx, uit, t, { vorm: 'square', f: 659.25, piek: 0.13, duur: 0.18, door: filter(ctx, 'lowpass', 3000) });
    noot(ctx, uit, t + 0.09, { vorm: 'square', f: 987.77, piek: 0.17, duur: 0.5, door: filter(ctx, 'lowpass', 3000) });
    return 0.59;
  },
  // Fout antwoord: het blokje zelf zegt "donk" (hol, niet deze). Geen plaag-interval, geen zoemer; zachter en korter
  // dan goed.
  fout(ctx, uit, t) {
    ruis(ctx, uit, t, { piek: 0.2, duur: 0.015, door: filter(ctx, 'bandpass', 700, 4) });
    noot(ctx, uit, t, { vorm: 'triangle', f: 350, naar: 320, glij: 0.09, piek: 0.14, duur: 0.09 });
    return 0.09;
  },
  // Finish: een kleine fanfare, "ta-ta-ta TAAA": drie keer G4, dan het akkoord C-E-G met een tremolo.
  finish(ctx, uit, t) {
    const lp = filter(ctx, 'lowpass', 3000);
    lp.connect(uit);
    for (const dt of [0, 0.11, 0.22]) noot(ctx, lp, t + dt, { vorm: 'square', f: 392, piek: 0.12, duur: 0.1 });
    const trem = ctx.createGain();
    const lfo = ctx.createOscillator();
    const diep = ctx.createGain();
    lfo.frequency.value = 6;
    diep.gain.value = 0.15;
    lfo.connect(diep).connect(trem.gain);
    trem.connect(lp);
    lfo.start(t);
    lfo.stop(t + 1.4 + UITLOOP);
    for (const f of [523.25, 659.25, 783.99]) noot(ctx, trem, t + 0.33, { vorm: 'square', f, piek: 0.08, duur: 1.05 });
    return 1.38;
  },
  // Start (en held kiezen): "pop-pling", twee noten omhoog. Zegt ook: het geluid werkt.
  start(ctx, uit, t) {
    noot(ctx, uit, t, { f: 400, naar: 800, glij: 0.06, piek: 0.15, duur: 0.07 });
    noot(ctx, uit, t + 0.07, { f: 783.99, piek: 0.18, duur: 0.18 });
    return 0.25;
  },
  // Witte bloedcellen opgepakt (loop E): twee zachte "bloep"-jes omhoog, zoals bellen die je opvangt.
  oppak(ctx, uit, t) {
    noot(ctx, uit, t, { vorm: 'triangle', f: 560, naar: 760, glij: 0.07, piek: 0.11, duur: 0.09 });
    noot(ctx, uit, t + 0.08, { vorm: 'triangle', f: 700, naar: 940, glij: 0.07, piek: 0.09, duur: 0.11 });
    return 0.2;
  },
  // F zonder witte bloedcellen (loop E): een korte, doffe tik. Geen zoemer: niets is fout, je moet even wachten.
  leeg(ctx, uit, t) {
    ruis(ctx, uit, t, { piek: 0.07, duur: 0.02, door: filter(ctx, 'bandpass', 900, 2) });
    noot(ctx, uit, t, { vorm: 'triangle', f: 340, naar: 300, glij: 0.05, piek: 0.1, duur: 0.07 });
    return 0.08;
  },
  // Geluid weer aan: een kort bevestigend "pling". (Bij uit geen klank: je koos net stilte.)
  aan(ctx, uit, t) {
    noot(ctx, uit, t, { f: 660, naar: 990, glij: 0.08, piek: 0.15, duur: 0.15 });
    return 0.15;
  },
});

// Eén keten per context. De compressor is alleen een begrenzer (drempel -6 dB, ratio 12, geen knie): hij laat de
// rangorde in luidheid van de recepten staan en houdt alleen samenvallende klanken onder de 1,0.
export function maakKetting(ctx) {
  const meester = ctx.createGain();
  meester.gain.value = MEESTER;
  const begrenzer = ctx.createDynamicsCompressor();
  begrenzer.threshold.value = -6;
  begrenzer.ratio.value = 12;
  begrenzer.knee.value = 0;
  begrenzer.attack.value = 0.003;
  begrenzer.release.value = 0.15;
  // De analyser is alleen een leeshaak (staat().piek): 32768 samples (het maximum, ~0,7 s), zodat een peiling van
  // de speeltest een klank ook op een drukke machine nog ziet. Hij leest alleen de golfvorm (geen FFT): kost niets
  // zolang niemand hem leest.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 32768;
  meester.connect(begrenzer).connect(filter(ctx, 'lowpass', 6000)).connect(analyser).connect(ctx.destination);
  return { ingang: meester, meester, analyser };
}

// De dienst van de game. `context` (optioneel): een eigen context, bijvoorbeeld een OfflineAudioContext in de test;
// zonder maakt ontgrendel() er één binnen het eerste gebaar. Gooit nooit: een fout in het geluid stopt het spel niet.
export function maakGeluid({ startAan = true, context = null } = {}) {
  const live = !context;
  let beschikbaar = context ? true : typeof AudioContext === 'function';
  let ctx = context;
  let keten = ctx ? maakKetting(ctx) : null;
  let aan = startAan;
  let meesterDoel = aan ? MEESTER : 0;
  let stemmen = []; // { eind, stem }: in audiotijd, ook klanken die nog moeten beginnen
  const laatst = new Map(); // klank -> starttijd van de vorige (voor LIMIET)
  const log = []; // ringbuffer, alleen in het geheugen: { nr, klank, bron, sterkte, ctxTijd, speltijd }
  let nr = 0;
  let sluimer = null;
  let buffer = null;
  if (!startAan && keten) keten.meester.gain.value = 0;

  // Speelt het geluid nu (en niet in een context die stil staat: dan zou hij later ineens alles inhalen)?
  const speelbaar = () => aan && keten && (!live || ctx.state === 'running');

  // op: een absolute audiotijd (de hartslag, op zijn anker); anders nu + VOORUIT + na. currentTime één keer lezen.
  function speel(naam, { bron = 'ui', sterkte = 1, ladder = 0, na = 0, op = null, speltijd = null } = {}) {
    try {
      const recept = KLANKEN[naam];
      if (!recept || !speelbaar() || !(sterkte > 0)) return false;
      const t = op ?? ctx.currentTime + VOORUIT + na;
      if (t - (laatst.get(naam) ?? -Infinity) < (LIMIET[naam] ?? 0)) return false;
      stemmen = stemmen.filter((s) => s.eind > t);
      if (BEWEGING.has(naam) && stemmen.length >= MAX_STEMMEN) return false;
      const stem = ctx.createGain();
      stem.connect(keten.ingang);
      const toon = BEWEGING.has(naam) && naam !== 'klop' ? 1 + (Math.random() * 2 - 1) * 0.04 : 1;
      const duur = recept(ctx, stem, t, { sterkte: Math.min(1, sterkte), toon, ladder });
      stemmen.push({ eind: t + duur + UITLOOP, stem });
      laatst.set(naam, t);
      log.push({ nr: ++nr, klank: naam, bron, sterkte: Math.min(1, sterkte), toon, ctxTijd: t, speltijd });
      if (log.length > LOG_MAX) log.shift();
      return true;
    } catch {
      return false; // geen console-fout: geluid is sap, geen spelregel
    }
  }

  // De hartslag van de held: per nieuwe slag één klop (geen gebeurtenis: een teller, logica/hartslag.mjs). Per spel
  // geteld (een nieuw level telt vanaf zijn eigen begin). Het anker zet speltijd om in audiotijd; het wordt alleen
  // opnieuw gezet als een slag buiten [nu, nu + 2 x LATENTIE] zou vallen (hulp, verborgen tabblad, lange frame).
  let hart = { spel: null, slagen: 0, anker: null };
  function hartslag(spel) {
    const h = spel?.hartslag;
    if (!h) return;
    if (hart.spel !== spel) hart = { spel, slagen: h.slagen, anker: null };
    if (h.slagen === hart.slagen) return;
    hart.slagen = h.slagen;
    if (!speelbaar()) return;
    const nu = ctx.currentTime + VOORUIT;
    let op = hart.anker === null ? null : hart.anker + h.slagTijd;
    if (op === null || op < nu || op > nu + 2 * LATENTIE) {
      hart.anker = nu + LATENTIE - (spel.tijd + spel.rest);
      op = hart.anker + h.slagTijd;
    }
    speel('klop', { bron: 'hart', op, speltijd: h.slagTijd });
  }

  // Wat de logica meldt (spel.mjs, tik) -> welke klank, plus de hartslag van de held.
  function bij(gebeurtenissen, spel) {
    hartslag(spel);
    if (!gebeurtenissen.length) return;
    const b = (e) => ({ bron: e.soort, speltijd: spel.tijd });
    const sterrenHier = gebeurtenissen.filter((e) => e.soort === 'ster').length;
    let sterNr = 0;
    for (const e of gebeurtenissen) {
      switch (e.soort) {
        case 'sprong': speel('sprong', b(e)); break;
        case 'land':
          if (e.snelheid > LAND_DREMPEL) speel('land', { ...b(e), sterkte: 0.4 + (e.snelheid - LAND_DREMPEL) / 4 });
          break;
        case 'ster': speel('ster', { ...b(e), ladder: spel.sterren - sterrenHier + sterNr++ }); break;
        case 'knop':
        case 'sleutel':
          speel('knop', b(e));
          if (e.kleppen > 0) speel('klep', { ...b(e), na: 0.15 }); // gelijk met de poort die gaat zakken
          break;
        case 'checkpoint': speel('checkpoint', b(e)); break;
        case 'geraakt': speel('geraakt', b(e)); break;
        case 'gooi': speel('gooi', b(e)); break;
        case 'raak': speel('raak', b(e)); break;
        case 'oppak': speel('oppak', b(e)); break;
        case 'leeg': speel('leeg', b(e)); break;
        case 'antwoord': speel(e.goed ? 'goed' : 'fout', b(e)); break;
        case 'finish': speel('finish', b(e)); break;
        default:
      }
    }
  }

  // Binnen een gebaar (pointerdown, keydown): de context maken (alleen dan mag hij spelen), of weer laten lopen.
  function ontgrendel(e) {
    if (!beschikbaar || (e && !e.isTrusted)) return;
    try {
      if (!ctx) {
        ctx = new AudioContext();
        keten = maakKetting(ctx);
        if (!aan) {
          keten.meester.gain.value = 0;
          ctx.suspend().catch(() => {});
        }
      } else if (live && aan && ctx.state === 'suspended' && document.visibilityState !== 'hidden') {
        ctx.resume().catch(() => {});
      }
    } catch {
      beschikbaar = false;
      ctx = null;
      keten = null;
    }
  }

  // Aan of uit. Uit: de meester in 30 ms naar 0 (geen klik), wat nog klinkt of gepland staat vervalt, dan de context
  // stil (scheelt rekenwerk op de Chromebook).
  // Aan: de context weer laten lopen, de meester omhoog en een "pling" (tenzij stil, zoals bij de beursreset).
  async function zetAan(nieuw, { stil = false } = {}) {
    aan = !!nieuw;
    meesterDoel = aan ? MEESTER : 0;
    clearTimeout(sluimer);
    if (!ctx || !keten) return;
    try {
      if (aan && live && document.visibilityState !== 'hidden') await ctx.resume();
      if (aan !== !!nieuw) return; // intussen weer omgezet
      const nu = ctx.currentTime;
      const g = keten.meester.gain;
      g.cancelScheduledValues(nu);
      g.setValueAtTime(g.value, nu);
      g.linearRampToValueAtTime(meesterDoel, nu + 0.03);
      if (aan && !stil) speel('aan');
      if (!aan) stopAlles(); // wat nog klinkt of nog moet komen (de sterren op het podium), speelt na weer aan niet alsnog
      if (!aan && live) sluimer = setTimeout(() => { if (!aan) ctx.suspend().catch(() => {}); }, 60);
    } catch {
      // geen geluid is geen fout
    }
  }

  // Alles wat nog klinkt (of nog moet beginnen) in 80 ms naar stilte: bij terug naar start, uit en een verborgen
  // tabblad. Anders speelt een klank die met `na` gepland staat (de sterren op het podium) later alsnog, te laat.
  function stopAlles() {
    if (!ctx) return;
    try {
      const nu = ctx.currentTime;
      for (const { stem } of stemmen) {
        stem.gain.cancelScheduledValues(nu);
        stem.gain.setValueAtTime(1, nu);
        stem.gain.linearRampToValueAtTime(0, nu + 0.08);
      }
    } catch {
      // idem
    }
    stemmen = [];
  }

  if (live && beschikbaar) {
    // Verborgen tabblad: alles stoppen en de context stil. Terug in beeld en het geluid staat aan: weer laten lopen
    // (kan zonder gebaar), zonder dat wat bij het verbergen nog klonk of gepland stond, alsnog komt.
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.visibilityState === 'hidden') {
        stopAlles();
        ctx.suspend().catch(() => {});
      } else if (aan) {
        ctx.resume().catch(() => {});
      }
    });
  }

  // Leeshaak voor de speeltest (alleen lezen, niets over het kind): de stand, de piek in de analyser nu (over de
  // laatste `venster` s audiotijd), en het log.
  function staat() {
    let piek = 0;
    if (keten) {
      buffer ??= new Float32Array(keten.analyser.fftSize);
      keten.analyser.getFloatTimeDomainData(buffer);
      for (const x of buffer) piek = Math.max(piek, Math.abs(x));
    }
    const nu = ctx?.currentTime ?? 0;
    return {
      context: !beschikbaar ? 'niet-beschikbaar' : !ctx ? 'geen' : ctx.state,
      aan,
      meester: meesterDoel,
      piek,
      stemmen: stemmen.filter((s) => s.eind > nu).length,
      ctxTijd: nu,
      venster: keten && ctx ? keten.analyser.fftSize / ctx.sampleRate : 0,
      log: log.map((e) => ({ ...e })),
    };
  }

  return { speel, bij, ontgrendel, zetAan, isAan: () => aan, stopAlles, staat };
}
