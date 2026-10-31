// D: een klep (spelregel 2, regelset 3). Dicht tot zijn opener bereikt is, daarna open en eenrichting, zoals
// bloed: alleen in vanaf `van` (de knopkant) en alleen uit naar het vakje recht tegenover `van`. Niet terug, niet
// zijwaarts. Een klep zonder koppeling blijft dicht; een open klep gaat nooit meer dicht (ook niet na geraakt worden).
// `van` en `overkant` zet raster.mjs vanuit de koppeling.
const zelfde = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

export const klep = {
  hoogte: 0,
  beeld: 'klep',
  maak: () => ({
    soort: 'klep',
    open: false,
    van: null,
    overkant: null,
    get hoogte() { return this.open ? 0 : Infinity; },
    magIn(van) { return zelfde(van, this.van); },
    magUit(naar) { return zelfde(naar, this.overkant); },
    // Binnen de klep alleen met de stroom mee (van → overkant), nooit terug: ook niet als de held er nog half in staat.
    magRichting(dk, dr) {
      if (!this.van) return true;
      return (this.overkant[0] - this.van[0]) * dk + (this.overkant[1] - this.van[1]) * dr >= 0;
    },
  }),
};
