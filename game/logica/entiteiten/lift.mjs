// P↑ en P↓: een lift (spelregel 4) die op de zichtbare maat op en neer gaat: 0 → 2 → 0 in 3 s, met een pauze
// onder en boven om op en af te stappen. P↓ begint boven. Een held die erop staat, gaat mee (beweging.volgGrond).
// check_levels ziet een P als vloer op hoogte 0; de lift is daar elke ronde een tijdje, dus de game is niet
// strenger dan de check (regelset 6), wel ruimer: bovenop kom je op hoogte 2.
export const LIFT_RONDE = 3; // s
export const LIFT_TOP = 2; // hoogte-eenheden
const ONDER = 0.6; // s pauze onder, dan 0,9 s omhoog, 0,6 s pauze boven, 0,9 s omlaag
const OP = 0.9;
const BOVEN = 0.6;
// De maat: s in de ronde waarop de lift begint te bewegen (omhoog, omlaag). Het randje dat oplicht in beeld/wereld.mjs
// volgt deze tijden op de speltijd. Geluid maakt de lift niet meer: de hartslag is die van de held (loop D, besluit 014).
export const LIFT_BEGIN = Object.freeze({ op: ONDER, neer: ONDER + OP + BOVEN });

// De hoogte van een lift (in eenheden) op tijdstip t (s).
export function liftHoogte(t) {
  const f = ((t % LIFT_RONDE) + LIFT_RONDE) % LIFT_RONDE;
  if (f < ONDER) return 0;
  if (f < ONDER + OP) return (LIFT_TOP * (f - ONDER)) / OP;
  if (f < ONDER + OP + BOVEN) return LIFT_TOP;
  return LIFT_TOP * (1 - (f - ONDER - OP - BOVEN) / (LIFT_RONDE - ONDER - OP - BOVEN));
}

// fase: waar in de ronde de lift begint, als deel van een ronde (P↓: 0,5 = boven).
export const lift = (fase) => ({
  hoogte: 0,
  beeld: 'lift',
  maak: () => ({
    soort: 'lift',
    hoogte: liftHoogte(fase * LIFT_RONDE),
    stap(spel) {
      this.hoogte = liftHoogte(spel.tijd + fase * LIFT_RONDE);
    },
  }),
});
