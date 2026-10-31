// Een herhaalbare random (mulberry32) uit een geheel getal: voor tests (?seed=). Verandert geen regel, alleen de
// volgorde van het schudden; zonder seed gebruikt de game Math.random.
export function zaadRandom(zaad) {
  let s = zaad | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Schudden (Fisher-Yates) met een meegegeven random (0 <= r < 1), zodat een test de volgorde kan vastzetten.
export function schud(lijst, random = Math.random) {
  const uit = [...lijst];
  for (let i = uit.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [uit[i], uit[j]] = [uit[j], uit[i]];
  }
  return uit;
}
