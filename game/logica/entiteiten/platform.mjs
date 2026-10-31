// P→, P←, P↑ en P↓ (werkblad 3: "de pijl wijst waar het heen gaat"; regelset 4b in DEV.md). Liggen er in de
// pijlrichting W- of L-vakjes, dan is het een vlot dat over die baan heen en weer vaart: thuis (het P-vakje, een
// steiger) een pauze, heen, aan het eind een pauze, terug. Elk vlot begint thuis op t = 0. De held stapt erop, vaart
// mee, ook in een sprong (beweging.vaarMee), en stapt er aan het eind of opzij weer af. Geen W/L in de pijlrichting:
// P↑/P↓ is een lift (lift.mjs), P→/P← gewone vloer. tools/check_levels.py (banen) volgt dezelfde regel;
// tests/test_logica.mjs vergelijkt de banen per level.
import { lift } from './lift.mjs';

export const VLOT_SNELHEID = 1.5; // vakjes per seconde
export const VLOT_PAUZE = 1; // s stil aan elk eind, om op en af te stappen
const PIJL = Object.freeze({ 'P→': [1, 0], 'P←': [-1, 0], 'P↑': [0, -1], 'P↓': [0, 1] });

// De baan van het P-vakje [k, r]: de vakjes in de pijlrichting zolang ze W of L zijn. Leeg = geen vlot.
export function baan(symbool, [k, r]) {
  const [dk, dr] = PIJL[symbool(k, r)];
  const uit = [];
  for (let a = k + dk, b = r + dr; ['W', 'L'].includes(symbool(a, b)); a += dk, b += dr) uit.push([a, b]);
  return uit;
}

// Hoe ver een vlot met een baan van n vakjes van huis is (0 tot n vakjes) op speltijd t.
export function vlotAfstand(n, t) {
  const reis = n / VLOT_SNELHEID;
  const f = t % (2 * VLOT_PAUZE + 2 * reis);
  if (f < VLOT_PAUZE) return 0;
  if (f < VLOT_PAUZE + reis) return (f - VLOT_PAUZE) * VLOT_SNELHEID;
  if (f < 2 * VLOT_PAUZE + reis) return n;
  return n - (f - 2 * VLOT_PAUZE - reis) * VLOT_SNELHEID;
}

const vlot = ([k, r], [dk, dr], cellen) => ({
  soort: 'vlot',
  baan: cellen,
  x: k + 0.5,
  z: r + 0.5,
  dx: 0, // verplaatsing in de laatste logicastap (beweging.vaarMee)
  dz: 0,
  stap(spel) {
    const s = vlotAfstand(cellen.length, spel.tijd);
    const [x, z] = [k + 0.5 + dk * s, r + 0.5 + dr * s];
    [this.dx, this.dz, this.x, this.z] = [x - this.x, z - this.z, x, z];
  },
  // Ligt het punt (x, z) op het vlot? Het vlot is een vierkant van één vakje.
  draagt(x, z) {
    return Math.abs(x - this.x) <= 0.5 + 1e-9 && Math.abs(z - this.z) <= 0.5 + 1e-9;
  },
});

// Module voor P→ en P← (liftFase null) en voor P↑ en P↓ (liftFase: waar de lift begint, zie lift.mjs). Het P-vakje
// zelf is vloer op hoogte 0, ook als het vlot weg is.
export const platform = (liftFase) => ({
  hoogte: 0,
  maak({ cel, symbool }) {
    const cellen = baan(symbool, cel);
    if (cellen.length) return vlot(cel, PIJL[symbool(...cel)], cellen);
    return liftFase === null ? null : lift(liftFase).maak();
  },
});
