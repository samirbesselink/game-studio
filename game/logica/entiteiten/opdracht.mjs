// ?: de opdracht (spelregel 1, DEV.md "Uit onderzoek"). Een bonus, nooit een poort.
// - Bij het maken komen de antwoorden (goed + fout) in een geschudde volgorde op vrije vloervakjes (.) hoogstens
//   2 stappen lopen van de ? (om muren heen), met minstens één vakje ertussen. Is daar geen plek die niets
//   afsnijdt, dan een stap verder.
//   Letters A, B, C gaan in leesvolgorde over de blokjes; het antwoord erachter wisselt dus per keer.
// - Een blokje is een blok van hoogte 1: je springt erop (regelset 1: hoogstens +1, dus nooit een muur). De keuze
//   vermijdt vakjes die samen een deel van het level afsnijden, zodat je er ook omheen kunt; lukt dat nergens, dan
//   liggen ze toch op +1 en spring je eroverheen.
// - Getekend is een blokje 1 + 2 x HALF = 1,6 vakje breed (breder dan de tekening van een held): precies waar het
//   midden van de held (zijn voeten) erop staat en ertegen botst (beweging.grondOnder). Twee blokjes staan 2 vakjes
//   uit elkaar: 0,4 vakje kier, en daar staan je voeten op de vloer.
// - Landen op een blokje meldt 'antwoord'. Goed = opgelost: een vitamine, en de blokjes verdwijnen. Fout = de hint;
//   je mag meteen opnieuw. Opgelost blijft opgelost, ook na geraakt worden (spelregel 8).
// - `actief`: de held is in de buurt (ZONE vakjes van de ? of een blokje) en de opdracht is nog open; dan staat de
//   vraag in beeld.
import { LevelFout } from '../fout.mjs';
import { schud } from '../schud.mjs';

export const ZONE = 2;
export const BLOK_HOOGTE = 1; // hoogte-eenheden
export const RING = 2; // hoogstens zoveel stappen lopen van de ?, als daar plek is
const LETTERS = 'ABCDE';
const afstand = ([a, b], [c, d]) => Math.max(Math.abs(a - c), Math.abs(b - d)); // in vakjes, ook schuin

export const opdracht = {
  hoogte: 0,
  beeld: 'opdracht',
  maak({ level, random }) {
    const o = level.opdracht;
    if (!o || typeof o !== 'object') throw new LevelFout(`level ${level.id}: een ? zonder opdracht`);
    const antwoorden = schud(antwoordenVan(o, level.id), random);
    if (antwoorden.length < 2 || antwoorden.length > LETTERS.length) throw new LevelFout(`level ${level.id}: ${antwoorden.length} antwoorden`);
    return {
      soort: 'opdracht',
      vraag: o.vraag,
      hint: o.hint,
      goed: o.goed,
      blokjes: [],
      opgelost: false,
      actief: false,
      klaar(raster) {
        const plekken = kiesPlekken(raster, this.cel, antwoorden.length, level.id).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        this.blokjes = plekken.map(([k, r], i) => raster.plaats(k, r, maakBlokje(this, LETTERS[i], antwoorden[i])));
      },
      naHeld(spel) {
        const cel = spel.held.cel;
        this.actief = !this.opgelost && [this.cel, ...this.blokjes.map((b) => b.cel)].some((c) => afstand(c, cel) <= ZONE);
      },
      antwoord(spel, blokje) {
        if (this.opgelost || blokje.weg) return;
        if (blokje.goed) {
          this.opgelost = true;
          this.actief = false;
          for (const b of this.blokjes) b.weg = true;
          spel.vitamines++;
        }
        spel.meld({ soort: 'antwoord', goed: blokje.goed, letter: blokje.letter, antwoord: blokje.tekst, hint: this.hint });
      },
    };
  },
};

// Meerkeuze: goed + fout, kindteksten {nl, en}. Waar-niet-waar (DEV.md Level): de twee antwoorden zijn de UI-teksten
// 'waar' en 'niet_waar' ({sleutel}, non-negotiable 4); opdracht.goed zegt welke van de twee goed is.
const WAAR = { nl: 'Waar', en: 'True' };
const NIET_WAAR = { nl: 'Niet waar', en: 'False' };
const gelijk = (a, b) => a?.nl === b.nl && a?.en === b.en;

