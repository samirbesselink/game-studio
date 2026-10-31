// Register: symbool uit de legenda → module. Een module beschrijft één soort vakje:
//   hoogte      hoogte-eenheden (0-3) voor de regelset
//   blokkeert   true = de held komt er nooit op (M, W, L)
//   beeld       wat beeld/wereld.mjs tekent; zonder = alleen vloer
//   binnen(spel, [kolom, rij])   optioneel: de held stapt op dit vakje (F: gehaald)
//   maak({ level, cel, random, symbool })  optioneel: één ding met eigen staat voor dit vakje, of null (DEV.md,
//                  Uitbreidingspunten); symbool(k, r) leest de kaart (een vlot zoekt zijn baan)
//
// Een ding (raster.mjs) kan hebben:
//   hoogte                 eigen hoogte in eenheden (Infinity = dicht); gaat voor de hoogte van de module
//   binnen(spel)           de held stapt op dit vakje (ster pakken, knop indrukken, checkpoint bereiken)
//   magIn(van), magUit(naar)   waar je het vakje in en uit mag (klep, eenrichting); gebruikt door beweging.magNaar
//   magRichting(dk, dr)    of je binnen het vakje die kant op mag (klep: alleen met de stroom mee)
//   stap(spel, dt)         elke logicastap vóór de held (lift, vlot)
//   naHeld(spel)           elke logicastap na de held (opdracht: staat de vraag in beeld)
//   landt(spel)            de held landt erop (antwoordblokje)
//   klaar(raster)          na het maken van alle dingen en koppelingen (opdracht: blokjes plaatsen)
//   draagt(x, z), dx, dz, baan   een vlot (platform.mjs): ligt het punt op het vlot, de verplaatsing in de laatste
//                          stap, en de W/L-vakjes van zijn baan (beweging.magNaar en vaarMee, opdracht.kiesPlekken)
// V1-V5 zijn hier vloer: de vijanden zelf zijn actoren die bewegen (vijanden.mjs).
import { vloer, muur, water, lava, trede } from './terrein.mjs';
import { start } from './start.mjs';
import { finish } from './finish.mjs';
import { klep } from './klep.mjs';
import { opener } from './opener.mjs';
import { ster } from './ster.mjs';
import { checkpoint } from './checkpoint.mjs';
import { platform } from './platform.mjs';
import { opdracht } from './opdracht.mjs';
import { LevelFout } from '../fout.mjs';

export { LevelFout };

export const register = Object.freeze({
  '.': vloer,
  M: muur,
  W: water,
  L: lava,
  1: trede(1),
  2: trede(2),
  3: trede(3),
  S: start,
  F: finish,
  D: klep,
  '●': opener('knop'),
  'o–': opener('sleutel'),
  '★': ster,
  C: checkpoint,
  // Een vlot als er W/L in de pijlrichting ligt; anders P↑/P↓ een lift (P↓ begint boven) en P→/P← vloer.
  'P→': platform(null),
  'P←': platform(null),
  'P↑': platform(0),
  'P↓': platform(0.5),
  '?': opdracht,
  V1: vloer,
  V2: vloer,
  V3: vloer,
  V4: vloer,
  V5: vloer,
});

// Register = precies inhoud/legenda.json (tests/test_logica.mjs bewaakt dat).
// Een symbool dat niet in de legenda staat, is een fout bij het laden, geen stille vloer (DEV.md, regelset 6).
export function moduleVoor(symbool) {
  if (Object.hasOwn(register, symbool)) return register[symbool];
  throw new LevelFout(`onbekend symbool '${symbool}' in de kaart`);
}
