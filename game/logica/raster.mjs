// Het raster van een level, de regelset (DEV.md, Datacontract v1) en de dingen met eigen staat. Geen PlayCanvas.
// Vakje [kolom, rij]: kolom 0-19 = x, rij 0-11 = z. Hoogte in eenheden; blokkeren = Infinity.
// Een ding is één instantie per vakje met eigen staat (DEV.md, Uitbreidingspunten game): een klep die open is,
// een gepakte ster, een lift op zijn hoogte, een antwoordblokje. Zijn `hoogte` (als hij die heeft) gaat voor.
import { LevelFout } from './fout.mjs';
import { moduleVoor } from './entiteiten/index.mjs';

export const KOLOMMEN = 20;
export const RIJEN = 12;
export const HOOGTE_EENHEID = 0.5; // wereld-eenheden per hoogte-eenheid
// DEV.md, Vloerkleuren en vaste kunst: de lesskleuren plus paars (neutraal pad zonder lesbetekenis).
export const VLOERKLEUREN = ['blauw', 'rood', 'roze', 'groen', 'bruin', 'paars'];

// 'D5' -> [3, 4]: letter = kolom (A = 0), getal = rij (1 = 0). null als het geen vakje op het raster is.
export function vakje(naam) {
  const m = /^([A-T])(\d{1,2})$/.exec(String(naam));
  return m && +m[2] >= 1 && +m[2] <= RIJEN ? [m[1].charCodeAt(0) - 65, +m[2] - 1] : null;
}

export function maakRaster(level, { random = Math.random } = {}) {
  const symbolen = (level?.kaart ?? []).map((rij) => rij.trim().split(/\s+/));
  if (symbolen.length !== RIJEN || symbolen.some((rij) => rij.length !== KOLOMMEN)) {
    throw new LevelFout(`level ${level?.id}: kaart is geen ${KOLOMMEN} x ${RIJEN}`);
  }
  const modules = symbolen.map((rij) => rij.map(moduleVoor));
  const dingen = symbolen.map((rij) => rij.map(() => null));
  const binnen = (k, r) => k >= 0 && k < KOLOMMEN && r >= 0 && r < RIJEN;

  const alle = (symbool) => {
    const uit = [];
    symbolen.forEach((rij, r) => rij.forEach((s, k) => { if (s === symbool) uit.push([k, r]); }));
    return uit;
  };
  const starts = alle('S');
  if (starts.length !== 1) throw new LevelFout(`level ${level.id}: ${starts.length} keer S, moet 1`);
  const vloer = leesVloer(level);

  const raster = {
    level,
    start: starts[0],
    alle,
    binnen,
    symbool: (k, r) => (binnen(k, r) ? symbolen[r][k] : null),
    module: (k, r) => (binnen(k, r) ? modules[r][k] : null),
    ding: (k, r) => (binnen(k, r) ? dingen[r][k] : null),
    vloer: (k, r) => (binnen(k, r) ? vloer[r][k] : null), // kleurnaam uit VLOERKLEUREN, of null = neutraal
    dingen: [], // alle dingen, in de volgorde waarin ze geplaatst zijn
    // Regelset 1 en 2: hoogte in eenheden; buiten de kaart of een blokkerend vakje = Infinity.
    hoogte(k, r) {
      if (!binnen(k, r)) return Infinity;
      const m = modules[r][k];
      if (m.blokkeert) return Infinity;
      const d = dingen[r][k];
      return d && d.hoogte !== undefined ? d.hoogte : m.hoogte;
    },
    // Zet een ding op een vrij vakje (ook een antwoordblokje op een vloervakje naast de ?).
    plaats(k, r, ding) {
      if (!binnen(k, r) || dingen[r][k]) throw new LevelFout(`level ${level.id}: vakje ${k},${r} is al bezet`);
      ding.cel = [k, r];
      dingen[r][k] = ding;
      raster.dingen.push(ding);
      return ding;
    },
  };

  symbolen.forEach((rij, r) => rij.forEach((_, k) => {
    const d = modules[r][k].maak?.({ level, cel: [k, r], random, symbool: raster.symbool });
    if (d) raster.plaats(k, r, d);
  }));
  koppel(raster, level);
  // Pas als alles staat en gekoppeld is: de opdracht kiest de vakjes voor zijn antwoordblokjes.
  for (const d of [...raster.dingen]) d.klaar?.(raster);
  return raster;
}

// `vloer` (optioneel): rechthoeken [{kleur, van, tot}] in vakjes; latere gaan over eerdere heen. Per vakje de
// kleurnaam, of null (neutrale vloer). Wat check_inhoud afkeurt, is hier een LevelFout: nooit stil een andere kleur.
function leesVloer(level) {
  const uit = Array.from({ length: RIJEN }, () => Array(KOLOMMEN).fill(null));
  const lijst = level.vloer ?? [];
  if (!Array.isArray(lijst)) throw new LevelFout(`level ${level.id}: vloer is geen lijst`);
  lijst.forEach((v, i) => {
    const sleutels = v && typeof v === 'object' ? Object.keys(v).sort().join() : '';
    const van = vakje(v?.van);
    const tot = vakje(v?.tot);
    if (sleutels !== 'kleur,tot,van' || !VLOERKLEUREN.includes(v.kleur) || !van || !tot) {
      throw new LevelFout(`level ${level.id}: vloer ${i + 1} moet {kleur, van, tot} zijn, kleur uit ${VLOERKLEUREN.join(', ')}`);
    }
    for (let r = Math.min(van[1], tot[1]); r <= Math.max(van[1], tot[1]); r++) {
      for (let k = Math.min(van[0], tot[0]); k <= Math.max(van[0], tot[0]); k++) uit[r][k] = v.kleur;
    }
  });
  return uit;
}

// Koppelingen (DEV.md, Level): een knop (●) of sleutel (o–) opent één klep (D); `van` is het buurvakje aan de
// knopkant. Een klep zonder koppeling blijft dicht. Wat check_levels afkeurt, is hier een LevelFout.
function koppel(raster, level) {
  const lijst = level.koppelingen ?? [];
  if (!Array.isArray(lijst)) throw new LevelFout(`level ${level.id}: koppelingen is geen lijst`);
  lijst.forEach((k, i) => {
    const fout = (wat) => { throw new LevelFout(`level ${level.id}: koppeling ${i + 1}: ${wat}`); };
    const soort = ['knop', 'sleutel'].filter((s) => Object.hasOwn(k ?? {}, s));
    const opener = soort.length === 1 ? vakje(k[soort[0]]) : null;
    const deur = vakje(k?.deur);
    const van = vakje(k?.van);
    const klep = deur && raster.ding(...deur);
    const knop = opener && raster.ding(...opener);
    if (klep?.soort !== 'klep') fout(`deur ${k?.deur} is geen D`);
    if (!knop || knop.soort !== soort[0]) fout(`precies één knop (●) of sleutel (o–) nodig`);
    if (!van || Math.abs(van[0] - deur[0]) + Math.abs(van[1] - deur[1]) !== 1) fout(`van ${k?.van} is geen buurvakje van ${k.deur}`);
    if (klep.van) fout(`deur ${k.deur} staat in meer dan één koppeling`);
    klep.van = van;
    klep.overkant = [2 * deur[0] - van[0], 2 * deur[1] - van[1]];
    knop.kleppen.push(klep);
  });
}
