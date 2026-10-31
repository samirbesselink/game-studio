// Eén speelbeurt op één level: raster met dingen, held, vijanden en de vaste-tijdstaplus. Geen PlayCanvas, geen DOM.
import { maakRaster } from './raster.mjs';
import { dingOnder, grondOnder, maakHeld, MAX_STAPPEN, STAP, stapHeld, vaarMee, volgGrond } from './beweging.mjs';
import { maakVijanden, raakt, stapVijand } from './vijanden.mjs';
import { beenmerg, gooi, maakAfweer, oppakken, stapBallen } from './gooien.mjs';
import { maakHartslag, stapHartslag } from './hartslag.mjs';

const AFRONDING = 1e-9; // 0,1 s is in drijvende komma net geen 12 x 1/120 s; zonder dit valt er een stap weg

// schurken: id's van de goedgekeurde klasschurken (soort slechterik). random: voor het schudden (test: vast).
export function maakSpel(level, { schurken = [], random = Math.random } = {}) {
  const raster = maakRaster(level, { random });
  const spel = {
    level,
    raster,
    held: maakHeld(raster.start),
    rest: 0,
    tijd: 0, // speltijd in s: liften en vijanden bewegen hierop, dus bij elke framerate hetzelfde
    sprongGevraagd: false,
    gooiGevraagd: false,
    gooiHerhaal: false, // de vraag kwam van een herhaalde toets (F ingedrukt gehouden)
    afweer: maakAfweer(), // voorraad witte bloedcellen (gooien.mjs)
    ballen: [], // witte bloedcellen in de lucht (gooien.mjs)
    hartslag: maakHartslag(), // alleen voor geluid en HUD (hartslag.mjs)
    volgendeWorp: 0,
    sterren: 0,
    vitamines: 0,
    checkpoint: null, // de laatste bereikte C; null = terug naar S
    terugGezet: 0,
    gehaald: false,
    gebeurtenissen: [],
    meld(gebeurtenis) { this.gebeurtenissen.push(gebeurtenis); },
  };
  spel.vijanden = maakVijanden(level, raster, schurken, random);
  spel.buit = spel.vijanden.map(() => ({ actief: false, cel: null, aantal: 0 })); // per schurk, actief als hij weg is
  for (const v of spel.vijanden) stapVijand(v, spel);
  return spel;
}

// Een sprong wordt bij de eerstvolgende logicastap gebruikt (keydown mist nooit een korte tik).
export const vraagSprong = (spel) => { spel.sprongGevraagd = true; };
// Gooien (F) ook: bij de volgende logicastap, na de beweging (dan klopt de kijkrichting).
// herhaal: de vraag komt van een herhaalde toets. Eén gewone vraag in dezelfde frame telt als een nieuwe druk.
export const vraagGooi = (spel, { herhaal = false } = {}) => {
  spel.gooiHerhaal = spel.gooiGevraagd ? spel.gooiHerhaal && herhaal : herhaal;
  spel.gooiGevraagd = true;
};

// Geraakt door een vijand (spelregel 3 en 8): terug naar de laatste C, of naar S als er nog geen C bereikt is.
// Sterren, open kleppen en een opgeloste opdracht blijven; alleen de held gaat terug.
// De gebeurtenis zegt ook waar hij geraakt werd (vóór het terugzetten) en door welke vijand (index, of null).
export function terugzetten(spel, door = null) {
  const waar = [spel.held.x, spel.held.y, spel.held.z];
  const cel = spel.checkpoint ?? spel.raster.start;
  Object.assign(spel.held, maakHeld(cel));
  spel.held.y = spel.held.grond = grondOnder(spel.held, spel.raster);
  spel.sprongGevraagd = false;
  spel.ballen = []; // verslagen schurken blijven weg
  spel.terugGezet++;
  spel.meld({ soort: 'geraakt', cel: [...cel], waar, door });
}

// Speel dt seconden in vaste stappen van STAP, hoogstens MAX_STAPPEN per frame.
// richting = { x, z }, genormaliseerd. Geeft wat er gebeurde: nieuwe vakjes, sprongen, het aantal stappen en de
// gebeurtenissen voor beeld, UI en geluid (DEV.md, Sap en geluid): sprong, land, ster, knop, sleutel, checkpoint,
// antwoord, geraakt, gooi, raak, leeg, oppak, aanmaak en finish. Een gebeurtenis meldt alleen; hij verandert niets aan het spel.
// Volgorde per stap: dingen (lift, vlot), vijanden, ballen, meevaren, grond volgen, held, hartslag, beenmerg, gooien,
// oppakken, vakje binnen, landen, dingen na de held, botsing.
export function tik(spel, richting, dt) {
  const gebeurd = { cellen: [], sprongen: 0, stappen: 0, gebeurtenissen: [] };
  spel.gebeurtenissen = gebeurd.gebeurtenissen;
  spel.rest += dt;
  const { raster } = spel;
  while (spel.rest >= STAP - AFRONDING && gebeurd.stappen < MAX_STAPPEN && !spel.gehaald) {
    spel.tijd += STAP;
    for (const d of raster.dingen) d.stap?.(spel, STAP);
    for (const v of spel.vijanden) if (!v.weg) stapVijand(v, spel);
    stapBallen(spel, STAP);
    const { held } = spel;
    vaarMee(held, spel);
    volgGrond(held, spel);
    const [k0, r0] = held.cel;
    const invoer = { x: richting.x, z: richting.z, sprong: spel.sprongGevraagd };
    spel.sprongGevraagd = false;
    if (stapHeld(held, invoer, spel, STAP)) {
      gebeurd.sprongen++;
      spel.meld({ soort: 'sprong' });
    }
    stapHartslag(spel.hartslag, { inspant: invoer.x !== 0 || invoer.z !== 0 || !held.opGrond, dt: STAP, tijd: spel.tijd });
    beenmerg(spel);
    if (spel.gooiGevraagd) gooi(spel, { herhaal: spel.gooiHerhaal });
    spel.gooiGevraagd = false;
    oppakken(spel);
    const [k, r] = held.cel;
    if (k !== k0 || r !== r0) {
      gebeurd.cellen.push([k, r]);
      raster.module(k, r)?.binnen?.(spel, [k, r]);
      raster.ding(k, r)?.binnen?.(spel);
    }
    const onder = held.opGrond ? dingOnder(held, spel) : null;
    if (onder !== held.op) {
      held.op = onder;
      onder?.landt?.(spel);
    }
    for (const d of raster.dingen) d.naHeld?.(spel);
    const door = spel.vijanden.findIndex((v) => raakt(held, v));
    if (door >= 0) terugzetten(spel, door);
    spel.rest -= STAP;
    gebeurd.stappen++;
  }
  if (gebeurd.stappen === MAX_STAPPEN) spel.rest = 0;
  return gebeurd;
}
