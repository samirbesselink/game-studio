// Beweging en botsing van de held, met een vaste tijdstap. Geen PlayCanvas.
// Eén botsvorm, snelheid en sprong voor iedereen (non-negotiable 3); grootte is alleen uiterlijk.
import { HOOGTE_EENHEID } from './raster.mjs';

export const STAP = 1 / 120; // s per logicastap
// Hoogstens 12 stappen per frame = 0,1 s, precies de grootste frametijd die PlayCanvas doorgeeft (maxDeltaTime).
// Tot die grens is de afgelegde weg gelijk bij elke framerate; wat erboven valt, vervalt (geen inhaalspiraal).
export const MAX_STAPPEN = 12;
export const SNELHEID = 4; // vakjes per seconde
export const ZWAARTEKRACHT = 20;
export const SPRONGTOP = 0.75; // wereld; +1 hoogte (0,5) lukt, +2 (1,0) niet
export const SPRONGSNELHEID = Math.sqrt(2 * ZWAARTEKRACHT * SPRONGTOP);
// De botsvorm is een blok van 2 x HALF = 0,6 vakje breed en HOOG hoog, voor iedereen gelijk. Een stap gaat alleen
// door als de twee hoeken aan de voorkant op een vakje uitkomen waar ze heen mogen (magNaar); anders blijft de held
// staan. Zijn rand komt dus nooit in een muur, en daarom kan hij langs een muur schuiven. HOOG telt alleen voor
// de botsing met een vijand (vijanden.mjs).
export const HALF = 0.3;
export const HOOG = 0.6;
export const MARGE = 0.001; // afronding bij hoogtes: op 0,5 staan telt als op het blok
// Staat de held op de grond en zakt die grond hoogstens zoveel per stap (een lift omlaag), dan zakt hij mee.
// Zakt de grond ineens meer (een antwoordblokje dat verdwijnt), dan valt hij gewoon.
const MEEZAKKEN = 0.05;

export function maakHeld([k, r]) {
  return { x: k + 0.5, z: r + 0.5, y: 0, vy: 0, grond: 0, opGrond: true, cel: [k, r], op: null, kijk: [1, 0] };
}

// Kijkrichting (om te gooien): één van 4, de grootste as van de beweging. Bij gelijke assen (schuin met het
// toetsenbord) blijft de huidige richting als die één van de twee is, anders x. Stilstaan verandert niets.
function kijk(held, { x, z }) {
  const [ax, az] = [Math.abs(x), Math.abs(z)];
  if (ax < 1e-9 && az < 1e-9) return;
  const opX = [Math.sign(x), 0];
  const opZ = [0, Math.sign(z)];
  const gelijk = (a) => a[0] === held.kijk[0] && a[1] === held.kijk[1];
  if (Math.abs(ax - az) > 1e-9) held.kijk = ax > az ? opX : opZ;
  else held.kijk = [opX, opZ].find(gelijk) ?? opX;
}

const celOp = (x, z) => [Math.floor(x), Math.floor(z)];
const hoogteOp = (raster, x, z) => raster.hoogte(Math.floor(x), Math.floor(z)) * HOOGTE_EENHEID;

// Ligt het punt (x, z) op een vlot (platform.mjs)?
const opVlot = (spel, x, z) => spel.raster.dingen.some((d) => d.soort === 'vlot' && d.draagt(x, z));

// Mag een hoek van de botsvorm van vakje `van` naar vakje `naar` (hetzelfde vakje of een buur), op hoogte y?
// Regelset 1-3: niet naar een vakje dat hoger is dan waar je bent (een muur of een dichte klep is oneindig hoog),
// en een ding kan zelf zeggen waar je in en uit mag: een open klep alleen in vanaf `van` en uit naar de overkant.
// Regelset 4b: ligt `punt` (waar de hoek uitkomt) op een vlot, dan is water of lava daar vloer op hoogte 0.
export function magNaar(van, naar, y, spel, punt) {
  const { raster } = spel;
  const nat = ['water', 'lava'].includes(raster.module(...naar)?.beeld);
  const hoogte = nat && punt && opVlot(spel, ...punt) ? 0 : raster.hoogte(...naar);
  if (y < hoogte * HOOGTE_EENHEID - MARGE) return false;
  if (van[0] === naar[0] && van[1] === naar[1]) return true;
  const uit = raster.ding(...van);
  const binnen = raster.ding(...naar);
  return (!uit?.magUit || uit.magUit(naar)) && (!binnen?.magIn || binnen.magIn(van));
}