function antwoordenVan(o, id) {
  if (o.vorm === 'meerkeuze') return [{ tekst: o.goed, goed: true }, ...(o.fout ?? []).map((tekst) => ({ tekst, goed: false }))];
  if (o.vorm !== 'waar-niet-waar') throw new LevelFout(`level ${id}: opdrachtvorm '${o.vorm}' kent de game niet`);
  if (!gelijk(o.goed, WAAR) && !gelijk(o.goed, NIET_WAAR)) {
    throw new LevelFout(`level ${id}: waar-niet-waar vraagt goed = Waar/True of Niet waar/False`);
  }
  const waar = gelijk(o.goed, WAAR);
  return [{ tekst: { sleutel: 'waar' }, goed: waar }, { tekst: { sleutel: 'niet_waar' }, goed: !waar }];
}

function maakBlokje(opdracht, letter, { tekst, goed }) {
  return {
    soort: 'antwoord',
    letter,
    tekst,
    goed,
    weg: false,
    get hoogte() { return this.weg ? 0 : BLOK_HOOGTE; },
    landt(spel) { opdracht.antwoord(spel, this); },
  };
}

// Vakjes voor n blokjes: vloer (.) zonder ding, niet het `van`- of overkant-vakje van een klep, bereikbaar vanaf de ?
// zonder door een klep (hoogtes tellen hier niet; de baan van een vlot telt als brug, ruimer dan check_levels: regel X
// telt hier niet),
// onderling minstens één vakje ertussen. Eerst binnen RING stappen
// lopen van de ?, dan steeds een stap verder. Per ring de eerste combinatie (dichtstbij eerst) die niets afsnijdt, anders
// de eerste die wel past.
function kiesPlekken(raster, vraag, n, id) {
  const sleutel = ([k, r]) => `${k},${r}`;
  const brug = new Set(raster.dingen.filter((d) => d.soort === 'vlot').flatMap((d) => d.baan.map(sleutel)));
  const loopbaar = ([k, r]) => raster.binnen(k, r) && (!raster.module(k, r).blokkeert || brug.has(sleutel([k, r])))
    && raster.symbool(k, r) !== 'D';
  const buren = ([k, r]) => [[k + 1, r], [k - 1, r], [k, r + 1], [k, r - 1]];
  const bereik = (zonder) => {
    const gezien = new Map([[sleutel(vraag), { cel: vraag, stappen: 0 }]]);
    const rij = [vraag];
    for (let i = 0; i < rij.length; i++) {
      for (const b of buren(rij[i])) {
        if (!loopbaar(b) || zonder.has(sleutel(b)) || gezien.has(sleutel(b))) continue;
        gezien.set(sleutel(b), { cel: b, stappen: gezien.get(sleutel(rij[i])).stappen + 1 });
        rij.push(b);
      }
    }
    return gezien;
  };
  const alles = bereik(new Set());
  const klepvakjes = new Set(raster.dingen.filter((d) => d.soort === 'klep').flatMap((d) => [d.van, d.overkant]).filter(Boolean).map(sleutel));
  const kandidaten = [...alles.values()]
    .filter(({ cel: [k, r] }) => raster.symbool(k, r) === '.' && !raster.ding(k, r) && !klepvakjes.has(sleutel([k, r])))
    .sort((a, b) => a.stappen - b.stappen || a.cel[1] - b.cel[1] || a.cel[0] - b.cel[0]);
  // Blijft alles rond de ? één geheel als deze vakjes een blok worden?
  const heel = (gekozen) => bereik(new Set(gekozen.map(sleutel))).size === alles.size - gekozen.length;
  // Eerste combinatie van n uit `pool` (in volgorde), onderling een vakje ertussen, en (streng) niets afgesneden.
  const zoek = (pool, streng, gekozen = [], vanaf = 0) => {
    if (gekozen.length === n) return !streng || heel(gekozen) ? gekozen : null;
    for (let i = vanaf; i < pool.length; i++) {
      if (gekozen.some((g) => afstand(g, pool[i]) < 2)) continue;
      if (streng && !heel([...gekozen, pool[i]])) continue;
      const uit = zoek(pool, streng, [...gekozen, pool[i]], i + 1);
      if (uit) return uit;
    }
    return null;
  };
  // Ring = loopafstand in stappen (om muren heen), niet de afstand in rechte lijn: een vakje achter een muur is ver.
  // Eerst in alle ringen een plek die niets afsnijdt (meester 28 okt: "je kunt niet naar de rechterkant"), pas
  // daarna de eerste die wel past.
  const verste = Math.max(0, ...kandidaten.map((c) => c.stappen));
  for (const streng of [true, false]) {
    for (let ring = RING; ring <= Math.max(RING, verste); ring++) {
      const pool = kandidaten.filter((c) => c.stappen <= ring).slice(0, 40).map((c) => c.cel);
      const gekozen = zoek(pool, streng);
      if (gekozen) return gekozen;
    }
  }
  throw new LevelFout(`level ${id}: geen plek voor ${n} antwoordblokjes bij de ?`);
}
