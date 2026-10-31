// Een fout in de inhoud van een level (niet in het netwerk of de computer); main.mjs toont er een eigen tekst bij.
export class LevelFout extends Error {
  name = 'LevelFout';
}
