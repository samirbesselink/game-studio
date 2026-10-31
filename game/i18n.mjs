// Alle tekst die een kind ziet, komt hier langs (non-negotiable 4).
// UI-tekst: sleutels uit inhoud/teksten/{nl,en}.json, via t(sleutel) of het attribuut data-t in de DOM.
// tools/bouw.mjs zoekt alle gebruikte sleutels in game/ op en laat de build falen als er één ontbreekt.
// Kindinhoud (leveltitel, figuurnaam): {nl, en} uit de goedgekeurde inhoud, via zetInhoud().
// Een onbekende sleutel of een lege tekst is een fout, nooit een stille terugval.

export const TALEN = ['nl', 'en'];
let teksten = null;
let huidig = 'nl';

const nietLeeg = (v) => typeof v === 'string' && v.trim() !== '';

export function laadTeksten(bundel) {
  for (const taal of TALEN) if (!bundel?.[taal]) throw new Error(`teksten: ${taal} ontbreekt`);
  const [a, b] = TALEN.map((taal) => Object.keys(bundel[taal]));
  const verschil = [...a.filter((k) => !b.includes(k)), ...b.filter((k) => !a.includes(k))];
  if (verschil.length) throw new Error(`teksten: sleutels niet in beide talen: ${verschil.join(', ')}`);
  for (const taal of TALEN) {
    for (const [k, v] of Object.entries(bundel[taal])) if (!nietLeeg(v)) throw new Error(`teksten: ${taal}.${k} is leeg`);
  }
  teksten = bundel;
}

export const taal = () => huidig;

export function t(sleutel) {
  const tekst = teksten?.[huidig]?.[sleutel];
  if (!nietLeeg(tekst)) throw new Error(`i18n: onbekende sleutel '${sleutel}' (${huidig})`);
  return tekst;
}

// Kindinhoud in een element zetten; bij een taalwissel kiest vertaal() hem opnieuw.
export function zetInhoud(el, obj) {
  for (const taal of TALEN) if (!nietLeeg(obj?.[taal])) throw new Error(`i18n: inhoudstekst zonder ${taal}`);
  el.dataset.inhoud = '';
  el.dataset.nl = obj.nl;
  el.dataset.en = obj.en;
  el.textContent = obj[huidig];
}

export function vertaal(wortel = document) {
  for (const el of wortel.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of wortel.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  for (const el of wortel.querySelectorAll('[data-inhoud]')) el.textContent = el.dataset[huidig];
  if (wortel === document) {
    document.documentElement.lang = huidig;
    document.title = t('titel');
  }
}

export function zetTaal(nieuw) {
  if (!TALEN.includes(nieuw)) throw new Error(`i18n: onbekende taal '${nieuw}'`);
  huidig = nieuw;
  vertaal(document);
}
