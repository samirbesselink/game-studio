// ★: een ster. Stapt de held erop, dan is hij gepakt en telt de teller één op; na geraakt worden blijft hij gepakt
// (spelregel 8). Met een verzamelpoort telt F pas bij genoeg sterren (finish.mjs).
export const ster = {
  hoogte: 0,
  beeld: 'ster',
  maak: () => ({
    soort: 'ster',
    gepakt: false,
    binnen(spel) {
      if (this.gepakt) return;
      this.gepakt = true;
      spel.sterren++;
      spel.meld({ soort: 'ster', cel: this.cel });
    },
  }),
};
