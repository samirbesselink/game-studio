// Terrein: vloer, muur, water, lava en de hoogtes 1-3 (regelset 1 en 2 in DEV.md, Datacontract v1).

export const vloer = { hoogte: 0 };

// M blokkeert altijd, ook als de held hoger staat.
export const muur = { hoogte: 0, blokkeert: true, beeld: 'muur' };

// W en L blokkeren zoals een muur; alleen boven een vlot is het vloer (platform.mjs, beweging.magNaar).
export const water = { hoogte: 0, blokkeert: true, beeld: 'water' };
export const lava = { hoogte: 0, blokkeert: true, beeld: 'lava' };

// '1', '2', '3': een blok van zoveel hoogte-eenheden; bovenop kun je staan.
export const trede = (n) => ({ hoogte: n, beeld: 'trede' });
