// De hartslag van de held (loop D, docs/PLAN-hartslag.md; besluit 014). Een afgeleide waarde, alleen voor geluid en HUD:
// hij schrijft niets aan het spel (NN3; test_logica bewaakt dat met een golden opname van de baan van de held).
// Inspanning e (0-1) stijgt zolang je een pijl indrukt of in de lucht bent, en zakt als je stilstaat; meevaren op een
// vlot of lift zonder invoer is geen inspanning. bpm = 85 + 45 e (keuze meester: kinderen van 9-11 in rust ~85).
// Geen gebeurtenis per slag maar een teller: geluid en HUD zien per frame of `slagen` steeg, en `slagTijd` is de
// exacte speltijd van de slag (niet afgerond op een logicastap), zodat het geluid hem precies kan plannen.
export const RUST = 85; // bpm
export const MAX = 130; // bpm
const OP = 8; // s inspanning van rust naar vol
const AF = 10; // s stilstaan van vol naar rust

export const maakHartslag = () => ({ e: 0, bpm: RUST, fase: 0, slagen: 0, slagTijd: null });

// Eén logicastap van dt s die eindigt op speltijd `tijd`.
export function stapHartslag(h, { inspant, dt, tijd }) {
  h.e = Math.min(1, Math.max(0, h.e + (inspant ? dt / OP : -dt / AF)));
  h.bpm = RUST + (MAX - RUST) * h.e;
  h.fase += (h.bpm / 60) * dt;
  if (h.fase >= 1) {
    h.fase -= 1;
    h.slagen++;
    h.slagTijd = tijd - (h.fase * 60) / h.bpm;
  }
}