// Botsing per as: mogen beide hoeken aan de voorkant naar hun nieuwe vakje, dan gaat de held, anders blijft hij staan.
function verplaatsAs(held, spel, delta, isX) {
  if (delta === 0) return;
  const nu = isX ? held.x : held.z;
  const doel = nu + delta;
  const kant = Math.sign(delta) * HALF;
  const ander = isX ? held.z : held.x;
  const [dk, dr] = isX ? [Math.sign(delta), 0] : [0, Math.sign(delta)];
  for (const o of [ander - HALF, ander + HALF]) {
    const van = isX ? celOp(nu + kant, o) : celOp(o, nu + kant);
    const punt = isX ? [doel + kant, o] : [o, doel + kant];
    if (!magNaar(van, celOp(...punt), held.y, spel, punt)) return;
    if (spel.raster.ding(...van)?.magRichting?.(dk, dr) === false) return; // in een klep: alleen met de stroom mee
  }
  if (isX) held.x = doel;
  else held.z = doel;
}

// De hoogste grond onder de botsvorm: staat één hoek al op een blok, dan sta je op dat blok. Voor het midden van de
// held (waar zijn voeten getekend staan) is een blok dus 1 + 2 x HALF breed: daar sta je erop, en daar bots je ertegen.
// beeld/wereld.mjs tekent een antwoordblokje precies zo breed.
export function grondOnder(held, raster) {
  let grond = 0;
  for (const dx of [-HALF, HALF]) {
    for (const dz of [-HALF, HALF]) {
      const h = hoogteOp(raster, held.x + dx, held.z + dz);
      if (Number.isFinite(h)) grond = Math.max(grond, h);
    }
  }
  return grond;
}

// Het ding onder de held dat wil weten dat hij erop landt (een antwoordblokje), of null.
export function dingOnder(held, spel) {
  for (const dx of [-HALF, HALF]) {
    for (const dz of [-HALF, HALF]) {
      const d = spel.raster.ding(Math.floor(held.x + dx), Math.floor(held.z + dz));
      if (d?.landt && Math.abs(d.hoogte * HOOGTE_EENHEID - held.y) < MARGE) return d;
    }
  }
  return null;
}

// Vóór de beweging: beweegt de grond onder een staande held (een lift), dan gaat hij mee, omhoog en omlaag.
export function volgGrond(held, spel) {
  if (!held.opGrond) return;
  const grond = grondOnder(held, spel.raster);
  if (grond > held.y || held.y - grond <= MEEZAKKEN) {
    held.y = grond;
    held.grond = grond;
  }
}

// Vóór de beweging, na de stap van de dingen: stond (of sprong) de held boven een vlot, dan vaart hij mee, met de
// botsing per as (een muur houdt hem tegen). Regelset 4b; een sprong op een varend vlot eindigt zo op het vlot.
export function vaarMee(held, spel) {
  const v = spel.raster.dingen.find((d) => d.soort === 'vlot' && d.draagt(held.x + d.dx, held.z + d.dz));
  if (!v) return;
  verplaatsAs(held, spel, v.dx, true);
  verplaatsAs(held, spel, v.dz, false);
}

// Eén logicastap. invoer = { x, z (genormaliseerd), sprong }. Geeft true als er een sprong begon.
// Komt de held uit de lucht op de grond, dan meldt hij 'land' met de valsnelheid (voor geluid en beeld; verandert
// niets). Meerijden op een lift en gewoon stilstaan zijn geen landing: dan stond hij al op de grond.
export function stapHeld(held, invoer, spel, dt) {
  const stondAl = held.opGrond;
  kijk(held, invoer);
  verplaatsAs(held, spel, invoer.x * SNELHEID * dt, true);
  verplaatsAs(held, spel, invoer.z * SNELHEID * dt, false);

  const sprong = invoer.sprong && held.opGrond;
  if (sprong) {
    held.vy = SPRONGSNELHEID;
    held.opGrond = false;
  }
  held.y += held.vy * dt - 0.5 * ZWAARTEKRACHT * dt * dt; // exacte parabool: de top is echt SPRONGTOP
  held.vy -= ZWAARTEKRACHT * dt;
  held.grond = grondOnder(held, spel.raster);
  if (held.y <= held.grond && held.vy <= 0) {
    if (!stondAl) spel.meld?.({ soort: 'land', snelheid: -held.vy });
    held.y = held.grond;
    held.vy = 0;
    held.opGrond = true;
  } else {
    held.opGrond = false;
  }
  held.cel = [Math.floor(held.x), Math.floor(held.z)];
  return sprong;
}
