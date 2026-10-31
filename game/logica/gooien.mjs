// F: een witte bloedcel gooien naar een schurk (loop B, docs/PLAN-schurken-sterren.md). Geen PlayCanvas.
// - De bal vliegt recht in de kijkrichting van de held (4 richtingen, beweging.mjs), op vaste hoogte boven zijn
//   grond. Hij stopt bij een vakje dat hoger is dan hij vliegt (muur, dichte klep, een blok) of na BEREIK vakjes.
//   Water en lava zijn een gat in de vloer, geen muur: daar vliegt hij overheen.
// - Treffer in x en z: de hoogte van een huppende schurk telt niet (anders vliegt de bal het grootste deel van een
//   hup eronderdoor; de tekening is hoog genoeg om te raken).
// - Een schurk heeft `leven` (eindbaas 3, anders 1, vijanden.mjs); op 0 is hij `weg`: hij stapt niet, botst niet en
//   wordt niet getekend. Weg blijft weg, ook na terugzetten op C. Verslaan is nooit nodig om een level te halen.
import { HOOGTE_EENHEID } from './raster.mjs';
import { VIJAND_HALF } from './vijanden.mjs';

export const BAL_SNELHEID = 8; // vakjes per seconde
export const BEREIK = 6; // vakjes
export const BAL_HALF = 0.2;
export const BAL_HOOGTE = 0.4; // wereld, boven de grond waarvan hij gegooid werd
export const PAUZE = 0.4; // s speltijd tussen twee worpen
export const MAX_BALLEN = 3;

// Voorraad (loop E, docs/PLAN-oppakken.md; getallen meester 31 okt): elk level begint met START; elke worp kost er één;
// bij 0 geen bal maar `leeg` (alleen bij een nieuwe druk, niet bij een herhaalde toets). Het beenmerg maakt er één per
// AANMAAK s zolang je onder START zit; op START of meer staat de klok stil (na wachten haalt het niets in). Een verslagen
// schurk legt BUIT neer op zijn vakje (de eindbaas BUIT_EINDBAAS); erop staan pakt alles wat past, tot MAX. Verslaan is
// nooit nodig (NN3), dus de voorraad staat niet in check_levels.
export const START = 5;
export const MAX = 9;
export const BUIT = 2;
export const BUIT_EINDBAAS = 4;
export const AANMAAK = 10; // s speltijd
export const maakAfweer = () => ({ voorraad: START, volgende: AANMAAK });

// Het beenmerg, in elke logicastap vlak vóór gooi.
export function beenmerg(spel) {
  const a = spel.afweer;
  if (a.voorraad >= START) {
    a.volgende = spel.tijd + AANMAAK;
  } else if (spel.tijd >= a.volgende - 1e-9) {
    a.voorraad++;
    a.volgende += AANMAAK;
    spel.meld({ soort: 'aanmaak' });
  }
}

// Oppakken, in elke logicastap vlak na gooi: staat het midden van de held op een vakje met buit, dan pakt hij alles
// wat past (niet de binnen-haak: die vuurt alleen bij een vakwissel, en buit kan onder hem vallen).
export function oppakken(spel) {
  const [k, r] = spel.held.cel;
  for (const b of spel.buit) {
    if (!b.actief || b.cel[0] !== k || b.cel[1] !== r) continue;
    const neem = Math.min(b.aantal, MAX - spel.afweer.voorraad);
    if (neem <= 0) continue;
    spel.afweer.voorraad += neem;
    b.aantal -= neem;
    b.actief = b.aantal > 0;
    spel.meld({ soort: 'oppak', cel: [k, r], aantal: neem });
  }
}

export function gooi(spel, { herhaal = false } = {}) {
  if (spel.tijd < spel.volgendeWorp || spel.ballen.length >= MAX_BALLEN) return;
  const { held } = spel;
  spel.volgendeWorp = spel.tijd + PAUZE;
  if (spel.afweer.voorraad === 0) {
    if (!herhaal) spel.meld({ soort: 'leeg' });
    return;
  }
  spel.afweer.voorraad--;
  const [dx, dz] = held.kijk;
  spel.ballen.push({ x: held.x, z: held.z, y: held.y + BAL_HOOGTE, dx, dz, afstand: 0 });
  spel.meld({ soort: 'gooi' });
}

export function stapBallen(spel, dt) {
  spel.ballen = spel.ballen.filter((b) => {
    const stap = BAL_SNELHEID * dt;
    b.x += b.dx * stap;
    b.z += b.dz * stap;
    b.afstand += stap;
    const voor = [Math.floor(b.x + b.dx * BAL_HALF), Math.floor(b.z + b.dz * BAL_HALF)];
    const gat = ['water', 'lava'].includes(spel.raster.module(...voor)?.beeld);
    if (b.afstand > BEREIK || (!gat && spel.raster.hoogte(...voor) * HOOGTE_EENHEID > b.y)) return false;
    const door = spel.vijanden.findIndex((v) => !v.weg
      && Math.abs(v.x - b.x) < VIJAND_HALF + BAL_HALF && Math.abs(v.z - b.z) < VIJAND_HALF + BAL_HALF);
    if (door < 0) return true;
    const v = spel.vijanden[door];
    v.leven--;
    v.weg = v.leven <= 0;
    if (v.weg) spel.buit[door] = { actief: true, cel: [Math.floor(v.x), Math.floor(v.z)], aantal: v.eindbaas ? BUIT_EINDBAAS : BUIT };
    spel.meld({ soort: 'raak', door, weg: v.weg, waar: [v.x, v.y, v.z] });
    return false;
  });
}
