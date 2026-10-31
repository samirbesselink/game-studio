// Alle materialen en kleuren van de wereld op één plek, zodat de look ze in één keer kan vervangen.
// Kleuren volgen de les (CLAUDE.md): rood, blauw, roze, groen, bruin en potloodgrijs hebben een betekenis in het
// thema en worden hier niet voor iets anders gebruikt. De muren zijn bruin: het hart is een spier. De vloer krijgt
// per vakje de kleur uit `vloer` van het level (paars = neutraal pad zonder lesbetekenis; paars betekent verder
// niets, dus geen ander ding is paars). Functioneel en duidelijk:
//   klep crème met een oranje knop, ster geel, checkpoint een lichtgrijze vlag, de ? en de antwoordblokjes lichtgrijs
//   met tekst (allemaal hetzelfde: geen kleurcode), lift lichtgrijs-wit met een donkere rand die op de maat wit oplicht.
//   Wit is de witte bloedcel (afweer, gooien): alleen de bal is helder wit (loop B; DEV.md).
import * as pc from 'playcanvas';
import { maakVoegTextuur } from './vormen.mjs';

// Vloerkleuren (sRGB, 0-255) per kleurnaam uit het level; null = geen `vloer` op dat vakje: neutraal.
export const VLOERTINT = {
  blauw: [128, 178, 238], // zuurstofarm
  rood: [238, 92, 80], // zuurstofrijk
  roze: [244, 160, 196], // longen
  groen: [118, 196, 108], // spijsvertering
  bruin: [196, 128, 78], // spieren
  paars: [178, 138, 232], // neutraal pad
};
export const VLOER_NEUTRAAL = [217, 209, 191];

function materiaal(r, g, b, { gloed = 0 } = {}) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(r, g, b);
  m.useMetalness = true;
  m.metalness = 0;
  m.gloss = 0;
  if (gloed) m.emissive = new pc.Color(r * gloed, g * gloed, b * gloed);
  m.update();
  return m;
}

// De vloer: wit maal de vertexkleur (de zone) maal de voegtextuur (de tegels).
function vloer(device) {
  const m = materiaal(1, 1, 1);
  m.diffuseVertexColor = true;
  m.vertexColorGamma = true; // de vertexkleuren zijn sRGB, net als de kleuren hierboven
  m.diffuseMap = maakVoegTextuur(device);
  m.update();
  return m;
}

export function maakMaterialen(device) {
  return {
    vloer: vloer(device),
    // Warm bruin; de bovenkant wordt lichter door het licht van boven (wereld.mjs).
    muur: materiaal(0.78, 0.49, 0.29),
    trede: materiaal(0.9, 0.62, 0.4),
    finish: materiaal(0.95, 0.8, 0.2),
    // ponytail: W en L krijgen nu één donkere, neutrale plaat (geen les-kleur: blauw en rood hebben al een
    // betekenis). Upgrade: eigen beeld in loop B.
    gat: materiaal(0.2, 0.2, 0.22),
    klep: materiaal(0.96, 0.9, 0.74),
    knop: materiaal(1, 0.55, 0.1, { gloed: 0.25 }),
    ster: materiaal(1, 0.82, 0.12, { gloed: 0.45 }),
    vlag: materiaal(0.8, 0.8, 0.82, { gloed: 0.2 }),
    paal: materiaal(0.45, 0.42, 0.4),
    opdracht: materiaal(0.84, 0.84, 0.86, { gloed: 0.1 }),
    antwoord: materiaal(0.84, 0.84, 0.86, { gloed: 0.1 }),
    bal: materiaal(1, 1, 1, { gloed: 0.4 }), // de witte bloedcel
    balRand: materiaal(0.3, 0.3, 0.33),
    lift: materiaal(0.88, 0.88, 0.9),
    liftRand: liftRand(), // wereld.mjs zet alleen emissiveIntensity (puls op de maat)
  };
}

// Donker neutraal grijs met een vaste witte gloed; alleen de intensiteit wisselt (0-1), dus de rand licht op de maat
// wit op. Zo blijft de shadervariant gelijk als de puls uit is.
function liftRand() {
  const m = materiaal(0.3, 0.3, 0.33);
  m.emissive = new pc.Color(1, 1, 1);
  m.emissiveIntensity = 0;
  m.update();
  return m;
}
