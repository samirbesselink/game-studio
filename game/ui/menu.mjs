// Schermen in de DOM: laden, fout, start, held kiezen, eind; plus de beursmodus.
// Alle tekst via data-t (i18n); kindinhoud via zetInhoud.
import { vertaal, zetInhoud } from '../i18n.mjs';

const SCHERMEN = ['laden', 'fout', 'start', 'kies', 'level', 'eind'];
let huidig = 'laden';
let beursklokOpnieuw = null;

export const huidigScherm = () => huidig;

// 'spel' verbergt alle schermen: dan is het canvas het scherm.
// Een nieuw scherm zet de beursklok opnieuw: wie op een traag level wacht, krijgt daarna de volle tijd.
export function toonScherm(naam) {
  huidig = naam;
  beursklokOpnieuw?.();
  for (const s of SCHERMEN) document.getElementById(`scherm-${s}`).hidden = s !== naam;
  const scherm = document.getElementById(`scherm-${naam}`);
  const doel = scherm?.querySelector('[data-focus], button');
  if (doel) doel.focus();
  else document.activeElement?.blur();
}

// Eén kaart per goedgekeurde held: de uitsnede, de naam zoals het kind hem schreef, en de maker.
export function vulHelden(helden, kies) {
  const lijst = document.getElementById('helden');
  const sjabloon = document.getElementById('tpl-kaart');
  lijst.replaceChildren();
  for (const figuur of helden) {
    const kaart = sjabloon.content.firstElementChild.cloneNode(true);
    kaart.dataset.held = figuur.id;
    kaart.querySelector('img').src = `figuren/${figuur.id}.png`;
    zetInhoud(kaart.querySelector('.naam'), figuur.naam);
    zetInhoud(kaart.querySelector('.wie'), { nl: figuur.maker, en: figuur.maker });
    kaart.addEventListener('click', () => kies(figuur.id));
    lijst.append(kaart);
  }
  vertaal(lijst);
}

// Eén kaart per level, op volgorde (wereldnummer): het nummer, de titel en de maker. kies(nr) start dat level.
export function vulLevels(levels, kies) {
  const lijst = document.getElementById('levels');
  const sjabloon = document.getElementById('tpl-levelkaart');
  lijst.replaceChildren();
  levels.forEach((level, nr) => {
    const kaart = sjabloon.content.firstElementChild.cloneNode(true);
    kaart.dataset.level = level.id;
    kaart.querySelector('.nummer').textContent = String(nr + 1);
    zetInhoud(kaart.querySelector('.naam'), level.titel);
    zetInhoud(kaart.querySelector('.wie'), { nl: level.maker, en: level.maker });
    kaart.addEventListener('click', () => kies(nr));
    lijst.append(kaart);
  });
  vertaal(lijst);
}

// Beursmodus (Health Fair): na `seconden` zonder invoer terug naar het startscherm. 0 = uit.
// Ook vanaf 'laden': een level dat blijft hangen, houdt de beurs niet vast.
// altijd (optioneel): na elke periode zonder invoer, op elk scherm (ook start): de beginstand van de stand herstellen.
export function startBeursmodus(seconden, terug, altijd = () => {}) {
  if (!(seconden > 0)) return;
  let klok;
  const opnieuw = () => {
    clearTimeout(klok);
    klok = setTimeout(() => {
      altijd();
      if (['kies', 'level', 'eind', 'spel', 'laden'].includes(huidig)) terug();
      opnieuw();
    }, seconden * 1000);
  };
  for (const soort of ['keydown', 'pointerdown', 'pointermove', 'wheel']) {
    addEventListener(soort, opnieuw, { capture: true, passive: true });
  }
  beursklokOpnieuw = opnieuw;
  opnieuw();
}
