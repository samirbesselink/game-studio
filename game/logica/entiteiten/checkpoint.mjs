// C: een checkpoint (spelregel 3 en 8). Stapt de held erop, dan is dit de laatste C: geraakt worden zet hem hier
// terug (spel.mjs, terugzetten). Vóór de eerste C gaat hij terug naar S.
export const checkpoint = {
  hoogte: 0,
  beeld: 'checkpoint',
  maak: () => ({
    soort: 'checkpoint',
    bereikt: false,
    binnen(spel) {
      spel.checkpoint = this.cel;
      if (this.bereikt) return;
      this.bereikt = true;
      spel.meld({ soort: 'checkpoint', cel: this.cel });
    },
  }),
};
