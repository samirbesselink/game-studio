// F: de finish. Regelset 4: met een verzamelpoort telt F pas bij genoeg sterren.
export const finish = {
  hoogte: 0,
  beeld: 'finish',
  binnen(spel) {
    if (spel.gehaald || spel.sterren < (spel.level.verzamelpoort ?? 0)) return;
    spel.gehaald = true;
    spel.meld({ soort: 'finish' });
  },
};
