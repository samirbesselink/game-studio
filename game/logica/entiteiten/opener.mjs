// ● (knop) en o– (sleutel): stapt de held op dit vakje, dan gaan de gekoppelde kleppen open en blijven open
// (spelregel 2). Net als in check_levels telt alleen dat de opener bereikt is.
export const opener = (soort) => ({
  hoogte: 0,
  beeld: soort,
  maak: () => ({
    soort,
    ingedrukt: false,
    kleppen: [], // raster.mjs vult dit vanuit de koppelingen
    binnen(spel) {
      if (this.ingedrukt) return;
      this.ingedrukt = true;
      for (const k of this.kleppen) k.open = true;
      spel.meld({ soort, cel: this.cel, kleppen: this.kleppen.length });
    },
  }),
});
