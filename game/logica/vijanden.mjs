// V1-V5: de vijanden (spelregel 3), een lijst actoren die bewegen. Geen PlayCanvas.
// - Figuur: een geschudde stapel goedgekeurde klasschurken over de V-plekken; zijn er minder schurken dan plekken,
//   dan wordt de stapel opnieuw geschud en komen ze vaker voor. De waarde in `vijanden` kiest de figuur niet.
// - De eindbaas (`eindbaas`, een V-nummer) heeft dezelfde beweging en botsvorm; het beeld tekent hem groter en hij
//   heeft EINDBAAS_LEVEN treffers nodig (gooien.mjs), een gewone schurk 1. Een verslagen schurk is `weg`.
// - Beweging volgens `bewegingen` (standaard stuiteren): elke vijand hupt op en neer; bij 'heen-en-weer' schuift hij
//   daarbij over een rechte baan vloer.
// - Een vijand is nooit een muur (regelset 1 en 6: check_levels ziet een V als vloer). Daarom hupt hij hoog en
//   traag (2,0 hoog, 2 s per hup: ruim 1,6 s van elke hup kun je eronderdoor lopen, en hoog genoeg om onder hem een
//   trede op te springen), en hebben vijanden die elkaar raken (ook schuin) dezelfde fase: dan zijn ze samen hoog.
//   Zo haal je in een gang van één breed ook 5 V's op een rij (~190 ms per seconde om te starten), 3 op een rij
//   (~440 ms) en een V vlak vóór een '1'. tests/test_logica.mjs toetst 2 en 3 naast elkaar en de V vóór een '1'.
// - Eén vaste botsvorm voor alle vijanden, los van hun tekening. Raakt die de held: terug naar de laatste C (spel.mjs).
import { LevelFout } from './fout.mjs';
import { HALF, HOOG } from './beweging.mjs';
import { schud } from './schud.mjs';

export const VIJAND_HALF = 0.3; // halve breedte van de botsvorm
export const VIJAND_HOOG = 0.6;
export const HUP_HOOGTE = 2.0; // wereld; top van de hup
export const HUP_TIJD = 2; // s per hup; bij 1,2 s zijn 4 of 5 V's op een rij in een gang niet te passeren
export const SCHUIF_SNELHEID = 1; // vakjes per seconde
export const SCHUIF_BEREIK = 2; // vakjes naar elke kant
export const EINDBAAS_LEVEN = 3; // treffers (loop B)
const BEWEGINGEN = ['stuiteren', 'heen-en-weer'];
const PLEKKEN = ['V1', 'V2', 'V3', 'V4', 'V5'];

export function maakVijanden(level, raster, schurken, random = Math.random) {
  const bewegingen = level.bewegingen ?? {};
  for (const [v, b] of Object.entries(bewegingen)) {
    if (!PLEKKEN.includes(v) || !BEWEGINGEN.includes(b)) throw new LevelFout(`level ${level.id}: beweging ${v}: '${b}' kent de game niet`);
  }
  const plekken = PLEKKEN.flatMap((v) => raster.alle(v).map((cel) => ({ v, cel })));
  if (plekken.length && !schurken.length) throw new LevelFout(`level ${level.id}: vijanden, maar geen goedgekeurde klasschurk`);
  const fase = groepFasen(plekken.map((p) => p.cel));
  const stapel = [];
  return plekken.map(({ v, cel }, i) => {
    if (!stapel.length) stapel.push(...schud(schurken, random));
    const beweging = bewegingen[v] ?? 'stuiteren';
    return {
      v,
      cel,
      figuur: stapel.pop(),
      eindbaas: v === level.eindbaas,
      leven: v === level.eindbaas ? EINDBAAS_LEVEN : 1,
      weg: false,
      beweging,
      x: cel[0] + 0.5,
      y: 0,
      z: cel[1] + 0.5,
      fase: fase[i],
      baan: beweging === 'heen-en-weer' ? baan(raster, cel) : null,
    };
  });
}

// Fase per V-plek (deel van een hup): plekken die elkaar raken, ook schuin, vormen een groep met één fase, zodat ze
// samen hoog zijn. Groepen onderling verschillen (niet allemaal tegelijk); vast, zodat een test hem kan voorspellen.
function groepFasen(cellen) {
  const groep = cellen.map(() => -1);
  let n = 0;
  cellen.forEach((_, start) => {
    if (groep[start] >= 0) return;
    const rij = [start];
    groep[start] = n;
    for (let i = 0; i < rij.length; i++) {
      const [k, r] = cellen[rij[i]];
      cellen.forEach(([a, b], j) => {
        if (groep[j] < 0 && Math.max(Math.abs(a - k), Math.abs(b - r)) === 1) {
          groep[j] = n;
          rij.push(j);
        }
      });
    }
    n++;
  });
  return groep.map((g) => (g * 0.37) % 1);
}

// De langste rechte baan door de V-plek over lege vloer (. of een V) op hoogte 0, hoogstens SCHUIF_BEREIK per kant.
function baan(raster, [k, r]) {
  const vrij = (a, b) => ['.', ...PLEKKEN].includes(raster.symbool(a, b)) && !raster.ding(a, b) && raster.hoogte(a, b) === 0;
  const reik = (dk, dr) => {
    let n = 0;
    while (n < SCHUIF_BEREIK && vrij(k + dk * (n + 1), r + dr * (n + 1))) n++;
    return n;
  };
  const [links, rechts, boven, onder] = [reik(-1, 0), reik(1, 0), reik(0, -1), reik(0, 1)];
  return links + rechts >= boven + onder
    ? { as: 'x', van: k - links + 0.5, tot: k + rechts + 0.5, thuis: k + 0.5 }
    : { as: 'z', van: r - boven + 0.5, tot: r + onder + 0.5, thuis: r + 0.5 };
}

// Waar een vijand in zijn hup is, 0-1 (0 en 1 = op de grond). Ook voor beeld en UI: plet en stof bij het landen.
export const hupFase = (v, tijd) => ((tijd + v.fase * HUP_TIJD) / HUP_TIJD) % 1;

export function stapVijand(v, spel) {
  const f = hupFase(v, spel.tijd);
  v.y = HUP_HOOGTE * 4 * f * (1 - f);
  if (!v.baan || v.baan.tot === v.baan.van) return;
  const { as, van, tot, thuis } = v.baan;
  const lengte = tot - van;
  const s = (thuis - van + spel.tijd * SCHUIF_SNELHEID) % (2 * lengte); // heen en terug, begint thuis
  const plek = van + (s < lengte ? s : 2 * lengte - s);
  if (as === 'x') v.x = plek;
  else v.z = plek;
}

// Raken de botsvormen van held en vijand elkaar (in x, z én hoogte)? Een verslagen vijand raakt nooit.
export const raakt = (held, v) => !v.weg && Math.abs(held.x - v.x) < HALF + VIJAND_HALF && Math.abs(held.z - v.z) < HALF + VIJAND_HALF
  && held.y < v.y + VIJAND_HOOG && v.y < held.y + HOOG;
